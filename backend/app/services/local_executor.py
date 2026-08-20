import os
import re
import sys
import time
import shutil
import logging
import platform
import tempfile
import traceback
import subprocess
from typing import Dict, Any, Optional

logger = logging.getLogger("local_executor")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    formatter = logging.Formatter("[%(asctime)s][%(levelname)s][%(name)s] %(message)s")
    ch.setFormatter(formatter)
    logger.addHandler(ch)

DEFAULT_TIMEOUT_SECONDS = 15.0
MAX_OUTPUT_BYTES = 500000  # 500 KB limit for stdout/stderr to prevent memory bloat

# Static security filter: blocks student code that attempts to reach outside
# the sandbox. This is a defense-in-depth layer, NOT a substitute for a real
# sandbox (containers / Judge0).
BLOCKED_PATTERNS = [
    r"\bimport\s+os\b",
    r"\bfrom\s+os\b",
    r"\bimport\s+subprocess\b",
    r"\bfrom\s+subprocess\b",
    r"\bimport\s+socket\b",
    r"\bfrom\s+socket\b",
    r"\bimport\s+shutil\b",
    r"\bimport\s+pathlib\b",
    r"\bimport\s+ctypes\b",
    r"\bimport\s+importlib\b",
    r"\bimport\s+pickle\b",
    r"\bimport\s+multiprocessing\b",
    r"\bimport\s+pty\b",
    r"\bimport\s+threading\b",
    r"\bimport\s+requests\b",
    r"\bimport\s+urllib\b",
    r"\bimport\s+http\b",
    r"\bimport\s+ftplib\b",
    r"\bimport\s+telnetlib\b",
    r"\bimport\s+paramiko\b",
    r"\bimport\s+site\b",
    r"\bimport\s+runpy\b",
    r"\bimport\s+code\b",
    r"\bimport\s+tempfile\b",
    r"\b__import__\b",
    r"\beval\s*\(",
    r"\bexec\s*\(",
    r"\bcompile\s*\(",
    r"\bopen\s*\(",
    r"\bos\.system\b",
    r"\bos\.popen\b",
    r"\bos\.fork\b",
    r"\bos\.exec",
    r"\.__subclasses__\s*\(",
    r"\.__globals__\b",
    r"\.__builtins__\b",
    r"\.__import__\b",
    r"\bsubprocess\.",
    r"\bctypes\.",
    r"\bshutil\.",
    r"\bpathlib\.",
    r"\bglobals\s*\(",
    r"\bsystem\s*\(",
    r"\bpopen\s*\(",
]

# For C/C++: block process/network manipulation.
BLOCKED_PATTERNS_C = [
    r"\bsystem\s*\(",
    r"\bpopen\s*\(",
    r"\bexecl\s*\(",
    r"\bexecv\s*\(",
    r"\bfork\s*\(",
    r"\bexecvp\s*\(",
    r"\bsocket\s*\(",
    r"\bunlink\s*\(",
    r"\bremove\s*\(",
    r"\brename\s*\(",
    r"\bmkdir\s*\(",
    r"\brmdir\s*\(",
    r"\bchmod\s*\(",
    r"\bchown\s*\(",
    r"\bfopen\s*\(",
    r"\bfreopen\s*\(",
]


def _scan_for_blocked_code(source_code: str, language: str) -> Optional[str]:
    """Return a human-readable description if the source looks dangerous, else None."""
    normalized = re.sub(r"\s+", " ", (source_code or "").lower())
    patterns = BLOCKED_PATTERNS_C if language in ("c", "cpp") else BLOCKED_PATTERNS
    for pat in patterns:
        if re.search(pat, normalized):
            return f"Code execution blocked: use of pattern '{pat}' is not allowed in this environment"
    return None


def _kill_process_tree(process: subprocess.Popen):
    """Force-kill a process and its children on both POSIX and Windows."""
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                timeout=5,
            )
        else:
            os.killpg(process.pid, 9)
    except Exception:
        pass
    try:
        process.kill()
        process.wait()
    except Exception:
        pass


def _container_id() -> str:
    """Return the Docker container ID when running inside Docker.

    Docker sets HOSTNAME to a 12-character container ID (or a Render
    replica-* hostname). Falls back to 'local-machine' outside Docker.
    """
    hostname = os.environ.get("HOSTNAME", "").strip()
    if hostname:
        if hostname.startswith("replica-") or "/" not in hostname:
            return hostname
    return "local-machine"


COMPILER_LABELS = {
    "python": "Python 3",
    "java": "OpenJDK javac/java",
    "c": "gcc",
    "cpp": "g++",
}


def _find_python_cmd() -> Optional[str]:
    """Detect available python interpreter command or path."""
    if sys.executable and os.path.exists(sys.executable):
        return sys.executable
    for cmd in ["python3", "python"]:
        path = shutil.which(cmd)
        if path and "WindowsApps" not in path:
            return path
    if shutil.which("python3"):
        return shutil.which("python3")
    if shutil.which("python"):
        return shutil.which("python")
    return None


def _find_javac() -> Optional[str]:
    """Detect available javac compiler command or path."""
    if shutil.which("javac"):
        return shutil.which("javac")
    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        candidate = os.path.join(java_home, "bin", "javac.exe" if sys.platform == "win32" else "javac")
        if os.path.exists(candidate):
            return candidate
    if sys.platform == "win32":
        oracle_path = r"C:\Program Files\Common Files\Oracle\Java\javapath\javac.exe"
        if os.path.exists(oracle_path):
            return oracle_path
        jdk_dirs = [r"C:\Program Files\Java", r"C:\Program Files\Eclipse Adoptium"]
        for base_dir in jdk_dirs:
            if os.path.exists(base_dir):
                for folder in os.listdir(base_dir):
                    candidate = os.path.join(base_dir, folder, "bin", "javac.exe")
                    if os.path.exists(candidate):
                        return candidate
    else:
        linux_paths = [
            "/usr/bin/javac",
            "/usr/local/bin/javac",
            "/usr/lib/jvm/default-java/bin/javac",
            "/usr/lib/jvm/java-17-openjdk-amd64/bin/javac",
            "/usr/lib/jvm/java-17-openjdk-arm64/bin/javac",
            "/usr/lib/jvm/java-11-openjdk-amd64/bin/javac",
            "/usr/lib/jvm/java-11-openjdk-arm64/bin/javac",
            "/usr/lib/jvm/java-21-openjdk-amd64/bin/javac",
            "/usr/lib/jvm/java-21-openjdk-arm64/bin/javac",
        ]
        for path in linux_paths:
            if os.path.exists(path):
                return path
        if os.path.exists("/usr/lib/jvm"):
            try:
                for folder in os.listdir("/usr/lib/jvm"):
                    candidate = os.path.join("/usr/lib/jvm", folder, "bin", "javac")
                    if os.path.exists(candidate):
                        return candidate
            except Exception:
                pass
    return None


def _find_java() -> Optional[str]:
    """Detect available java runtime command or path."""
    if shutil.which("java"):
        return shutil.which("java")
    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        candidate = os.path.join(java_home, "bin", "java.exe" if sys.platform == "win32" else "java")
        if os.path.exists(candidate):
            return candidate
    if sys.platform == "win32":
        oracle_path = r"C:\Program Files\Common Files\Oracle\Java\javapath\java.exe"
        if os.path.exists(oracle_path):
            return oracle_path
        jdk_dirs = [r"C:\Program Files\Java", r"C:\Program Files\Eclipse Adoptium"]
        for base_dir in jdk_dirs:
            if os.path.exists(base_dir):
                for folder in os.listdir(base_dir):
                    candidate = os.path.join(base_dir, folder, "bin", "java.exe")
                    if os.path.exists(candidate):
                        return candidate
    else:
        linux_paths = [
            "/usr/bin/java",
            "/usr/local/bin/java",
            "/usr/lib/jvm/default-java/bin/java",
            "/usr/lib/jvm/java-17-openjdk-amd64/bin/java",
            "/usr/lib/jvm/java-17-openjdk-arm64/bin/java",
            "/usr/lib/jvm/java-11-openjdk-amd64/bin/java",
            "/usr/lib/jvm/java-11-openjdk-arm64/bin/java",
            "/usr/lib/jvm/java-21-openjdk-amd64/bin/java",
            "/usr/lib/jvm/java-21-openjdk-arm64/bin/java",
        ]
        for path in linux_paths:
            if os.path.exists(path):
                return path
        if os.path.exists("/usr/lib/jvm"):
            try:
                for folder in os.listdir("/usr/lib/jvm"):
                    candidate = os.path.join("/usr/lib/jvm", folder, "bin", "java")
                    if os.path.exists(candidate):
                        return candidate
            except Exception:
                pass
    return None


def _find_gcc() -> Optional[str]:
    """Detect available C compiler (gcc) command or path."""
    if shutil.which("gcc"):
        return shutil.which("gcc")
    if sys.platform == "win32":
        common_paths = [
            r"C:\mingw64\bin\gcc.exe",
            r"C:\MinGW\bin\gcc.exe",
            r"C:\msys64\ucrt64\bin\gcc.exe",
            r"C:\msys64\mingw64\bin\gcc.exe",
            r"C:\winlibs\bin\gcc.exe",
        ]
        for path in common_paths:
            if os.path.exists(path):
                return path
    else:
        for path in ["/usr/bin/gcc", "/usr/local/bin/gcc"]:
            if os.path.exists(path):
                return path
    return None


def _find_gpp() -> Optional[str]:
    """Detect available C++ compiler (g++) command or path."""
    if shutil.which("g++"):
        return shutil.which("g++")
    if sys.platform == "win32":
        common_paths = [
            r"C:\mingw64\bin\g++.exe",
            r"C:\MinGW\bin\g++.exe",
            r"C:\msys64\ucrt64\bin\g++.exe",
            r"C:\msys64\mingw64\bin\g++.exe",
            r"C:\winlibs\bin\g++.exe",
        ]
        for path in common_paths:
            if os.path.exists(path):
                return path
    else:
        for path in ["/usr/bin/g++", "/usr/local/bin/g++"]:
            if os.path.exists(path):
                return path
    return None


def extract_java_class_name(source_code: str) -> str:
    """Extract public class name or first class name from Java source code, defaulting to 'Main'."""
    public_match = re.search(r"public\s+class\s+([A-Za-z_][A-Za-z0-9_]*)", source_code)
    if public_match:
        return public_match.group(1)
    class_match = re.search(r"class\s+([A-Za-z_][A-Za-z0-9_]*)", source_code)
    if class_match:
        return class_match.group(1)
    return "Main"


class LocalCodeExecutor:
    """Local compiler and code execution engine for Java, Python, C, and C++."""

    @staticmethod
    def normalize_language(lang: str) -> str:
        lang_clean = (lang or "").lower().strip()
        if lang_clean in ("python", "py", "python3"):
            return "python"
        elif lang_clean in ("java",):
            return "java"
        elif lang_clean in ("c",):
            return "c"
        elif lang_clean in ("cpp", "c++", "c_plus_plus"):
            return "cpp"
        return lang_clean

    @classmethod
    def check_compilers(cls) -> Dict[str, Dict[str, Any]]:
        """
        Verify compiler availability, executable path, and version string for
        python, python3, java, javac, gcc, g++.
        """
        compilers = {}

        # 1. Python
        py_path = _find_python_cmd()
        compilers["python"] = cls._get_tool_info(py_path, ["--version"])

        # 2. Python3
        py3_path = shutil.which("python3")
        compilers["python3"] = cls._get_tool_info(py3_path, ["--version"])

        # 3. Java
        java_path = _find_java()
        compilers["java"] = cls._get_tool_info(java_path, ["-version"])

        # 4. Javac
        javac_path = _find_javac()
        compilers["javac"] = cls._get_tool_info(javac_path, ["-version"])

        # 5. GCC
        gcc_path = _find_gcc()
        compilers["gcc"] = cls._get_tool_info(gcc_path, ["--version"])

        # 6. G++
        gpp_path = _find_gpp()
        compilers["g++"] = cls._get_tool_info(gpp_path, ["--version"])

        return compilers

    @staticmethod
    def _get_tool_info(tool_path: Optional[str], version_flag: list) -> Dict[str, Any]:
        if not tool_path:
            return {
                "available": False,
                "version": "Not installed",
                "path": None,
            }
        try:
            res = subprocess.run(
                [tool_path] + version_flag,
                capture_output=True,
                text=True,
                timeout=3,
            )
            raw_v = (res.stdout or res.stderr or "").strip()
            first_line = raw_v.splitlines()[0] if raw_v else "Available"
            return {
                "available": True,
                "version": first_line,
                "path": tool_path,
            }
        except Exception as e:
            return {
                "available": True,
                "version": f"Available (version check failed: {str(e)})",
                "path": tool_path,
            }

    @classmethod
    def get_diagnostics(cls) -> Dict[str, Any]:
        """Return system-wide diagnostic information including compiler availability."""
        return {
            "operating_system": platform.platform(),
            "os_name": os.name,
            "system": platform.system(),
            "release": platform.release(),
            "architecture": platform.architecture()[0],
            "python_version": sys.version.split()[0],
            "current_working_directory": os.getcwd(),
            "path_environment": os.environ.get("PATH", ""),
            "compilers": cls.check_compilers(),
        }

    @staticmethod
    def _finalize(result: Dict[str, Any], norm_lang: str) -> Dict[str, Any]:
        """Attach compiler + container metadata to an execution result."""
        result = dict(result or {})
        result["compiler"] = COMPILER_LABELS.get(norm_lang, norm_lang)
        result["container_id"] = _container_id()
        return result

    @classmethod
    def execute(
        cls,
        source_code: str,
        language: str,
        stdin: str = "",
        expected_output: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> Dict[str, Any]:
        norm_lang = cls.normalize_language(language)
        from app.config import settings

        # Apply language-specific timeout defaults if generic timeout passed
        if timeout == DEFAULT_TIMEOUT_SECONDS or timeout < 15.0:
            if norm_lang == "python":
                timeout = float(getattr(settings, "TIMEOUT_PYTHON", 15.0))
            elif norm_lang == "c":
                timeout = float(getattr(settings, "TIMEOUT_C", 15.0))
            elif norm_lang == "cpp":
                timeout = float(getattr(settings, "TIMEOUT_CPP", 15.0))
            elif norm_lang == "java":
                timeout = float(getattr(settings, "TIMEOUT_JAVA", 15.0))

        logger.info(
            f"[Execution Module] Starting submission (Language: {norm_lang}, Timeout: {timeout}s, "
            f"Container: {_container_id()})"
        )

        if norm_lang not in ("python", "java", "c", "cpp"):
            return cls._finalize(cls._evaluate_result(
                stdout="",
                stderr=f"Unsupported language: {language}",
                compile_output=f"Unsupported language: {language}",
                exit_code=1,
                exec_time=0.0,
                memory_kb=0,
                timed_out=False,
                expected_output=expected_output,
                is_compilation_failure=True,
                language=norm_lang,
            ), norm_lang)

        # The in-process executor is the development/test engine only. In
        # production the judge runs in Docker; this guard refuses to execute
        # code locally unless JUDGE_ENGINE explicitly says "local".
        if getattr(settings, "JUDGE_ENGINE", "docker") != "local":
            return cls._finalize(cls._evaluate_result(
                stdout="",
                stderr="Local code execution is disabled (JUDGE_ENGINE != local)",
                compile_output="",
                exit_code=1,
                exec_time=0.0,
                memory_kb=0,
                timed_out=False,
                expected_output=expected_output,
                is_compilation_failure=False,
                language=norm_lang,
            ), norm_lang)

        # Static security filter (defense-in-depth)
        blocked_reason = _scan_for_blocked_code(source_code, norm_lang)
        if blocked_reason:
            logger.warning(f"[Execution Module] Blocked code submission ({norm_lang}): {blocked_reason}")
            return cls._finalize(cls._evaluate_result(
                stdout="",
                stderr=blocked_reason,
                compile_output=blocked_reason,
                exit_code=1,
                exec_time=0.0,
                memory_kb=0,
                timed_out=False,
                expected_output=expected_output,
                is_compilation_failure=True,
                language=norm_lang,
            ), norm_lang)

        memory_limit_kb = int(getattr(settings, "CODE_MEMORY_LIMIT_KB", 262144) or 262144)

        # Temporary working directory per submission with automatic cleanup
        with tempfile.TemporaryDirectory(prefix="code_exec_") as temp_dir:
            logger.info(f"[Execution Module] Created isolated temp directory: {temp_dir}")
            try:
                if norm_lang == "python":
                    res = cls._run_python(source_code, stdin, expected_output, timeout, temp_dir, memory_limit_kb)
                elif norm_lang == "java":
                    res = cls._run_java(source_code, stdin, expected_output, timeout, temp_dir, memory_limit_kb)
                elif norm_lang == "c":
                    res = cls._run_c(source_code, stdin, expected_output, timeout, temp_dir, memory_limit_kb)
                elif norm_lang == "cpp":
                    res = cls._run_cpp(source_code, stdin, expected_output, timeout, temp_dir, memory_limit_kb)
                else:
                    res = cls._evaluate_result(
                        stdout="", stderr="Unsupported language", compile_output="",
                        exit_code=1, exec_time=0.0, memory_kb=0, timed_out=False,
                        expected_output=expected_output, is_compilation_failure=True,
                        language=norm_lang,
                    )
                return cls._finalize(res, norm_lang)
            except Exception as e:
                logger.error(f"[Execution Module] Unexpected execution exception: {str(e)}", exc_info=True)
                return cls._finalize(cls._evaluate_result(
                    stdout="",
                    stderr=str(e),
                    compile_output="",
                    exit_code=1,
                    exec_time=0.0,
                    memory_kb=0,
                    timed_out=False,
                    expected_output=expected_output,
                    is_compilation_failure=False,
                    language=norm_lang,
                ), norm_lang)

    @classmethod
    def _evaluate_result(
        cls,
        stdout: str,
        stderr: str,
        compile_output: str,
        exit_code: int,
        exec_time: float,
        memory_kb: int = 0,
        timed_out: bool = False,
        is_memory_exceeded: bool = False,
        expected_output: Optional[str] = None,
        is_compilation_failure: bool = False,
        is_missing_compiler: bool = False,
        language: str = "python",
    ) -> Dict[str, Any]:
        """Format verdict into a standardized Judge0-compatible output dictionary."""
        clean_stdout = stdout.strip() if stdout else ""
        clean_stderr = stderr.strip() if stderr else ""
        clean_compile = compile_output.strip() if compile_output else ""

        # OOM detection heuristics from exit codes & stderr
        if not is_memory_exceeded:
            if exit_code in (-9, 137, 139) or "OutOfMemory" in clean_stderr or "bad_alloc" in clean_stderr or "MemoryLimitError" in clean_stderr:
                is_memory_exceeded = True

        if is_missing_compiler:
            exec_status = "compiler_not_installed"
            desc = "Compiler Not Installed"
        elif is_compilation_failure:
            exec_status = "compilation_error"
            desc = "Compilation Error"
        elif timed_out:
            exec_status = "time_limit_exceeded"
            desc = "Time Limit Exceeded"
            clean_stderr = clean_stderr or "Execution timed out (Time Limit Exceeded)"
        elif is_memory_exceeded:
            exec_status = "memory_limit_exceeded"
            desc = "Memory Limit Exceeded"
            clean_stderr = clean_stderr or "Memory limit exceeded (Out of Memory)"
        elif exit_code != 0:
            exec_status = "runtime_error"
            desc = "Runtime Error"
        else:
            if expected_output is not None:
                clean_expected = expected_output.strip()
                if clean_stdout == clean_expected:
                    exec_status = "accepted"
                    desc = "Accepted"
                else:
                    exec_status = "wrong_answer"
                    desc = "Wrong Answer"
            else:
                exec_status = "accepted"
                desc = "Accepted"

        error_msg = clean_stderr or clean_compile if exec_status in ("compilation_error", "runtime_error", "time_limit_exceeded", "memory_limit_exceeded", "compiler_not_installed") else clean_stderr

        rounded_time = round(exec_time, 3)

        return {
            "status": exec_status,
            "status_description": desc,
            "stdout": stdout,
            "stderr": stderr,
            "compile_output": compile_output,
            "exitCode": exit_code,
            "exit_code": exit_code,
            "executionTime": rounded_time,
            "execution_time": rounded_time,
            "memory": memory_kb,
            "memory_used": memory_kb,
            "language": language,
            "output": stdout,
            "error": error_msg,
        }

    @classmethod
    def _run_subprocess(
        cls,
        cmd: list,
        stdin_data: str,
        timeout: float,
        cwd: str,
        memory_limit_kb: int = 0,
    ) -> tuple[str, str, int, float, bool, int]:
        """Execute a subprocess with stdin, stdout, stderr capture, resource limits and memory measurement."""
        start_time = time.perf_counter()

        logger.info(f"[Execution Subprocess] Running command: {' '.join(cmd)} (CWD: {cwd})")

        popen_kwargs = {
            "stdin": subprocess.PIPE,
            "stdout": subprocess.PIPE,
            "stderr": subprocess.PIPE,
            "text": True,
            "cwd": cwd,
            "encoding": "utf-8",
            "errors": "replace",
        }
        if sys.platform == "win32":
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            popen_kwargs["start_new_session"] = True
            def _limit_resources():
                import resource
                if memory_limit_kb > 0:
                    bytes_limit = int(memory_limit_kb) * 1024
                    try:
                        resource.setrlimit(resource.RLIMIT_AS, (bytes_limit, bytes_limit))
                    except Exception:
                        pass
                    try:
                        resource.setrlimit(resource.RLIMIT_DATA, (bytes_limit, bytes_limit))
                    except Exception:
                        pass
                # Limit process explosion (fork bombs)
                try:
                    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
                except Exception:
                    pass
                # Limit max file output creation
                try:
                    resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
                except Exception:
                    pass
            popen_kwargs["preexec_fn"] = _limit_resources

        try:
            process = subprocess.Popen(cmd, **popen_kwargs)
            stdout, stderr = process.communicate(input=stdin_data, timeout=timeout)
            exec_time = time.perf_counter() - start_time

            # Measure peak RSS memory usage on POSIX
            memory_kb = 0
            if sys.platform != "win32":
                try:
                    import resource
                    rusage = resource.getrusage(resource.RUSAGE_CHILDREN)
                    memory_kb = int(rusage.ru_maxrss)
                except Exception:
                    memory_kb = 0

            # Cap output sizes to avoid RAM exhaustion
            if len(stdout) > MAX_OUTPUT_BYTES:
                stdout = stdout[:MAX_OUTPUT_BYTES] + "\n... [Output Truncated]"
            if len(stderr) > MAX_OUTPUT_BYTES:
                stderr = stderr[:MAX_OUTPUT_BYTES] + "\n... [Stderr Truncated]"

            logger.info(f"[Execution Subprocess] Finished in {exec_time:.3f}s with exit code {process.returncode} (Peak RSS: {memory_kb} KB)")
            return stdout, stderr, process.returncode, exec_time, False, memory_kb
        except subprocess.TimeoutExpired:
            exec_time = time.perf_counter() - start_time
            logger.warning(f"[Execution Subprocess] Command timed out after {timeout}s: {' '.join(cmd)}")
            _kill_process_tree(process)
            return "", "Time Limit Exceeded", 124, exec_time, True, 0
        except Exception as e:
            exec_time = time.perf_counter() - start_time
            logger.error(
                f"[Execution Subprocess] Exception during execution: {str(e)}\n{traceback.format_exc()}"
            )
            return "", str(e), 1, exec_time, False, 0

    @classmethod
    def _run_python(
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str,
        memory_limit_kb: int = 0,
    ) -> Dict[str, Any]:
        py_file = os.path.join(temp_dir, "solution.py")
        with open(py_file, "w", encoding="utf-8") as f:
            f.write(source_code)

        python_cmd = _find_python_cmd() or "python"
        cmd = [python_cmd, "-I", py_file]

        stdout, stderr, exit_code, exec_time, timed_out, memory_kb = cls._run_subprocess(
            cmd, stdin, timeout, temp_dir, memory_limit_kb
        )

        is_compilation_error = False
        if exit_code != 0 and ("SyntaxError:" in stderr or "IndentationError:" in stderr or "TabError:" in stderr):
            is_compilation_error = True

        return cls._evaluate_result(
            stdout=stdout,
            stderr=stderr,
            compile_output=stderr if is_compilation_error else "",
            exit_code=exit_code,
            exec_time=exec_time,
            memory_kb=memory_kb,
            timed_out=timed_out,
            expected_output=expected_output,
            is_compilation_failure=is_compilation_error,
            language="python",
        )

    @classmethod
    def _run_java(
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str,
        memory_limit_kb: int = 0,
    ) -> Dict[str, Any]:
        javac_bin = _find_javac()
        java_bin = _find_java()

        if not javac_bin or not java_bin:
            err_msg = "Java compiler (javac) or runtime (java) is not installed on this system."
            logger.warning(f"[Execution Module] Java check failed: {err_msg}")
            return cls._evaluate_result(
                stdout="",
                stderr=err_msg,
                compile_output=err_msg,
                exit_code=1,
                exec_time=0.0,
                memory_kb=0,
                timed_out=False,
                expected_output=expected_output,
                is_missing_compiler=True,
                language="java",
            )

        class_name = extract_java_class_name(source_code)
        
        # Write to class_name.java (e.g. Main.java) inside isolated temp_dir
        java_filename = f"{class_name}.java"
        java_file = os.path.join(temp_dir, java_filename)

        with open(java_file, "w", encoding="utf-8") as f:
            f.write(source_code)

        # IMPORTANT (Issue 5): the JVM reserves a very large *virtual* address
        # space. Enforcing RLIMIT_AS (used for the C/Python runtimes) crashes
        # both `javac` and `java` with "Could not reserve enough space for
        # object heap". We therefore skip RLIMIT_AS for Java and enforce the
        # memory limit exclusively through the JVM heap flag (-Xmx).

        # Step 1: Compile javac Main.java (or ClassName.java) in temp_dir
        compile_cmd = [javac_bin, "-J-Xmx384m", java_filename]
        stdout_c, stderr_c, exit_code_c, compile_time, timed_out_c, memory_c = cls._run_subprocess(
            compile_cmd, "", timeout, temp_dir, 0
        )

        if exit_code_c != 0 or timed_out_c:
            logger.warning(f"[Execution Module] Java compilation failed (Exit code: {exit_code_c}): {stderr_c}")
            return cls._evaluate_result(
                stdout=stdout_c,
                stderr=stderr_c,
                compile_output=stderr_c or "Java compilation failed",
                exit_code=exit_code_c,
                exec_time=compile_time,
                memory_kb=memory_c,
                timed_out=timed_out_c,
                expected_output=expected_output,
                is_compilation_failure=True,
                language="java",
            )

        # Step 2: Run java -Xmx<limit>m -cp . ClassName in temp_dir (memory
        # limit enforced by the JVM heap instead of RLIMIT_AS).
        heap_mb = max(int(memory_limit_kb) // 1024 - 64, 128) if memory_limit_kb > 0 else 256
        run_cmd = [java_bin, f"-Xmx{heap_mb}m", "-Dfile.encoding=UTF-8", "-cp", ".", class_name]
        stdout, stderr, exit_code, exec_time, timed_out, memory_kb = cls._run_subprocess(
            run_cmd, stdin, timeout, temp_dir, 0
        )

        return cls._evaluate_result(
            stdout=stdout,
            stderr=stderr,
            compile_output="",
            exit_code=exit_code,
            exec_time=exec_time,
            memory_kb=memory_kb,
            timed_out=timed_out,
            expected_output=expected_output,
            is_compilation_failure=False,
            language="java",
        )

    @classmethod
    def _run_c(
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str,
        memory_limit_kb: int = 0,
    ) -> Dict[str, Any]:
        gcc_bin = _find_gcc()
        if not gcc_bin:
            err_msg = "C compiler (gcc) is not installed on this system."
            logger.warning(f"[Execution Module] C check failed: {err_msg}")
            return cls._evaluate_result(
                stdout="",
                stderr=err_msg,
                compile_output=err_msg,
                exit_code=1,
                exec_time=0.0,
                memory_kb=0,
                timed_out=False,
                expected_output=expected_output,
                is_missing_compiler=True,
                language="c",
            )

        c_filename = "main.c"
        c_file = os.path.join(temp_dir, c_filename)
        with open(c_file, "w", encoding="utf-8") as f:
            f.write(source_code)

        is_win = sys.platform == "win32"
        exe_filename = "main.exe" if is_win else "main"
        exe_path = os.path.join(temp_dir, exe_filename)

        # Step 1: Compile gcc main.c -o main (or main.exe)
        compile_cmd = [gcc_bin, c_filename, "-o", exe_filename, "-lm"]
        stdout_c, stderr_c, exit_code_c, compile_time, timed_out_c, memory_c = cls._run_subprocess(
            compile_cmd, "", timeout, temp_dir, memory_limit_kb
        )

        if exit_code_c != 0 or timed_out_c:
            logger.warning(f"[Execution Module] C compilation failed (Exit code: {exit_code_c}): {stderr_c}")
            return cls._evaluate_result(
                stdout=stdout_c,
                stderr=stderr_c,
                compile_output=stderr_c or "C compilation failed",
                exit_code=exit_code_c,
                exec_time=compile_time,
                memory_kb=memory_c,
                timed_out=timed_out_c,
                expected_output=expected_output,
                is_compilation_failure=True,
                language="c",
            )

        # Step 2: Run executable (main.exe on Windows, ./main on Linux)
        run_cmd = [exe_path] if is_win else [f"./{exe_filename}"]
        stdout, stderr, exit_code, exec_time, timed_out, memory_kb = cls._run_subprocess(
            run_cmd, stdin, timeout, temp_dir, memory_limit_kb
        )

        return cls._evaluate_result(
            stdout=stdout,
            stderr=stderr,
            compile_output="",
            exit_code=exit_code,
            exec_time=exec_time,
            memory_kb=memory_kb,
            timed_out=timed_out,
            expected_output=expected_output,
            is_compilation_failure=False,
            language="c",
        )

    @classmethod
    def _run_cpp(
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str,
        memory_limit_kb: int = 0,
    ) -> Dict[str, Any]:
        gpp_bin = _find_gpp()
        if not gpp_bin:
            err_msg = "C++ compiler (g++) is not installed on this system."
            logger.warning(f"[Execution Module] C++ check failed: {err_msg}")
            return cls._evaluate_result(
                stdout="",
                stderr=err_msg,
                compile_output=err_msg,
                exit_code=1,
                exec_time=0.0,
                memory_kb=0,
                timed_out=False,
                expected_output=expected_output,
                is_missing_compiler=True,
                language="cpp",
            )

        cpp_filename = "main.cpp"
        cpp_file = os.path.join(temp_dir, cpp_filename)
        with open(cpp_file, "w", encoding="utf-8") as f:
            f.write(source_code)

        is_win = sys.platform == "win32"
        exe_filename = "main.exe" if is_win else "main"
        exe_path = os.path.join(temp_dir, exe_filename)

        # Step 1: Compile g++ main.cpp -o main (or main.exe)
        compile_cmd = [gpp_bin, cpp_filename, "-o", exe_filename, "-lm"]
        stdout_c, stderr_c, exit_code_c, compile_time, timed_out_c, memory_c = cls._run_subprocess(
            compile_cmd, "", timeout, temp_dir, memory_limit_kb
        )

        if exit_code_c != 0 or timed_out_c:
            logger.warning(f"[Execution Module] C++ compilation failed (Exit code: {exit_code_c}): {stderr_c}")
            return cls._evaluate_result(
                stdout=stdout_c,
                stderr=stderr_c,
                compile_output=stderr_c or "C++ compilation failed",
                exit_code=exit_code_c,
                exec_time=compile_time,
                memory_kb=memory_c,
                timed_out=timed_out_c,
                expected_output=expected_output,
                is_compilation_failure=True,
                language="cpp",
            )

        # Step 2: Run executable (main.exe on Windows, ./main on Linux)
        run_cmd = [exe_path] if is_win else [f"./{exe_filename}"]
        stdout, stderr, exit_code, exec_time, timed_out, memory_kb = cls._run_subprocess(
            run_cmd, stdin, timeout, temp_dir, memory_limit_kb
        )

        return cls._evaluate_result(
            stdout=stdout,
            stderr=stderr,
            compile_output="",
            exit_code=exit_code,
            exec_time=exec_time,
            memory_kb=memory_kb,
            timed_out=timed_out,
            expected_output=expected_output,
            is_compilation_failure=False,
            language="cpp",
        )


LocalExecutor = LocalCodeExecutor

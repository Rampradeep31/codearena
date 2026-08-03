import os
import re
import sys
import time
import shutil
import logging
import tempfile
import subprocess
from typing import Dict, Any, Optional

logger = logging.getLogger("local_executor")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    formatter = logging.Formatter("[%(asctime)s][%(levelname)s][%(name)s] %(message)s")
    ch.setFormatter(formatter)
    logger.addHandler(ch)

DEFAULT_TIMEOUT_SECONDS = 5.0

# Static security filter: blocks student code that attempts to reach outside
# the sandbox. This is a defense-in-depth layer, NOT a substitute for a real
# sandbox (containers / Judge0). Patterns are matched against a normalized
# (lowercased, whitespace-stripped) copy of the source.
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
                timeout=10,
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


def _find_python_cmd() -> str:
    """Detect available python interpreter command."""
    if shutil.which("python3"):
        return "python3"
    if shutil.which("python"):
        return "python"
    return sys.executable


def _find_javac() -> Optional[str]:
    """Detect available javac compiler command."""
    if shutil.which("javac"):
        return "javac"
    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        candidate = os.path.join(java_home, "bin", "javac.exe" if sys.platform == "win32" else "javac")
        if os.path.exists(candidate):
            return candidate
    if sys.platform == "win32":
        oracle_path = r"C:\Program Files\Common Files\Oracle\Java\javapath\javac.exe"
        if os.path.exists(oracle_path):
            return oracle_path
        jdk_dir = r"C:\Program Files\Java"
        if os.path.exists(jdk_dir):
            for folder in os.listdir(jdk_dir):
                candidate = os.path.join(jdk_dir, folder, "bin", "javac.exe")
                if os.path.exists(candidate):
                    return candidate
    return None


def _find_java() -> Optional[str]:
    """Detect available java runtime command."""
    if shutil.which("java"):
        return "java"
    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        candidate = os.path.join(java_home, "bin", "java.exe" if sys.platform == "win32" else "java")
        if os.path.exists(candidate):
            return candidate
    if sys.platform == "win32":
        oracle_path = r"C:\Program Files\Common Files\Oracle\Java\javapath\java.exe"
        if os.path.exists(oracle_path):
            return oracle_path
        jdk_dir = r"C:\Program Files\Java"
        if os.path.exists(jdk_dir):
            for folder in os.listdir(jdk_dir):
                candidate = os.path.join(jdk_dir, folder, "bin", "java.exe")
                if os.path.exists(candidate):
                    return candidate
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
    def execute(
        cls,
        source_code: str,
        language: str,
        stdin: str = "",
        expected_output: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> Dict[str, Any]:
        norm_lang = cls.normalize_language(language)
        logger.info(f"Executing submission (Language: {norm_lang}, Timeout: {timeout}s)")

        if norm_lang not in ("python", "java", "c", "cpp"):
            return {
                "status": "compilation_error",
                "status_description": "Compilation Error",
                "stdout": "",
                "stderr": f"Unsupported language: {language}",
                "compile_output": f"Unsupported language: {language}",
                "output": "",
                "error": f"Unsupported language: {language}",
                "exit_code": 1,
                "execution_time": 0.0,
                "memory_used": 0,
            }

        from app.config import settings
        if not getattr(settings, "ALLOW_LOCAL_EXECUTION", True):
            return {
                "status": "runtime_error",
                "status_description": "Runtime Error",
                "stdout": "",
                "stderr": "Code execution is disabled on this server",
                "compile_output": "",
                "output": "",
                "error": "Code execution is disabled on this server",
                "exit_code": 1,
                "execution_time": 0.0,
                "memory_used": 0,
            }

        # Static security filter (defense-in-depth)
        blocked_reason = _scan_for_blocked_code(source_code, norm_lang)
        if blocked_reason:
            logger.warning(f"Blocked code submission ({norm_lang}): {blocked_reason}")
            return {
                "status": "compilation_error",
                "status_description": "Compilation Error",
                "stdout": "",
                "stderr": blocked_reason,
                "compile_output": blocked_reason,
                "output": "",
                "error": blocked_reason,
                "exit_code": 1,
                "execution_time": 0.0,
                "memory_used": 0,
            }

        memory_limit_kb = int(getattr(settings, "CODE_MEMORY_LIMIT_KB", 0) or 0)

        with tempfile.TemporaryDirectory(prefix="code_exec_") as temp_dir:
            try:
                if norm_lang == "python":
                    return cls._run_python(source_code, stdin, expected_output, timeout, temp_dir, memory_limit_kb)
                elif norm_lang == "java":
                    return cls._run_java(source_code, stdin, expected_output, timeout, temp_dir, memory_limit_kb)
                elif norm_lang == "c":
                    return cls._run_c(source_code, stdin, expected_output, timeout, temp_dir, memory_limit_kb)
                elif norm_lang == "cpp":
                    return cls._run_cpp(source_code, stdin, expected_output, timeout, temp_dir, memory_limit_kb)
            except Exception as e:
                logger.error(f"Unexpected error during code execution: {str(e)}", exc_info=True)
                return {
                    "status": "runtime_error",
                    "status_description": "Runtime Error",
                    "stdout": "",
                    "stderr": str(e),
                    "compile_output": "",
                    "output": "",
                    "error": str(e),
                    "exit_code": 1,
                    "execution_time": 0.0,
                    "memory_used": 0,
                }

    @classmethod
    def _evaluate_result(
        cls,
        stdout: str,
        stderr: str,
        compile_output: str,
        exit_code: int,
        exec_time: float,
        timed_out: bool,
        expected_output: Optional[str] = None,
        is_compilation_failure: bool = False,
    ) -> Dict[str, Any]:
        """Classify execution verdict into Accepted, Wrong Answer, Compilation Error, or Runtime Error."""
        clean_stdout = stdout.strip() if stdout else ""
        clean_stderr = stderr.strip() if stderr else ""
        clean_compile = compile_output.strip() if compile_output else ""

        if is_compilation_failure:
            exec_status = "compilation_error"
            desc = "Compilation Error"
        elif timed_out:
            exec_status = "runtime_error"
            desc = "Runtime Error"
            clean_stderr = clean_stderr or "Execution timed out (Time Limit Exceeded)"
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

        error_msg = clean_stderr or clean_compile if exec_status in ("compilation_error", "runtime_error") else clean_stderr

        return {
            "status": exec_status,
            "status_description": desc,
            "stdout": stdout,
            "stderr": stderr,
            "compile_output": compile_output,
            "output": stdout,
            "error": error_msg,
            "exit_code": exit_code,
            "execution_time": round(exec_time, 3),
            "memory_used": 0,
        }

    @classmethod
    def _run_subprocess(
        cls,
        cmd: list,
        stdin_data: str,
        timeout: float,
        cwd: str,
        memory_limit_kb: int = 0,
    ) -> tuple[str, str, int, float, bool]:
        """Execute a subprocess with stdin, stdout, stderr capture and timeout protection."""
        start_time = time.perf_counter()

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
            if memory_limit_kb > 0:
                def _limit_memory():
                    import resource
                    bytes_limit = int(memory_limit_kb) * 1024
                    resource.setrlimit(resource.RLIMIT_AS, (bytes_limit, bytes_limit))
                    resource.setrlimit(resource.RLIMIT_DATA, (bytes_limit, bytes_limit))
                popen_kwargs["preexec_fn"] = _limit_memory

        try:
            process = subprocess.Popen(cmd, **popen_kwargs)
            stdout, stderr = process.communicate(input=stdin_data, timeout=timeout)
            exec_time = time.perf_counter() - start_time
            return stdout, stderr, process.returncode, exec_time, False
        except subprocess.TimeoutExpired:
            exec_time = time.perf_counter() - start_time
            _kill_process_tree(process)
            return "", "Time Limit Exceeded", 124, exec_time, True
        except Exception as e:
            exec_time = time.perf_counter() - start_time
            return "", str(e), 1, exec_time, False

    @classmethod
    def _run_python(
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str,
        memory_limit_kb: int = 0,
    ) -> Dict[str, Any]:
        py_file = os.path.join(temp_dir, "solution.py")
        with open(py_file, "w", encoding="utf-8") as f:
            f.write(source_code)

        python_cmd = _find_python_cmd()
        cmd = [python_cmd, "-I", py_file]

        stdout, stderr, exit_code, exec_time, timed_out = cls._run_subprocess(
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
            timed_out=timed_out,
            expected_output=expected_output,
            is_compilation_failure=is_compilation_error,
        )

    @classmethod
    def _run_java(
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str,
        memory_limit_kb: int = 0,
    ) -> Dict[str, Any]:
        javac_bin = _find_javac()
        java_bin = _find_java()

        if not javac_bin or not java_bin:
            err_msg = "Java compiler (javac) or runtime (java) is not installed on this server environment."
            return cls._evaluate_result(
                stdout="",
                stderr=err_msg,
                compile_output=err_msg,
                exit_code=1,
                exec_time=0.0,
                timed_out=False,
                expected_output=expected_output,
                is_compilation_failure=True,
            )

        class_name = extract_java_class_name(source_code)
        java_file = os.path.join(temp_dir, f"{class_name}.java")
        with open(java_file, "w", encoding="utf-8") as f:
            f.write(source_code)

        # Step 1: Compile
        compile_cmd = [javac_bin, f"{class_name}.java"]
        stdout_c, stderr_c, exit_code_c, compile_time, timed_out_c = cls._run_subprocess(
            compile_cmd, "", timeout, temp_dir, memory_limit_kb
        )

        if exit_code_c != 0 or timed_out_c:
            return cls._evaluate_result(
                stdout=stdout_c,
                stderr=stderr_c,
                compile_output=stderr_c or "Java compilation failed",
                exit_code=exit_code_c,
                exec_time=compile_time,
                timed_out=timed_out_c,
                expected_output=expected_output,
                is_compilation_failure=True,
            )

        # Step 2: Run
        run_cmd = [java_bin, "-cp", temp_dir, class_name]
        stdout, stderr, exit_code, exec_time, timed_out = cls._run_subprocess(
            run_cmd, stdin, timeout, temp_dir, memory_limit_kb
        )

        return cls._evaluate_result(
            stdout=stdout,
            stderr=stderr,
            compile_output="",
            exit_code=exit_code,
            exec_time=exec_time,
            timed_out=timed_out,
            expected_output=expected_output,
            is_compilation_failure=False,
        )

    @classmethod
    def _run_c(
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str,
        memory_limit_kb: int = 0,
    ) -> Dict[str, Any]:
        gcc_bin = shutil.which("gcc")
        if not gcc_bin:
            err_msg = "C compiler (gcc) is not installed on this server environment."
            return cls._evaluate_result(
                stdout="",
                stderr=err_msg,
                compile_output=err_msg,
                exit_code=1,
                exec_time=0.0,
                timed_out=False,
                expected_output=expected_output,
                is_compilation_failure=True,
            )

        c_file = os.path.join(temp_dir, "solution.c")
        with open(c_file, "w", encoding="utf-8") as f:
            f.write(source_code)

        exe_filename = "solution.exe" if sys.platform == "win32" else "solution"
        exe_path = os.path.join(temp_dir, exe_filename)

        # Step 1: Compile
        compile_cmd = [gcc_bin, "solution.c", "-o", exe_filename, "-lm"]
        stdout_c, stderr_c, exit_code_c, compile_time, timed_out_c = cls._run_subprocess(
            compile_cmd, "", timeout, temp_dir, memory_limit_kb
        )

        if exit_code_c != 0 or timed_out_c:
            return cls._evaluate_result(
                stdout=stdout_c,
                stderr=stderr_c,
                compile_output=stderr_c or "C compilation failed",
                exit_code=exit_code_c,
                exec_time=compile_time,
                timed_out=timed_out_c,
                expected_output=expected_output,
                is_compilation_failure=True,
            )

        # Step 2: Run
        run_cmd = [exe_path] if sys.platform == "win32" else [f"./{exe_filename}"]
        stdout, stderr, exit_code, exec_time, timed_out = cls._run_subprocess(
            run_cmd, stdin, timeout, temp_dir, memory_limit_kb
        )

        return cls._evaluate_result(
            stdout=stdout,
            stderr=stderr,
            compile_output="",
            exit_code=exit_code,
            exec_time=exec_time,
            timed_out=timed_out,
            expected_output=expected_output,
            is_compilation_failure=False,
        )

    @classmethod
    def _run_cpp(
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str,
        memory_limit_kb: int = 0,
    ) -> Dict[str, Any]:
        gpp_bin = shutil.which("g++")
        if not gpp_bin:
            err_msg = "C++ compiler (g++) is not installed on this server environment."
            return cls._evaluate_result(
                stdout="",
                stderr=err_msg,
                compile_output=err_msg,
                exit_code=1,
                exec_time=0.0,
                timed_out=False,
                expected_output=expected_output,
                is_compilation_failure=True,
            )

        cpp_file = os.path.join(temp_dir, "solution.cpp")
        with open(cpp_file, "w", encoding="utf-8") as f:
            f.write(source_code)

        exe_filename = "solution.exe" if sys.platform == "win32" else "solution"
        exe_path = os.path.join(temp_dir, exe_filename)

        # Step 1: Compile
        compile_cmd = [gpp_bin, "solution.cpp", "-o", exe_filename, "-lm"]
        stdout_c, stderr_c, exit_code_c, compile_time, timed_out_c = cls._run_subprocess(
            compile_cmd, "", timeout, temp_dir, memory_limit_kb
        )

        if exit_code_c != 0 or timed_out_c:
            return cls._evaluate_result(
                stdout=stdout_c,
                stderr=stderr_c,
                compile_output=stderr_c or "C++ compilation failed",
                exit_code=exit_code_c,
                exec_time=compile_time,
                timed_out=timed_out_c,
                expected_output=expected_output,
                is_compilation_failure=True,
            )

        # Step 2: Run
        run_cmd = [exe_path] if sys.platform == "win32" else [f"./{exe_filename}"]
        stdout, stderr, exit_code, exec_time, timed_out = cls._run_subprocess(
            run_cmd, stdin, timeout, temp_dir, memory_limit_kb
        )

        return cls._evaluate_result(
            stdout=stdout,
            stderr=stderr,
            compile_output="",
            exit_code=exit_code,
            exec_time=exec_time,
            timed_out=timed_out,
            expected_output=expected_output,
            is_compilation_failure=False,
        )


LocalExecutor = LocalCodeExecutor


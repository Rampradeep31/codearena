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


def _find_python_cmd() -> str:
    """Detect available python interpreter command."""
    if shutil.which("python3"):
        return "python3"
    if shutil.which("python"):
        return "python"
    return sys.executable


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

        with tempfile.TemporaryDirectory(prefix="code_exec_") as temp_dir:
            try:
                if norm_lang == "python":
                    return cls._run_python(source_code, stdin, expected_output, timeout, temp_dir)
                elif norm_lang == "java":
                    return cls._run_java(source_code, stdin, expected_output, timeout, temp_dir)
                elif norm_lang == "c":
                    return cls._run_c(source_code, stdin, expected_output, timeout, temp_dir)
                elif norm_lang == "cpp":
                    return cls._run_cpp(source_code, stdin, expected_output, timeout, temp_dir)
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
    ) -> tuple[str, str, int, float, bool]:
        """Execute a subprocess with stdin, stdout, stderr capture and timeout protection."""
        start_time = time.perf_counter()
        timed_out = False
        stdout_str = ""
        stderr_str = ""
        exit_code = -1

        try:
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=cwd,
            )
            try:
                stdout_str, stderr_str = process.communicate(input=stdin_data, timeout=timeout)
                exit_code = process.returncode
            except subprocess.TimeoutExpired:
                timed_out = True
                process.kill()
                stdout_str, stderr_str = process.communicate()
                exit_code = -1
        except Exception as e:
            stderr_str = str(e)
            exit_code = 1

        exec_time = time.perf_counter() - start_time
        return stdout_str, stderr_str, exit_code, exec_time, timed_out

    @classmethod
    def _run_python(
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str
    ) -> Dict[str, Any]:
        py_file = os.path.join(temp_dir, "solution.py")
        with open(py_file, "w", encoding="utf-8") as f:
            f.write(source_code)

        python_cmd = _find_python_cmd()
        cmd = [python_cmd, "solution.py"]

        stdout, stderr, exit_code, exec_time, timed_out = cls._run_subprocess(
            cmd, stdin, timeout, temp_dir
        )

        # Categorize SyntaxError / IndentationError in Python as Compilation Error
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
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str
    ) -> Dict[str, Any]:
        if not shutil.which("javac") or not shutil.which("java"):
            return cls._evaluate_result(
                stdout="",
                stderr="Java compiler (javac) or runtime (java) not found on host system.",
                compile_output="Java compiler (javac) or runtime (java) not found on host system.",
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
        compile_cmd = ["javac", f"{class_name}.java"]
        stdout_c, stderr_c, exit_code_c, compile_time, timed_out_c = cls._run_subprocess(
            compile_cmd, "", timeout, temp_dir
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
        run_cmd = ["java", "-cp", temp_dir, class_name]
        stdout, stderr, exit_code, exec_time, timed_out = cls._run_subprocess(
            run_cmd, stdin, timeout, temp_dir
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
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str
    ) -> Dict[str, Any]:
        gcc_bin = shutil.which("gcc")
        if not gcc_bin:
            return cls._evaluate_result(
                stdout="",
                stderr="C compiler (gcc) not found on host system.",
                compile_output="C compiler (gcc) not found on host system.",
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
            compile_cmd, "", timeout, temp_dir
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
            run_cmd, stdin, timeout, temp_dir
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
        cls, source_code: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str
    ) -> Dict[str, Any]:
        gpp_bin = shutil.which("g++")
        if not gpp_bin:
            return cls._evaluate_result(
                stdout="",
                stderr="C++ compiler (g++) not found on host system.",
                compile_output="C++ compiler (g++) not found on host system.",
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
            compile_cmd, "", timeout, temp_dir
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
            run_cmd, stdin, timeout, temp_dir
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

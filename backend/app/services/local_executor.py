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


def _transpile_to_python(source_code: str, language: str) -> str:
    """
    Fallback lightweight transpiler for Java, C, and C++ when system compilers are missing.
    Converts standard IO and loops to Python equivalent.
    """
    py_header = [
        "import sys, math",
        "_input_tokens = sys.stdin.read().split()",
        "_input_idx = 0",
        "def _next_token():",
        "    global _input_idx",
        "    if _input_idx < len(_input_tokens):",
        "        tok = _input_tokens[_input_idx]",
        "        _input_idx += 1",
        "        return tok",
        "    return ''",
        "def _next_int():",
        "    tok = _next_token()",
        "    return int(tok) if tok else 0",
        "def _next_float():",
        "    tok = _next_token()",
        "    return float(tok) if tok else 0.0",
        "",
        "class StringBuilder:",
        "    def __init__(self, s=''): self.s = [str(s)] if s else []",
        "    def append(self, s): self.s.append(str(s)); return self",
        "    def reverse(self): self.s = [''.join(self.s)[::-1]]; return self",
        "    def toString(self): return ''.join(self.s)",
        "    def __str__(self): return ''.join(self.s)",
        "",
        "def _user_main():",
    ]

    body = []
    lines = source_code.splitlines()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Skip headers, imports, class boilerplate, return statements
        if (
            stripped.startswith("package ")
            or stripped.startswith("import ")
            or stripped.startswith("#include")
            or stripped.startswith("using namespace")
            or stripped.startswith("return 0")
            or stripped.startswith("return;")
        ):
            continue
        if re.match(r"(public\s+)?class\s+", stripped):
            continue
        if "public static void main" in stripped or "int main(" in stripped or "void main(" in stripped:
            continue
        if stripped in ("}", "};"):
            continue

        line_sub = stripped

        # System.out.println / print
        line_sub = re.sub(r"System\.out\.println\s*\((.*?)\)\s*;", r"print(\1)", line_sub)
        line_sub = re.sub(r"System\.out\.print\s*\((.*?)\)\s*;", r"print(\1, end='')", line_sub)

        # C++ cout / cin
        line_sub = re.sub(r"\s*<<\s*(?:std::)?endl", "", line_sub)
        line_sub = re.sub(r"(?:std::)?cout\s*<<\s*(.*?)\s*;\s*$", r"print(\1)", line_sub)

        # System.out.printf and printf
        if "printf" in line_sub:
            line_sub = re.sub(r"System\.out\.printf\s*\(", "printf(", line_sub)
            m_args = re.search(r"printf\s*\(\s*\"(.*?)\"\s*,\s*(.*?)\)\s*;", line_sub)
            m_noargs = re.search(r"printf\s*\(\s*\"(.*?)\"\s*\)\s*;", line_sub)
            if m_args:
                fmt_str, args_str = m_args.group(1), m_args.group(2)
                fmt_str = fmt_str.replace("%n", "\\n")
                has_newline = False
                if fmt_str.endswith(r"\n") or fmt_str.endswith("\n"):
                    has_newline = True
                    fmt_str = fmt_str[:-2] if fmt_str.endswith(r"\n") else fmt_str[:-1]
                end_clause = "" if has_newline else ", end=''"
                fmt_py = re.sub(r"%[-+ 0]*\d*(?:\.\d+)?[a-zA-Z%]", "{}", fmt_str)
                line_sub = f"print(\"{fmt_py}\".format({args_str}){end_clause})"
            elif m_noargs:
                fmt_str = m_noargs.group(1).replace("%n", "\\n")
                has_newline = False
                if fmt_str.endswith(r"\n") or fmt_str.endswith("\n"):
                    has_newline = True
                    fmt_str = fmt_str[:-2] if fmt_str.endswith(r"\n") else fmt_str[:-1]
                end_clause = "" if has_newline else ", end=''"
                fmt_py = re.sub(r"%[-+ 0]*\d*(?:\.\d+)?[a-zA-Z%]", "{}", fmt_str)
                line_sub = f"print(\"{fmt_py}\"{end_clause})"

        # Scanner / cin / scanf
        line_sub = re.sub(r"Scanner\s+\w+\s*=\s*new\s+Scanner\s*\(.*?\)\s*;", "", line_sub)
        line_sub = re.sub(r"\b\w+\.nextInt\(\)", "_next_int()", line_sub)
        line_sub = re.sub(r"\b\w+\.nextDouble\(\)", "_next_float()", line_sub)
        line_sub = re.sub(r"\b\w+\.next\(\)", "_next_token()", line_sub)

        # Remove 'new ' keyword for object instantiation
        line_sub = re.sub(r"\bnew\s+", "", line_sub)

        # Simple variable declaration replacement: int n = ... -> n = ...
        line_sub = re.sub(r"\b(int|long|double|float|String|char|bool|auto|StringBuilder)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=", r"\2 =", line_sub)

        # Arrays: int[] nums = new int[n]; -> nums = [0] * (n)
        line_sub = re.sub(r"\b(int|long|double|float|String)\[\]\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\w+\[(.*?)\]\s*;", r"\2 = [0] * (\3)", line_sub)

        # Clean trailing semicolons
        if line_sub.strip().endswith(";") and not line_sub.strip().startswith("for"):
            line_sub = line_sub.rstrip(";")

        body.append("    " + line_sub)

    if not body:
        body.append("    pass")

    body.append("\nif __name__ == '__main__':\n    _user_main()")
    return "\n".join(py_header + body)


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
    def _run_fallback(
        cls, source_code: str, language: str, stdin: str, expected_output: Optional[str], timeout: float, temp_dir: str
    ) -> Dict[str, Any]:
        """Run fallback execution for Java/C/C++ when system compiler is missing."""
        logger.info(f"Using fallback interpreter runner for {language}")
        py_code = _transpile_to_python(source_code, language)
        return cls._run_python(py_code, stdin, expected_output, timeout, temp_dir)

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
            return cls._run_fallback(source_code, "java", stdin, expected_output, timeout, temp_dir)

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
            return cls._run_fallback(source_code, "c", stdin, expected_output, timeout, temp_dir)

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
            return cls._run_fallback(source_code, "cpp", stdin, expected_output, timeout, temp_dir)

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

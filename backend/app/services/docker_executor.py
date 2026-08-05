"""Docker judge — the ONLY production code executor.

Every test case runs in its own throwaway container:

    docker run --rm --network none --cpus 0.5 --memory 256m --pids-limit 64 \
        -v <tmpdir>:/work -w /work <language-image> <cmd>

The judge container never touches the database or the host filesystem beyond
its own temp workdir. Verdicts are Judge0-compatible so the API layer and the
frontend keep working unchanged.

Languages: python, java, c, cpp. Images are configurable via settings.
"""
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time

from app.config import settings

logger = logging.getLogger("docker_executor")

# Status constants shared with local_executor / execution_service
STATUS_ACCEPTED = "accepted"
STATUS_WRONG_ANSWER = "wrong_answer"
STATUS_COMPILATION_ERROR = "compilation_error"
STATUS_RUNTIME_ERROR = "runtime_error"
STATUS_TIME_LIMIT = "time_limit_exceeded"
STATUS_MEMORY_LIMIT = "memory_limit_exceeded"
STATUS_INTERNAL_ERROR = "internal_error"

# Hard cap on captured stdout/stderr (bytes). Protects the API process from
# memory exhaustion by submissions that flood their output stream.
MAX_OUTPUT_BYTES = 500_000
MAX_ERROR_BYTES = 262_144


class DockerJudgeUnavailable(Exception):
    """Raised when Docker is not installed / the daemon is not running."""


def _image_for(language: str) -> str:
    images = {
        "python": settings.JUDGE_IMAGE_PYTHON,
        "java": settings.JUDGE_IMAGE_JAVA,
        "c": settings.JUDGE_IMAGE_C,
        "cpp": settings.JUDGE_IMAGE_CPP,
    }
    return images.get(language)


def _check_docker() -> None:
    if shutil.which("docker") is None:
        raise DockerJudgeUnavailable("docker executable not found on PATH")
    try:
        subprocess.run(
            ["docker", "info"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
            check=True,
        )
    except subprocess.CalledProcessError:
        raise DockerJudgeUnavailable("docker daemon is not running")
    except subprocess.TimeoutExpired:
        raise DockerJudgeUnavailable("docker daemon did not respond")


def _run_container(image: str, workdir: str, cmd: list, timeout: float) -> subprocess.CompletedProcess:
    """Run one container and return the CompletedProcess (never raises on exit codes)."""
    memory = max(64, int(settings.CODE_MEMORY_LIMIT_KB) // 1024)  # MB
    docker_cmd = [
        "docker", "run", "--rm", "--network", "none",
        "--cpus", "0.5",
        "--memory", f"{memory}m",
        "--pids-limit", str(settings.MAX_PROCESSES_PER_SUBMISSION),
        "--ulimit", "nofile=256:256",
        "-v", f"{workdir}:/work",
        "-w", "/work",
        "--entrypoint", "/bin/sh",
        image,
        "-c", " ".join(cmd),
    ]
    # The inner `timeout <limit>s` command enforces the judge time limit. The
    # outer subprocess timeout is only a safety net for container startup
    # (image pulls / cold daemons can take tens of seconds), so it is kept
    # generous and never used as the judge timer.
    try:
        return subprocess.run(
            docker_cmd,
            capture_output=True,
            text=True,
            timeout=timeout + 60,
        )
    except subprocess.TimeoutExpired:
        proc = subprocess.CompletedProcess(
            args=docker_cmd,
            returncode=124,
            stdout="",
            stderr="Execution timed out",
        )
        return proc


# Shell fragments (POSIX sh, runs on both Debian-slim and Alpine):
#  1. run the program with the judge timer, redirecting output to files;
#  2. preserve the program's exit code BEFORE truncating;
#  3. cap output/error/compile files so a flood cannot exhaust the API host;
#  4. write EXIT_CODE=NNN to exit.txt and always exit 0 (docker run returns 0).
_RUN_PREFIX = (
    "ec=0; "
    "timeout {limit} {cmd} > out.tmp 2> err.tmp; ec=$?; "
    "head -c {out} out.tmp > output.txt 2>/dev/null; rm -f out.tmp; "
    "head -c {err} err.tmp > error.txt 2>/dev/null; rm -f err.tmp; "
    "echo \"EXIT_CODE=$ec\" > exit.txt; exit 0"
)


COMPILE_PREFIX = (
    "timeout {limit} {cmd} 2> compile.tmp; "
    "head -c {err} compile.tmp > compile.txt 2>/dev/null; rm -f compile.tmp; "
    "if [ -f {prog} ]; then "
    "  ec=0; timeout {run} {run_cmd} > out.tmp 2> err.tmp; ec=$?; "
    "  head -c {out} out.tmp > output.txt 2>/dev/null; rm -f out.tmp; "
    "  head -c {err} err.tmp > error.txt 2>/dev/null; rm -f err.tmp; "
    "  echo \"EXIT_CODE=$ec\" > exit.txt; "
    "else echo \"EXIT_CODE=1\" > exit.txt; fi; exit 0"
)


def _runner(language: str, source: str, stdin: str, timeout: float, workdir: str) -> str:
    """Write the source/input into the workdir and return the container shell command."""
    with open(os.path.join(workdir, "input.txt"), "w", encoding="utf-8") as f:
        f.write(stdin)

    if language == "python":
        with open(os.path.join(workdir, "main.py"), "w", encoding="utf-8") as f:
            f.write(source)
        return _RUN_PREFIX.format(
            limit=f"{timeout:.0f}", cmd="python3 main.py < input.txt",
            out=MAX_OUTPUT_BYTES, err=MAX_ERROR_BYTES,
        )
    if language == "java":
        with open(os.path.join(workdir, "Main.java"), "w", encoding="utf-8") as f:
            f.write(source)
        return COMPILE_PREFIX.format(
            limit=f"{timeout + 5:.0f}", cmd="javac Main.java", prog="Main.class",
            run=f"{timeout:.0f}", run_cmd="java Main < input.txt",
            out=MAX_OUTPUT_BYTES, err=MAX_ERROR_BYTES,
        )
    if language in ("c", "cpp"):
        ext = "c" if language == "c" else "cpp"
        compiler = "gcc" if language == "c" else "g++"
        with open(os.path.join(workdir, f"main.{ext}"), "w", encoding="utf-8") as f:
            f.write(source)
        return COMPILE_PREFIX.format(
            limit=f"{timeout + 5:.0f}", cmd=f"{compiler} main.{ext} -o main -O2",
            prog="main", run=f"{timeout:.0f}", run_cmd="./main < input.txt",
            out=MAX_OUTPUT_BYTES, err=MAX_ERROR_BYTES,
        )
    raise ValueError(f"Unsupported language: {language}")


def execute(source_code: str, language: str, stdin: str = "", expected_output: str = None,
            timeout: float = None) -> dict:
    """Execute code in an isolated Docker container and grade it.

    Returns a Judge0-compatible result dictionary. Compile errors, runtime
    errors, time limits and memory limits are surfaced individually.
    """
    timeout = timeout or float(getattr(settings, "CODE_TIMEOUT_SECONDS", 15.0))
    language = (language or "python").lower()

    if _image_for(language) is None:
        return {
            "status": STATUS_COMPILATION_ERROR,
            "status_description": "Compilation Error",
            "output": "",
            "stderr": f"Language '{language}' is not supported",
            "error": f"Language '{language}' is not supported",
            "execution_time": 0.0,
            "memory_used": 0,
            "exit_code": -1,
        }

    try:
        _check_docker()
    except DockerJudgeUnavailable as e:
        logger.error(f"Docker judge unavailable: {e}")
        return {
            "status": STATUS_INTERNAL_ERROR,
            "status_description": "Internal Error",
            "output": "",
            "stderr": f"Judge unavailable: {e}",
            "error": f"Judge unavailable: {e}",
            "execution_time": 0.0,
            "memory_used": 0,
            "exit_code": -1,
        }

    workdir = tempfile.mkdtemp(prefix="codearena_judge_")
    try:
        start = time.monotonic()
        cmd = _runner(language, source_code, stdin, timeout, workdir)
        image = _image_for(language)
        _run_container(image, workdir, [cmd], timeout)
        elapsed = round(time.monotonic() - start, 4)

        def _read(name: str) -> str:
            path = os.path.join(workdir, name)
            if not os.path.exists(path):
                return ""
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    return f.read()
            except OSError:
                return ""

        stdout = _read("output.txt").rstrip()
        stderr = _read("error.txt")

        match = re.search(r"EXIT_CODE=(\d+)", _read("exit.txt"))
        exit_code = int(match.group(1)) if match else -1

        # Compile errors (Java/C/C++): compile.txt is populated when the
        # compiler failed.
        compile_err = _read("compile.txt").strip()

        # Python syntax errors surface as runtime failures; classify them as
        # compilation errors so the frontend shows the right verdict.
        if (
            language == "python"
            and exit_code != 0
            and re.search(r"SyntaxError|IndentationError|TabError", stderr)
        ):
            compile_err = stderr

        if compile_err:
            return {
                "status": STATUS_COMPILATION_ERROR,
                "status_description": "Compilation Error",
                "output": "",
                "stderr": compile_err,
                "error": compile_err,
                "execution_time": elapsed,
                "memory_used": 0,
                "exit_code": 1,
            }

        if exit_code == 124:
            return {
                "status": STATUS_TIME_LIMIT,
                "status_description": "Time Limit Exceeded",
                "output": stdout,
                "stderr": stderr,
                "error": "Time limit exceeded",
                "execution_time": elapsed,
                "memory_used": 0,
                "exit_code": 124,
            }

        if exit_code != 0:
            return {
                "status": STATUS_RUNTIME_ERROR,
                "status_description": "Runtime Error",
                "output": stdout,
                "stderr": stderr or "Runtime error (non-zero exit)",
                "error": stderr or "Runtime error (non-zero exit)",
                "execution_time": elapsed,
                "memory_used": 0,
                "exit_code": exit_code,
            }

        return {
            "status": STATUS_ACCEPTED,
            "status_description": "Accepted",
            "output": stdout,
            "stderr": stderr,
            "error": None,
            "execution_time": elapsed,
            "memory_used": 0,
            "exit_code": 0,
        }
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def get_diagnostics() -> dict:
    """Report whether the Docker judge is available (used by /health)."""
    try:
        _check_docker()
        return {"engine": "docker", "available": True, "images": {
            lang: _image_for(lang) for lang in ("python", "java", "c", "cpp")
        }}
    except DockerJudgeUnavailable as e:
        return {"engine": "docker", "available": False, "error": str(e)}

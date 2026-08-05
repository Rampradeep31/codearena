import asyncio
import logging
import os
import traceback
from typing import List, Optional
from app.config import settings
from app.models.question import TestCase
from app.services import docker_executor
from app.services.local_executor import LocalCodeExecutor

logger = logging.getLogger("execution_service")

# Judge engines: "docker" (production, isolated containers) or "local"
# (development / integration tests only — never in production).
DOCKER = "docker"
LOCAL = "local"

_execution_semaphore: Optional[asyncio.Semaphore] = None


def _get_semaphore() -> asyncio.Semaphore:
    global _execution_semaphore
    if _execution_semaphore is None:
        max_concurrent = int(getattr(settings, "MAX_CONCURRENT_EXECUTIONS", 20) or 20)
        _execution_semaphore = asyncio.Semaphore(max_concurrent)
    return _execution_semaphore


def _engine() -> str:
    return (getattr(settings, "JUDGE_ENGINE", DOCKER) or DOCKER).lower()


def _container_id() -> str:
    """Return the container ID when running inside Docker, else 'local-machine'."""
    hostname = os.environ.get("HOSTNAME", "")
    if hostname and (hostname.startswith("replica-") or len(hostname) == 12 or "/" not in hostname):
        return hostname
    return "local-machine"


async def execute_code(
    source_code: str,
    language: str,
    stdin: str = "",
    expected_output: Optional[str] = None,
) -> dict:
    """Execute code with the configured judge engine, throttled by a semaphore."""
    timeout = float(getattr(settings, "CODE_TIMEOUT_SECONDS", 15.0))
    sem = _get_semaphore()

    async with sem:
        try:
            if _engine() == DOCKER:
                res = await asyncio.to_thread(
                    docker_executor.execute,
                    source_code=source_code,
                    language=language,
                    stdin=stdin,
                    expected_output=expected_output,
                    timeout=timeout,
                )
            else:
                res = await asyncio.to_thread(
                    LocalCodeExecutor.execute,
                    source_code=source_code,
                    language=language,
                    stdin=stdin,
                    expected_output=expected_output,
                    timeout=timeout,
                )
        except Exception as e:
            logger.error(
                f"[JUDGE LOG] Action=EXECUTE_EXCEPTION | Language={language} | "
                f"ContainerID={_container_id()} | Error={e}\n{traceback.format_exc()}"
            )
            res = {
                "status": "internal_error",
                "status_description": "Internal Error",
                "output": "",
                "stderr": f"Judge internal error: {e}",
                "error": f"Judge internal error: {e}",
                "execution_time": 0.0,
                "memory_used": 0,
                "exit_code": -1,
            }
    res["container_id"] = _container_id()
    return res


def compare_outputs(actual: str, expected: str) -> bool:
    """Lenient output comparison (exact → line-wise → token-wise → boolean case)."""
    act, exp = actual.strip(), expected.strip()
    if act == exp:
        return True

    def norm_bools(s: str) -> str:
        return s.replace("True", "true").replace("False", "false").replace("None", "none")

    if norm_bools(act) == norm_bools(exp):
        return True

    act_lines = [l.strip() for l in act.splitlines() if l.strip()]
    exp_lines = [l.strip() for l in exp.splitlines() if l.strip()]
    if act_lines == exp_lines or [norm_bools(l) for l in act_lines] == [norm_bools(l) for l in exp_lines]:
        return True

    act_tokens, exp_tokens = act.split(), exp.split()
    if act_tokens == exp_tokens:
        return True

    if len(act_tokens) == len(exp_tokens):
        for a, e in zip(act_tokens, exp_tokens):
            if a == e or norm_bools(a) == norm_bools(e):
                continue
            try:
                if abs(float(a) - float(e)) > 1e-6:
                    return False
            except ValueError:
                return False
        return True
    return False


async def run_against_test_cases(
    source_code: str,
    language: str,
    test_cases: List[TestCase],
) -> List[dict]:
    """Run code against every provided test case and grade each one.

    The caller decides which test cases are included:
      - /code/run    → public/sample test cases only
      - /code/submit → ALL test cases including hidden
    """
    results = []
    if not test_cases:
        return results

    for tc in test_cases:
        result = await execute_code(
            source_code=source_code,
            language=language,
            stdin=tc.input or "",
            expected_output=tc.expected_output or "",
        )
        actual_output = (result.get("output") or "").strip()
        expected = (tc.expected_output or "").strip()

        status = result.get("status", "error")
        # A clean exit means the code ran; the verdict is decided by comparing
        # its output against the expected output (engine-independent grading).
        if status == "accepted":
            passed = compare_outputs(actual_output, expected)
            if not passed:
                status = "wrong_answer"
        else:
            # compilation_error / runtime_error / time_limit_exceeded / ...
            passed = False

        results.append({
            "test_case_id": tc.id,
            "passed": passed,
            "input": tc.input or "",
            "expected_output": tc.expected_output or "",
            "actual_output": actual_output,
            "execution_time": result.get("execution_time", 0.0),
            "memory_used": result.get("memory_used", 0),
            "status": status,
            "error": result.get("error") or result.get("stderr") or None,
            "is_hidden": getattr(tc, "is_hidden", False),
        })
    return results

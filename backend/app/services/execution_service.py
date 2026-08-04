import asyncio
import logging
import os
import traceback
from typing import List, Optional
from app.config import settings
from app.models.question import TestCase
from app.services.local_executor import LocalCodeExecutor

logger = logging.getLogger("execution_service")


def _container_id() -> str:
    """Return the container ID when running inside Docker, else 'local-machine'.

    Docker sets the HOSTNAME environment variable to the container ID.
    """
    hostname = os.environ.get("HOSTNAME", "")
    if hostname and (hostname.startswith("replica-") or len(hostname) == 12 or "/" not in hostname):
        return hostname
    return "local-machine"


_execution_semaphore: Optional[asyncio.Semaphore] = None


def _get_semaphore() -> asyncio.Semaphore:
    global _execution_semaphore
    if _execution_semaphore is None:
        max_concurrent = int(getattr(settings, "MAX_CONCURRENT_EXECUTIONS", 20) or 20)
        _execution_semaphore = asyncio.Semaphore(max_concurrent)
    return _execution_semaphore


async def execute_code(
    source_code: str,
    language: str,
    stdin: str = "",
    expected_output: Optional[str] = None,
) -> dict:
    """
    Execute code using the in-container compiler/interpreter engine with
    concurrency throttling. Returns a Judge0-compatible result dictionary.
    """
    timeout = float(getattr(settings, "CODE_TIMEOUT_SECONDS", 15.0))
    sem = _get_semaphore()

    # Throttled async execution in thread pool to prevent system overload
    async with sem:
        try:
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
                "container_id": _container_id(),
            }
    res["container_id"] = _container_id()
    return res


async def run_against_test_cases(
    source_code: str,
    language: str,
    test_cases: List[TestCase],
) -> List[dict]:
    """
    Run code against test cases and grade each one.

    The caller decides which test cases are included:
      - /code/run    → only public/sample test cases
      - /code/submit → ALL test cases including hidden ones
    Every provided test case is executed and graded so hidden test cases
    count toward the final score.
    """
    results = []

    if not test_cases:
        return results

    container_id = _container_id()

    for tc in test_cases:
        result = await execute_code(
            source_code=source_code,
            language=language,
            stdin=tc.input or "",
            expected_output=tc.expected_output or "",
        )

        actual_output = (result.get("output") or "").strip()
        expected = (tc.expected_output or "").strip()

        # LeetCode style comparison: 
        # 1. Exact match (already stripped)
        # 2. Line by line strip
        # 3. Token by token split
        def compare_outputs(act: str, exp: str) -> bool:
            if act == exp: return True
            act_lines = [l.strip() for l in act.splitlines() if l.strip()]
            exp_lines = [l.strip() for l in exp.splitlines() if l.strip()]
            if act_lines == exp_lines: return True
            
            act_tokens = act.split()
            exp_tokens = exp.split()
            if act_tokens == exp_tokens: return True
            
            if len(act_tokens) == len(exp_tokens):
                match = True
                for a, e in zip(act_tokens, exp_tokens):
                    if a == e:
                        continue
                    try:
                        if abs(float(a) - float(e)) > 1e-6:
                            match = False
                            break
                    except ValueError:
                        match = False
                        break
                if match:
                    return True
                    
            return False

        passed = (result.get("status") == "accepted") and compare_outputs(actual_output, expected)

        logger.info(
            f"[JUDGE LOG] Action=EXECUTE_CASE | Language={language} | Verdict={result.get('status')} | "
            f"Passed={passed} | Time={result.get('execution_time', 0.0):.3f}s | "
            f"Memory={result.get('memory_used', 0)}KB | Compiler={result.get('compiler')} | "
            f"ExitCode={result.get('exit_code')} | ContainerID={container_id}"
        )

        results.append({
            "test_case_id": tc.id,
            "passed": passed,
            "input": tc.input,
            "expected_output": tc.expected_output,
            "actual_output": actual_output,
            "execution_time": result.get("execution_time", 0.0),
            "memory_used": result.get("memory_used", 0),
            "status": result.get("status", "error"),
            "error": result.get("error", ""),
            "compiler": result.get("compiler"),
            "container_id": result.get("container_id", container_id),
            "is_hidden": getattr(tc, "is_hidden", False),
        })

    return results

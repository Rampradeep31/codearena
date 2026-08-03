import asyncio
import logging
from typing import List, Optional
from app.config import settings
from app.models.question import TestCase
from app.services.local_executor import LocalCodeExecutor

logger = logging.getLogger("execution_service")


async def execute_code(
    source_code: str,
    language: str,
    stdin: str = "",
    expected_output: Optional[str] = None,
) -> dict:
    """
    Execute code using local compiler/interpreter engine.
    Returns Judge0-compatible execution result dictionary.
    """
    timeout = float(getattr(settings, "CODE_TIMEOUT_SECONDS", 5))

    # Run blocking execution in thread pool to maintain async responsiveness
    res = await asyncio.to_thread(
        LocalCodeExecutor.execute,
        source_code=source_code,
        language=language,
        stdin=stdin,
        expected_output=expected_output,
        timeout=timeout,
    )
    return res


async def run_against_test_cases(
    source_code: str,
    language: str,
    test_cases: List[TestCase],
) -> List[dict]:
    """
    Run code against test cases.
    Note: Temporary requirement 5 & 6 specifies ignoring hidden test cases.
    Evaluates against the primary public / sample expected output.
    """
    results = []

    if not test_cases:
        return results

    # Temporarily ignore hidden test cases
    visible_test_cases = [tc for tc in test_cases if not getattr(tc, "is_hidden", False)]
    test_cases_to_run = visible_test_cases if visible_test_cases else [test_cases[0]]

    for tc in test_cases_to_run:
        result = await execute_code(
            source_code=source_code,
            language=language,
            stdin=tc.input or "",
            expected_output=tc.expected_output or "",
        )

        actual_output = (result.get("output") or "").strip()
        expected = (tc.expected_output or "").strip()

        # Passed iff status is 'accepted' AND actual output matches expected output after trim()
        passed = (result.get("status") == "accepted") and (actual_output == expected)

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
            "is_hidden": getattr(tc, "is_hidden", False),
        })

    return results

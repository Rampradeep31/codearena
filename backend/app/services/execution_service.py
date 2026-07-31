import asyncio
import httpx
import base64
from typing import List, Optional
from app.config import settings
from app.models.question import TestCase


# Judge0 language IDs
LANGUAGE_MAP = {
    "python": 71,      # Python 3
    "java": 62,         # Java (OpenJDK 13)
    "c": 50,            # C (GCC 9.2)
    "cpp": 54,          # C++ (GCC 9.2)
}

# Semaphore for controlling concurrent executions
_execution_semaphore = asyncio.Semaphore(settings.JUDGE0_MAX_CONCURRENT)


async def execute_code(
    source_code: str,
    language: str,
    stdin: str = "",
    expected_output: Optional[str] = None,
) -> dict:
    """Execute code via Judge0 API. Returns execution result dict."""
    language_id = LANGUAGE_MAP.get(language)
    if not language_id:
        return {
            "status": "error",
            "error": f"Unsupported language: {language}",
            "output": "",
            "execution_time": 0,
            "memory_used": 0,
        }

    # Encode to base64
    source_b64 = base64.b64encode(source_code.encode()).decode()
    stdin_b64 = base64.b64encode(stdin.encode()).decode() if stdin else ""
    expected_b64 = base64.b64encode(expected_output.encode()).decode() if expected_output else ""

    payload = {
        "source_code": source_b64,
        "language_id": language_id,
        "stdin": stdin_b64,
        "expected_output": expected_b64 if expected_output else None,
        "cpu_time_limit": settings.CODE_TIMEOUT_SECONDS,
        "memory_limit": settings.CODE_MEMORY_LIMIT_KB,
        "enable_per_process_and_thread_memory_limit": True,
    }

    headers = {
        "Content-Type": "application/json",
    }

    # Add RapidAPI headers if using hosted Judge0
    if "rapidapi" in settings.JUDGE0_API_URL.lower():
        headers["X-RapidAPI-Key"] = settings.JUDGE0_API_KEY
        headers["X-RapidAPI-Host"] = "judge0-ce.p.rapidapi.com"
    elif settings.JUDGE0_API_KEY:
        headers["X-Auth-Token"] = settings.JUDGE0_API_KEY

    async with _execution_semaphore:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Submit code
                submit_url = f"{settings.JUDGE0_API_URL}/submissions?base64_encoded=true&wait=true"
                response = await client.post(submit_url, json=payload, headers=headers)

                if response.status_code not in (200, 201):
                    return {
                        "status": "error",
                        "error": f"Execution service error: {response.status_code}",
                        "output": "",
                        "execution_time": 0,
                        "memory_used": 0,
                    }

                result = response.json()

                # Decode output
                stdout = ""
                stderr = ""
                compile_output = ""

                if result.get("stdout"):
                    try:
                        stdout = base64.b64decode(result["stdout"]).decode().strip()
                    except Exception:
                        stdout = result["stdout"]

                if result.get("stderr"):
                    try:
                        stderr = base64.b64decode(result["stderr"]).decode().strip()
                    except Exception:
                        stderr = result["stderr"]

                if result.get("compile_output"):
                    try:
                        compile_output = base64.b64decode(result["compile_output"]).decode().strip()
                    except Exception:
                        compile_output = result["compile_output"]

                # Determine status
                status_id = result.get("status", {}).get("id", 0)
                status_desc = result.get("status", {}).get("description", "Unknown")

                # Status IDs: 1=In Queue, 2=Processing, 3=Accepted, 4=Wrong Answer,
                # 5=TLE, 6=Compilation Error, 7-12=Runtime errors, 13=Internal Error
                if status_id == 3:
                    exec_status = "accepted"
                elif status_id == 4:
                    exec_status = "wrong_answer"
                elif status_id == 5:
                    exec_status = "time_limit_exceeded"
                elif status_id == 6:
                    exec_status = "compilation_error"
                elif status_id in (7, 8, 9, 10, 11, 12):
                    exec_status = "runtime_error"
                else:
                    exec_status = "error"

                return {
                    "status": exec_status,
                    "status_description": status_desc,
                    "output": stdout,
                    "error": stderr or compile_output,
                    "execution_time": float(result.get("time", 0) or 0),
                    "memory_used": int(result.get("memory", 0) or 0),
                }

        except httpx.TimeoutException:
            return {
                "status": "time_limit_exceeded",
                "error": "Execution timed out",
                "output": "",
                "execution_time": settings.CODE_TIMEOUT_SECONDS,
                "memory_used": 0,
            }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "output": "",
                "execution_time": 0,
                "memory_used": 0,
            }


async def run_against_test_cases(
    source_code: str,
    language: str,
    test_cases: List[TestCase],
) -> List[dict]:
    """Run code against multiple test cases. Returns list of results."""
    results = []

    for tc in test_cases:
        result = await execute_code(
            source_code=source_code,
            language=language,
            stdin=tc.input,
            expected_output=tc.expected_output,
        )

        actual_output = result.get("output", "").strip()
        expected = tc.expected_output.strip()
        passed = actual_output == expected and result["status"] in ("accepted", "wrong_answer")

        # Override: if outputs match exactly, it's passed regardless of Judge0 status
        if actual_output == expected:
            passed = True

        results.append({
            "test_case_id": tc.id,
            "passed": passed,
            "input": tc.input,
            "expected_output": tc.expected_output,
            "actual_output": actual_output,
            "execution_time": result.get("execution_time", 0),
            "memory_used": result.get("memory_used", 0),
            "status": result.get("status", "error"),
            "error": result.get("error", ""),
            "is_hidden": tc.is_hidden,
        })

    return results

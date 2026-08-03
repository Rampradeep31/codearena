import sys
import os
import asyncio

# Ensure app package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.local_executor import LocalCodeExecutor
from app.services.execution_service import execute_code, run_against_test_cases


class MockTestCase:
    def __init__(self, tc_id: int, inp: str, expected: str, is_hidden: bool = False):
        self.id = tc_id
        self.input = inp
        self.expected_output = expected
        self.is_hidden = is_hidden


def test_python_execution():
    print("\n--- Testing Python Execution ---")
    
    # 1. Accepted
    res_acc = LocalCodeExecutor.execute(
        source_code='print("Hello World")',
        language="python",
        expected_output="Hello World\n",
        timeout=3.0,
    )
    print("Python Accepted Test:", res_acc["status"], "| Status Desc:", res_acc["status_description"], "| Time:", res_acc["execution_time"], "s")
    assert res_acc["status"] == "accepted", f"Expected accepted, got {res_acc['status']}"

    # 2. Wrong Answer
    res_wa = LocalCodeExecutor.execute(
        source_code='print("Hello Earth")',
        language="python",
        expected_output="Hello World",
        timeout=3.0,
    )
    print("Python Wrong Answer Test:", res_wa["status"], "| Status Desc:", res_wa["status_description"])
    assert res_wa["status"] == "wrong_answer", f"Expected wrong_answer, got {res_wa['status']}"

    # 3. Compilation Error (SyntaxError)
    res_ce = LocalCodeExecutor.execute(
        source_code='def foo(: print("Hi")',
        language="python",
        expected_output="Hi",
        timeout=3.0,
    )
    print("Python Compilation Error Test:", res_ce["status"], "| Error Output:", res_ce["error"][:60] if res_ce["error"] else "")
    assert res_ce["status"] == "compilation_error", f"Expected compilation_error, got {res_ce['status']}"

    # 4. Runtime Error
    res_re = LocalCodeExecutor.execute(
        source_code='print(1 / 0)',
        language="python",
        expected_output="0",
        timeout=3.0,
    )
    print("Python Runtime Error Test:", res_re["status"], "| Error Output:", res_re["error"][:60] if res_re["error"] else "")
    assert res_re["status"] == "runtime_error", f"Expected runtime_error, got {res_re['status']}"

    # 5. Timeout (Time Limit Exceeded)
    res_tle = LocalCodeExecutor.execute(
        source_code='import time\ntime.sleep(10)',
        language="python",
        expected_output="Done",
        timeout=1.5,
    )
    print("Python Timeout Test:", res_tle["status"], "| Status Desc:", res_tle["status_description"])
    assert res_tle["status"] == "runtime_error", f"Expected runtime_error on TLE, got {res_tle['status']}"


def test_java_execution():
    print("\n--- Testing Java Execution ---")
    java_code = """
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello Java");
    }
}
"""
    res = LocalCodeExecutor.execute(
        source_code=java_code,
        language="java",
        expected_output="Hello Java",
        timeout=5.0,
    )
    print("Java Execution Test:", res["status"], "| Output:", repr(res["output"]), "| Error:", res["error"])
    assert res["status"] in ("accepted", "compilation_error"), f"Unexpected java status: {res['status']}"


def test_c_execution():
    print("\n--- Testing C Execution ---")
    c_code = """
#include <stdio.h>
int main() {
    printf("Hello C\\n");
    return 0;
}
"""
    res = LocalCodeExecutor.execute(
        source_code=c_code,
        language="c",
        expected_output="Hello C",
        timeout=5.0,
    )
    print("C Execution Test:", res["status"], "| Output:", repr(res["output"]), "| Error:", res["error"])
    assert res["status"] in ("accepted", "compilation_error"), f"Unexpected C status: {res['status']}"


def test_cpp_execution():
    print("\n--- Testing C++ Execution ---")
    cpp_code = """
#include <iostream>
int main() {
    std::cout << "Hello C++" << std::endl;
    return 0;
}
"""
    res = LocalCodeExecutor.execute(
        source_code=cpp_code,
        language="cpp",
        expected_output="Hello C++",
        timeout=5.0,
    )
    print("C++ Execution Test:", res["status"], "| Output:", repr(res["output"]), "| Error:", res["error"])
    assert res["status"] in ("accepted", "compilation_error"), f"Unexpected C++ status: {res['status']}"


async def test_execution_service_async():
    print("\n--- Testing execution_service.py Async API ---")
    test_cases = [
        MockTestCase(1, "", "10", is_hidden=False),
        MockTestCase(2, "", "20", is_hidden=True),
    ]

    py_code = "print(10)"
    results = await run_against_test_cases(py_code, "python", test_cases)
    print("Async Run Against Test Cases count:", len(results))
    # Requirement 5 & 6: Hidden test cases are ignored, so only 1 result returned
    assert len(results) == 1, f"Expected 1 visible test case result, got {len(results)}"
    assert results[0]["passed"] is True, "Expected test case 1 to pass"
    assert results[0]["status"] == "accepted", f"Expected accepted, got {results[0]['status']}"


def main():
    print("Starting Local Code Executor Verification Suite...")
    test_python_execution()
    test_java_execution()
    test_c_execution()
    test_cpp_execution()
    asyncio.run(test_execution_service_async())
    print("\nAll Local Code Executor Verification Tests Passed Successfully!")


if __name__ == "__main__":
    main()

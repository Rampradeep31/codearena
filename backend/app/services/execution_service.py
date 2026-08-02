import json
import google.generativeai as genai
from typing import List, Optional
from app.config import settings
from app.models.question import TestCase

# Initialize Gemini if key exists
if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)


async def run_against_test_cases(
    source_code: str,
    language: str,
    test_cases: List[TestCase],
) -> List[dict]:
    """
    Run code mentally via Gemini API against multiple test cases.
    Returns list of results.
    """
    if not settings.GEMINI_API_KEY:
        return [{
            "test_case_id": tc.id,
            "passed": False,
            "input": tc.input,
            "expected_output": tc.expected_output,
            "actual_output": "",
            "execution_time": 0,
            "memory_used": 0,
            "status": "error",
            "error": "GEMINI_API_KEY is not configured in the backend environment.",
            "is_hidden": tc.is_hidden,
        } for tc in test_cases]

    # Structure test cases for Gemini
    tc_data = [
        {
            "index": i,
            "input": tc.input,
            "expected_output": tc.expected_output
        }
        for i, tc in enumerate(test_cases)
    ]

    prompt = f"""You are a strict programming judge. Execute the student's code mentally against the provided test cases.

Language: {language}
Student Code:
```
{source_code}
```

Test Cases:
{json.dumps(tc_data, indent=2)}

Respond ONLY with a raw JSON object (no markdown, no backticks). Format:
{{
  "compilation_status": "success" | "error",
  "compilation_error": "error message if any, else empty",
  "results": [
    {{
      "test_case_index": 0,
      "passed": true | false,
      "output": "actual stdout",
      "expected_output": "expected output",
      "error": "runtime error if any"
    }}
  ]
}}"""

    model = genai.GenerativeModel("gemini-1.5-flash")
    
    try:
        # We use generate_content since this is sync over network, but we wrap it in a thread if needed,
        # or use Async wrapper if provided by python SDK. 
        # For genai, generate_content_async is available.
        response = await model.generate_content_async(prompt)
        text = response.text.strip()
        
        if text.startswith('```json'):
            text = text.replace('```json', '', 1)
        if text.startswith('```'):
            text = text.replace('```', '', 1)
        if text.endswith('```'):
            text = text[:-3].strip()
            
        parsed = json.loads(text)
    except Exception as e:
        print(f"Gemini evaluation error: {e}")
        return [{
            "test_case_id": tc.id,
            "passed": False,
            "input": tc.input,
            "expected_output": tc.expected_output,
            "actual_output": "",
            "execution_time": 0,
            "memory_used": 0,
            "status": "error",
            "error": f"Failed to parse Gemini response: {e}",
            "is_hidden": tc.is_hidden,
        } for tc in test_cases]

    compilation_error = parsed.get("compilation_error", "")
    
    final_results = []
    for i, tc in enumerate(test_cases):
        res = next((r for r in parsed.get("results", []) if r.get("test_case_index") == i), None)
        
        if parsed.get("compilation_status") == "error":
            passed = False
            status = "compilation_error"
            error = compilation_error
            actual_output = ""
        elif not res:
            passed = False
            status = "error"
            error = "Gemini failed to evaluate this test case."
            actual_output = ""
        else:
            passed = res.get("passed", False)
            error = res.get("error", "")
            actual_output = res.get("output", "")
            if error:
                status = "runtime_error"
            elif not passed:
                status = "wrong_answer"
            else:
                status = "accepted"

        final_results.append({
            "test_case_id": tc.id,
            "passed": passed,
            "input": tc.input,
            "expected_output": tc.expected_output,
            "actual_output": actual_output,
            "execution_time": 0.1,  # Mocked
            "memory_used": 1024,    # Mocked
            "status": status,
            "error": error,
            "is_hidden": tc.is_hidden,
        })

    return final_results

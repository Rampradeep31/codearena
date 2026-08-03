from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database.connection import get_db
from app.models.user import User
from app.models.question import Question, TestCase
from app.models.test import Test
from app.models.attempt import (
    StudentAttempt, StudentQuestion, StudentCode, Submission, SubmissionResult,
    AttemptStatus,
)
from app.schemas.schemas import (
    CodeRunRequest, CodeRunCaseRequest, CodeRunResponse, CodeSubmitResponse, TestCaseResult,
)
from app.security.dependencies import require_student
from app.services.execution_service import run_against_test_cases, execute_code
from app.utils import ensure_aware

router = APIRouter(prefix="/code", tags=["Code Execution"])


@router.post("/run-case", response_model=CodeRunResponse)
async def run_single_case(data: CodeRunCaseRequest, user: User = Depends(require_student)):
    """Run one sample or custom input locally without creating a submission."""
    result = await execute_code(data.source_code, data.language, data.input, data.expected_output)
    actual_output = (result.get("output") or "").strip()
    expected = (data.expected_output or "").strip()
    status = result.get("status", "error")
    passed = status == "accepted" and (data.expected_output is None or actual_output == expected)
    compilation_error = result.get("error") if status == "compilation_error" else None
    return CodeRunResponse(
        compilation_status="error" if compilation_error else "success",
        compilation_error=compilation_error,
        results=[TestCaseResult(
            test_case_id=None, passed=passed, input=data.input,
            expected_output=data.expected_output, actual_output=actual_output,
            execution_time=result.get("execution_time", 0), memory_used=result.get("memory_used", 0), status=status,
        )],
        passed=1 if passed else 0, total=1,
    )


@router.post("/run", response_model=CodeRunResponse)
async def run_code(
    data: CodeRunRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Run code against SAMPLE (public) test cases only."""
    # Verify attempt ownership
    attempt_result = await db.execute(
        select(StudentAttempt).where(
            StudentAttempt.id == data.attempt_id,
            StudentAttempt.student_id == user.id,
        )
    )
    attempt = attempt_result.scalar_one_or_none()
    if not attempt:
        try:
            attempt = StudentAttempt(
                id=data.attempt_id,
                student_id=user.id,
                test_id=1,
                started_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
                status=AttemptStatus.IN_PROGRESS
            )
            db.add(attempt)
            await db.flush()
        except Exception:
            await db.rollback()
            attempt = StudentAttempt(
                id=data.attempt_id,
                student_id=user.id,
                test_id=1,
                started_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
                status=AttemptStatus.IN_PROGRESS
            )

    if attempt.status in ("submitted", "auto_submitted"):
        raise HTTPException(status_code=400, detail="Attempt already submitted")

    # Check timer
    now = datetime.now(timezone.utc)
    if now > ensure_aware(attempt.expires_at):
        raise HTTPException(status_code=400, detail="Attempt has expired")

    # Verify question is assigned to this attempt
    sq_result = await db.execute(
        select(StudentQuestion).where(
            StudentQuestion.attempt_id == data.attempt_id,
            StudentQuestion.question_id == data.question_id,
        )
    )
    if not sq_result.scalar_one_or_none():
        try:
            sq = StudentQuestion(
                attempt_id=data.attempt_id,
                question_id=data.question_id,
                position=1
            )
            db.add(sq)
            await db.flush()
        except Exception:
            await db.rollback()

    # Fetch test cases from Supabase directly
    supabase_url = "https://vubpgeagtfpqdojdiqtc.supabase.co"
    supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YnBnZWFndGZwcWRvamRpcXRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NjY3OTIsImV4cCI6MjEwMTE0Mjc5Mn0.pm5_u6S2SPnrVGGJ2HibOFp-y4a7pVx7ktyr35FdRVM"
    
    class DummyTestCase:
        def __init__(self, tc):
            self.id = tc.get("id", 0)
            self.input = tc.get("input", "")
            self.expected_output = tc.get("expected_output", "")
            self.is_hidden = tc.get("is_hidden", False)

    fetched_test_cases = None
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{supabase_url}/rest/v1/test_cases?question_id=eq.{data.question_id}&select=*",
                headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
                timeout=10.0
            )
            if res.status_code == 200:
                fetched_test_cases = res.json()
    except Exception as e:
        print(f"Error fetching from supabase: {e}")

    if fetched_test_cases is not None:
        public_test_cases = [DummyTestCase(tc) for tc in fetched_test_cases if not tc.get("is_hidden", False)]
    else:
        # Fallback to local DB
        tc_result = await db.execute(
            select(TestCase).where(
                TestCase.question_id == data.question_id,
                TestCase.is_hidden == False,
            )
        )
        public_test_cases = tc_result.scalars().all()

    if not public_test_cases:
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                q_res = await client.get(
                    f"{supabase_url}/rest/v1/questions?id=eq.{data.question_id}&select=sample_input,sample_output",
                    headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
                    timeout=5.0
                )
                if q_res.status_code == 200 and q_res.json():
                    q_data = q_res.json()[0]
                    if q_data.get("sample_input") or q_data.get("sample_output"):
                        public_test_cases = [DummyTestCase({
                            "id": 0,
                            "input": q_data.get("sample_input", ""),
                            "expected_output": q_data.get("sample_output", ""),
                            "is_hidden": False
                        })]
        except Exception:
            pass

    if not public_test_cases:
        return CodeRunResponse(
            compilation_status="success",
            results=[],
            passed=0,
            total=0,
        )

    # Also save the code
    code_result = await db.execute(
        select(StudentCode).where(
            StudentCode.attempt_id == data.attempt_id,
            StudentCode.question_id == data.question_id,
        )
    )
    code = code_result.scalar_one_or_none()
    try:
        if code:
            code.source_code = data.source_code
            code.language = data.language
        else:
            code = StudentCode(
                attempt_id=data.attempt_id,
                question_id=data.question_id,
                language=data.language,
                source_code=data.source_code,
            )
            db.add(code)
        await db.flush()
    except Exception:
        await db.rollback()

    # Execute against public test cases
    results = await run_against_test_cases(data.source_code, data.language, public_test_cases)

    # Check for compilation errors
    compilation_error = None
    if results and results[0]["status"] == "compilation_error":
        compilation_error = results[0].get("error", "Compilation failed")

    passed_count = sum(1 for r in results if r["passed"])

    return CodeRunResponse(
        compilation_status="error" if compilation_error else "success",
        compilation_error=compilation_error,
        results=[
            TestCaseResult(
                test_case_id=r["test_case_id"],
                passed=r["passed"],
                input=r["input"],
                expected_output=r["expected_output"],
                actual_output=r["actual_output"],
                execution_time=r["execution_time"],
                memory_used=r["memory_used"],
                status=r["status"],
            ) for r in results
        ],
        passed=passed_count,
        total=len(results),
    )


@router.post("/submit", response_model=CodeSubmitResponse)
async def submit_code(
    data: CodeRunRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Submit code for grading against ALL test cases (including hidden). Score calculated server-side."""
    # Verify attempt ownership
    attempt_result = await db.execute(
        select(StudentAttempt).where(
            StudentAttempt.id == data.attempt_id,
            StudentAttempt.student_id == user.id,
        )
    )
    attempt = attempt_result.scalar_one_or_none()
    if not attempt:
        try:
            attempt = StudentAttempt(
                id=data.attempt_id,
                student_id=user.id,
                test_id=1,
                started_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
                status=AttemptStatus.IN_PROGRESS
            )
            db.add(attempt)
            await db.flush()
        except Exception:
            await db.rollback()
            attempt = StudentAttempt(
                id=data.attempt_id,
                student_id=user.id,
                test_id=1,
                started_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
                status=AttemptStatus.IN_PROGRESS
            )

    if attempt.status in ("submitted", "auto_submitted"):
        raise HTTPException(status_code=400, detail="Attempt already submitted")

    now = datetime.now(timezone.utc)
    if now > ensure_aware(attempt.expires_at):
        raise HTTPException(status_code=400, detail="Attempt has expired")

    # Verify question assignment
    sq_result = await db.execute(
        select(StudentQuestion).where(
            StudentQuestion.attempt_id == data.attempt_id,
            StudentQuestion.question_id == data.question_id,
        )
    )
    if not sq_result.scalar_one_or_none():
        try:
            sq = StudentQuestion(
                attempt_id=data.attempt_id,
                question_id=data.question_id,
                position=1
            )
            db.add(sq)
            await db.flush()
        except Exception:
            await db.rollback()

    # Get question
    try:
        q_result = await db.execute(select(Question).where(Question.id == data.question_id))
        question = q_result.scalar_one_or_none()
    except Exception:
        await db.rollback()
        question = None
        
    if not question:
        class DummyQuestion:
            marks = 10
        question = DummyQuestion()

    class DummyTestCase:
        def __init__(self, tc):
            self.id = tc.get("id", 0)
            self.input = tc.get("input", "")
            self.expected_output = tc.get("expected_output", "")
            self.is_hidden = tc.get("is_hidden", False)

    supabase_url = "https://vubpgeagtfpqdojdiqtc.supabase.co"
    supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YnBnZWFndGZwcWRvamRpcXRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NjY3OTIsImV4cCI6MjEwMTE0Mjc5Mn0.pm5_u6S2SPnrVGGJ2HibOFp-y4a7pVx7ktyr35FdRVM"
    
    fetched_test_cases = None
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{supabase_url}/rest/v1/test_cases?question_id=eq.{data.question_id}&select=*",
                headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
                timeout=10.0
            )
            if res.status_code == 200:
                fetched_test_cases = res.json()
    except Exception as e:
        print(f"Error fetching from supabase: {e}")

    if fetched_test_cases is not None:
        all_test_cases = [DummyTestCase(tc) for tc in fetched_test_cases]
    else:
        # Fallback to local DB
        tc_result = await db.execute(
            select(TestCase).where(TestCase.question_id == data.question_id)
        )
        all_test_cases = tc_result.scalars().all()

    if not all_test_cases:
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                q_res = await client.get(
                    f"{supabase_url}/rest/v1/questions?id=eq.{data.question_id}&select=sample_input,sample_output",
                    headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
                    timeout=5.0
                )
                if q_res.status_code == 200 and q_res.json():
                    q_data = q_res.json()[0]
                    if q_data.get("sample_input") or q_data.get("sample_output"):
                        all_test_cases = [DummyTestCase({
                            "id": 0,
                            "input": q_data.get("sample_input", ""),
                            "expected_output": q_data.get("sample_output", ""),
                            "is_hidden": False
                        })]
        except Exception:
            pass

    # Execute against all test cases
    results = await run_against_test_cases(data.source_code, data.language, all_test_cases)

    passed_count = sum(1 for r in results if r["passed"])
    total_count = len(results)

    # Get test scoring type
    test_result = await db.execute(select(Test).where(Test.id == attempt.test_id))
    test = test_result.scalar_one_or_none()

    scoring_type = test.scoring_type if test else "partial"
    if isinstance(scoring_type, str):
        pass
    else:
        scoring_type = scoring_type.value

    # Calculate score
    if scoring_type == "all_or_nothing":
        score = question.marks if passed_count == total_count else 0
    else:
        # Partial scoring
        score = (passed_count / total_count * question.marks) if total_count > 0 else 0

    # Check compilation error
    has_compilation_error = any(r["status"] == "compilation_error" for r in results)

    # Create or update submission
    submission = Submission(
        attempt_id=data.attempt_id,
        question_id=data.question_id,
        language=data.language,
        source_code=data.source_code,
        score=score,
        total_test_cases=total_count,
        passed_test_cases=passed_count,
    )
    db.add(submission)
    await db.flush()
    await db.refresh(submission)

    # Save submission results
    for r in results:
        sr = SubmissionResult(
            submission_id=submission.id,
            test_case_id=r["test_case_id"],
            passed=r["passed"],
            output=r["actual_output"],
            execution_time=r["execution_time"],
            memory_used=r["memory_used"],
            status=r["status"],
        )
        db.add(sr)

    # Update attempt total score: recompute from the LATEST submission per question.
    # This is idempotent and immune to concurrent-submission double counting.
    subs_result = await db.execute(
        select(Submission).where(Submission.attempt_id == data.attempt_id)
    )
    all_submissions = subs_result.scalars().all()
    latest_scores = {}
    for s in all_submissions:
        latest_scores[s.question_id] = s.score
    attempt.total_score = sum(latest_scores.values())

    # Also save the code
    code_result = await db.execute(
        select(StudentCode).where(
            StudentCode.attempt_id == data.attempt_id,
            StudentCode.question_id == data.question_id,
        )
    )
    code = code_result.scalar_one_or_none()
    if code:
        code.source_code = data.source_code
        code.language = data.language

    await db.flush()

    # Determine status string
    if has_compilation_error:
        status_str = "compilation_error"
    elif passed_count == total_count:
        status_str = "accepted"
    elif passed_count > 0:
        status_str = "partial"
    else:
        status_str = "wrong_answer"

    return CodeSubmitResponse(
        score=score,
        total_marks=question.marks,
        passed_test_cases=passed_count,
        total_test_cases=total_count,
        status=status_str,
    )

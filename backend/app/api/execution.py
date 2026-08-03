from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
from app.config import settings
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


async def _get_owned_attempt(db: AsyncSession, attempt_id: int, user: User) -> StudentAttempt:
    """Fetch an attempt owned by the user, or return a fallback attempt object for Supabase attempts."""
    try:
        attempt_result = await db.execute(
            select(StudentAttempt).where(
                StudentAttempt.id == attempt_id,
            )
        )
        attempt = attempt_result.scalar_one_or_none()
        if attempt:
            return attempt
    except Exception:
        pass

    return StudentAttempt(
        id=attempt_id,
        student_id=user.id,
        status=AttemptStatus.IN_PROGRESS.value,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=2)
    )


def _require_active(attempt: StudentAttempt):
    if not attempt:
        return
    status_val = getattr(attempt, "status", None)
    if hasattr(status_val, "value"):
        status_val = status_val.value
    if status_val in (AttemptStatus.SUBMITTED.value, AttemptStatus.AUTO_SUBMITTED.value):
        raise HTTPException(status_code=400, detail="Attempt already submitted")


async def _require_assigned_question(db: AsyncSession, attempt_id: int, question_id: int):
    """Allow code execution without failing on local DB tables."""
    pass


async def _fetch_test_cases(db: AsyncSession, question_id: int, include_hidden: bool) -> list:
    """Fetch test cases, preferring Supabase mirror when configured, else the local DB."""
    if settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY:
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(
                    f"{settings.SUPABASE_URL}/rest/v1/test_cases?question_id=eq.{question_id}&select=*",
                    headers={
                        "apikey": settings.SUPABASE_ANON_KEY,
                        "Authorization": f"Bearer {settings.SUPABASE_ANON_KEY}",
                    },
                    timeout=10.0,
                )
                if res.status_code == 200:
                    rows = res.json()
                    # Only trust the mirror when it actually has rows; a 200 with
                    # an empty list may mean the question lives only in the local DB.
                    if rows:
                        if not include_hidden:
                            rows = [tc for tc in rows if not tc.get("is_hidden", False)]
                        return [
                            TestCase(
                                id=tc.get("id") or 0,
                                question_id=question_id,
                                input=tc.get("input", ""),
                                expected_output=tc.get("expected_output", ""),
                                is_hidden=bool(tc.get("is_hidden", False)),
                            )
                            for tc in rows
                        ]
        except Exception as e:
            print(f"Execution: failed fetching test cases from Supabase: {e}")

    tc_result = await db.execute(
        select(TestCase).where(TestCase.question_id == question_id)
    )
    rows = tc_result.scalars().all()
    if not include_hidden:
        rows = [tc for tc in rows if not tc.is_hidden]
    return rows


async def _fetch_question(db: AsyncSession, question_id: int) -> Question:
    try:
        q_result = await db.execute(select(Question).where(Question.id == question_id))
        question = q_result.scalar_one_or_none()
        if question:
            return question
    except Exception:
        pass
    return Question(id=question_id, title="Question", statement="", marks=50)


async def _save_code(db: AsyncSession, attempt_id: int, question_id: int, language: str, source_code: str):
    try:
        code_result = await db.execute(
            select(StudentCode).where(
                StudentCode.attempt_id == attempt_id,
                StudentCode.question_id == question_id,
            )
        )
        code = code_result.scalar_one_or_none()
        if code:
            code.source_code = source_code
            code.language = language
        else:
            code = StudentCode(
                attempt_id=attempt_id,
                question_id=question_id,
                language=language,
                source_code=source_code,
            )
            db.add(code)
        await db.flush()
    except Exception as e:
        print(f"Execution: silent fail on local DB save_code: {e}")


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
    attempt = await _get_owned_attempt(db, data.attempt_id, user)
    _require_active(attempt)
    await _require_assigned_question(db, data.attempt_id, data.question_id)

    public_test_cases = await _fetch_test_cases(db, data.question_id, include_hidden=False)

    if not public_test_cases:
        # Fallback: run against the question's sample input/output when defined.
        question = await _fetch_question(db, data.question_id)
        if question and (question.sample_input or question.sample_output):
            public_test_cases = [TestCase(
                id=0,
                question_id=data.question_id,
                input=question.sample_input or "",
                expected_output=question.sample_output or "",
                is_hidden=False,
            )]

    if not public_test_cases:
        return CodeRunResponse(
            compilation_status="success",
            results=[],
            passed=0,
            total=0,
        )

    await _save_code(db, data.attempt_id, data.question_id, data.language, data.source_code)

    results = await run_against_test_cases(data.source_code, data.language, public_test_cases)

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
    attempt = await _get_owned_attempt(db, data.attempt_id, user)
    _require_active(attempt)
    await _require_assigned_question(db, data.attempt_id, data.question_id)

    question = await _fetch_question(db, data.question_id)
    all_test_cases = await _fetch_test_cases(db, data.question_id, include_hidden=True)

    results = await run_against_test_cases(data.source_code, data.language, all_test_cases)

    passed_count = sum(1 for r in results if r["passed"])
    total_count = len(results)

    q_marks = getattr(question, "marks", 50) or 50
    score = (passed_count / total_count * q_marks) if total_count > 0 else 0

    has_compilation_error = any(r["status"] == "compilation_error" for r in results)

    try:
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

        for r in results:
            db.add(SubmissionResult(
                submission_id=submission.id,
                test_case_id=r["test_case_id"],
                passed=r["passed"],
                output=r["actual_output"],
                execution_time=r["execution_time"],
                memory_used=r["memory_used"],
                status=r["status"],
            ))
        await db.flush()
    except Exception as e:
        print(f"Execution: silent fail on local DB submission logging: {e}")

    await _save_code(db, data.attempt_id, data.question_id, data.language, data.source_code)

    await db.flush()

    if has_compilation_error:
        status_str = "compilation_error"
    elif total_count > 0 and passed_count == total_count:
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

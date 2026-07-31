from datetime import datetime, timezone
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
    CodeRunRequest, CodeRunResponse, CodeSubmitResponse, TestCaseResult,
)
from app.security.dependencies import require_student
from app.services.execution_service import run_against_test_cases

router = APIRouter(prefix="/code", tags=["Code Execution"])


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
        raise HTTPException(status_code=404, detail="Attempt not found")

    if attempt.status in ("submitted", "auto_submitted"):
        raise HTTPException(status_code=400, detail="Attempt already submitted")

    # Check timer
    now = datetime.now(timezone.utc)
    if now > attempt.expires_at:
        raise HTTPException(status_code=400, detail="Attempt has expired")

    # Verify question is assigned to this attempt
    sq_result = await db.execute(
        select(StudentQuestion).where(
            StudentQuestion.attempt_id == data.attempt_id,
            StudentQuestion.question_id == data.question_id,
        )
    )
    if not sq_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Question not assigned to this attempt")

    # Get only PUBLIC test cases
    tc_result = await db.execute(
        select(TestCase).where(
            TestCase.question_id == data.question_id,
            TestCase.is_hidden == False,
        )
    )
    public_test_cases = tc_result.scalars().all()

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
        raise HTTPException(status_code=404, detail="Attempt not found")

    if attempt.status in ("submitted", "auto_submitted"):
        raise HTTPException(status_code=400, detail="Attempt already submitted")

    now = datetime.now(timezone.utc)
    if now > attempt.expires_at:
        raise HTTPException(status_code=400, detail="Attempt has expired")

    # Verify question assignment
    sq_result = await db.execute(
        select(StudentQuestion).where(
            StudentQuestion.attempt_id == data.attempt_id,
            StudentQuestion.question_id == data.question_id,
        )
    )
    if not sq_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Question not assigned to this attempt")

    # Get question
    q_result = await db.execute(select(Question).where(Question.id == data.question_id))
    question = q_result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Get ALL test cases (including hidden)
    tc_result = await db.execute(
        select(TestCase).where(TestCase.question_id == data.question_id)
    )
    all_test_cases = tc_result.scalars().all()

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
    existing_sub = await db.execute(
        select(Submission).where(
            Submission.attempt_id == data.attempt_id,
            Submission.question_id == data.question_id,
        ).order_by(Submission.submitted_at.desc()).limit(1)
    )
    old_sub = existing_sub.scalar_one_or_none()
    old_score = old_sub.score if old_sub else 0

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

    # Update attempt total score (replace old score for this question with new)
    attempt.total_score = (attempt.total_score or 0) - old_score + score

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

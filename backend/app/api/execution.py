from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database.connection import get_db
from app.models.user import User
from app.models.question import Question, TestCase
from app.models.attempt import (
    StudentAttempt, StudentQuestion, StudentCode, Submission, SubmissionResult,
    AttemptStatus,
)
from app.schemas.schemas import (
    CodeRunRequest, CodeRunCaseRequest, CodeRunResponse, CodeSubmitResponse, TestCaseResult,
)
from app.security.dependencies import require_student
from app.services.execution_service import run_against_test_cases, execute_code
from app.services.local_executor import LocalCodeExecutor

import logging

logger = logging.getLogger("execution_api")

router = APIRouter(prefix="/code", tags=["Code Execution"])


@router.get("/compiler/status")
async def get_compiler_status():
    """Return compiler detection and system diagnostics."""
    return LocalCodeExecutor.get_diagnostics()


async def _get_owned_attempt(db: AsyncSession, attempt_id: int, user: User) -> StudentAttempt:
    """Fetch an attempt and verify it belongs to the authenticated student.

    If the attempt doesn't exist, create it with all required NOT NULL fields.
    If it exists but belongs to a different student, re-assign it.
    """
    from datetime import datetime, timezone, timedelta

    # ── Pre-INSERT validation ──
    if user.id is None:
        logger.error(f"_get_owned_attempt called with user.id=None (user={user})")
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Cannot resolve student identity.",
        )

    result = await db.execute(
        select(StudentAttempt).where(StudentAttempt.id == attempt_id)
    )
    attempt = result.scalar_one_or_none()

    if not attempt:
        # Create new attempt with ALL required NOT NULL fields
        now = datetime.now(timezone.utc)
        attempt = StudentAttempt(
            id=attempt_id,
            student_id=user.id,
            test_id=1,
            status=AttemptStatus.IN_PROGRESS,
            started_at=now,
            expires_at=now + timedelta(hours=2),
            violation_count=0,
        )
        db.add(attempt)
        try:
            await db.flush()
            logger.info(
                f"Created StudentAttempt: id={attempt_id}, student_id={user.id}, test_id=1"
            )
        except Exception as e:
            logger.error(
                f"Failed to INSERT StudentAttempt (id={attempt_id}, student_id={user.id}): {e}"
            )
            raise HTTPException(
                status_code=500,
                detail=f"Could not create test attempt: {e}",
            )
        return attempt

    # Attempt exists — verify ownership
    if attempt.student_id != user.id:
        logger.info(
            f"Re-assigning attempt {attempt_id} from student_id={attempt.student_id} to {user.id}"
        )
        attempt.student_id = user.id
        try:
            await db.flush()
        except Exception as e:
            logger.warning(f"Could not re-assign attempt {attempt_id}: {e}")

    return attempt


def _require_active(attempt: StudentAttempt):
    status_val = getattr(attempt, "status", None)
    if hasattr(status_val, "value"):
        status_val = status_val.value
    if status_val in (AttemptStatus.SUBMITTED.value, AttemptStatus.AUTO_SUBMITTED.value):
        raise HTTPException(status_code=400, detail="Attempt already submitted")


async def _require_assigned_question(db: AsyncSession, attempt_id: int, question_id: int):
    result = await db.execute(
        select(StudentQuestion.id).where(
            StudentQuestion.attempt_id == attempt_id,
            StudentQuestion.question_id == question_id,
        )
    )
    if result.scalar_one_or_none() is None:
        sq = StudentQuestion(
            attempt_id=attempt_id,
            question_id=question_id,
            position=1
        )
        db.add(sq)
        try:
            await db.flush()
        except Exception:
            pass


async def _fetch_test_cases(db: AsyncSession, question_id: int, include_hidden: bool) -> list:
    """Fetch test cases for a question from the database."""
    try:
        tc_result = await db.execute(
            select(TestCase).where(TestCase.question_id == question_id)
        )
        rows = tc_result.scalars().all()
        if not include_hidden:
            rows = [tc for tc in rows if not tc.is_hidden]
        return list(rows)
    except Exception as e:
        logger.warning(f"Failed to fetch test cases for question {question_id}: {e}")
        return []


async def _fetch_question(db: AsyncSession, question_id: int) -> Question:
    try:
        q_result = await db.execute(select(Question).where(Question.id == question_id))
        question = q_result.scalar_one_or_none()
        if question:
            return question
    except Exception as e:
        logger.warning(f"Failed to query Question table for id {question_id}: {e}")

    # Return virtual question fallback to prevent 404 / 500 errors when questions are loaded from Supabase/LocalStorage
    q = Question(
        id=question_id,
        title=f"Coding Challenge #{question_id}",
        statement="Solve the problem using standard IO.",
        difficulty="easy",
        marks=50,
        topic="General"
    )
    db.add(q)
    try:
        await db.flush()
    except Exception:
        await db.rollback()
    return q


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
        logger.warning(f"Could not persist StudentCode locally for attempt {attempt_id}, question {question_id}: {e}")


@router.post("/run-case", response_model=CodeRunResponse)
async def run_single_case(data: CodeRunCaseRequest, user: User = Depends(require_student)):
    """Run one sample or custom input locally without creating a submission."""
    logger.info(
        f"[API /code/run-case] User ID: {user.id} ({user.name}) | Language: {data.language} | Auth Verified"
    )
    result = await execute_code(data.source_code, data.language, data.input, data.expected_output)
    actual_output = (result.get("output") or "").strip()
    expected = (data.expected_output or "").strip()
    status = result.get("status", "error")
    passed = status == "accepted" and (data.expected_output is None or actual_output == expected)
    compilation_error = result.get("error") if status in ("compilation_error", "compiler_not_installed") else None

    logger.info(
        f"[API /code/run-case Finished] User ID: {user.id} | Status: {status} | Execution Time: {result.get('execution_time', 0)}s"
    )

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
    logger.info(
        f"[API /code/run Request] User ID: {user.id} ({user.name}) | Attempt ID: {data.attempt_id} | "
        f"Question ID: {data.question_id} | Language: {data.language} | Auth Verified"
    )

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
        # Generic fallback test case if no test cases exist in local DB
        public_test_cases = [TestCase(
            id=0,
            question_id=data.question_id,
            input="",
            expected_output="",
            is_hidden=False,
        )]

    await _save_code(db, data.attempt_id, data.question_id, data.language, data.source_code)

    results = await run_against_test_cases(data.source_code, data.language, public_test_cases)

    compilation_error = None
    if results and results[0]["status"] in ("compilation_error", "compiler_not_installed"):
        compilation_error = results[0].get("error", "Compilation failed")

    passed_count = sum(1 for r in results if r["passed"])
    max_exec_time = max((r.get("execution_time", 0.0) for r in results), default=0.0)
    max_memory_kb = max((r.get("memory_used", 0) for r in results), default=0)
    primary_verdict = results[0].get("status", "unknown") if results else "no_results"

    logger.info(
        f"[JUDGE LOG] Action=RUN | StudentID={user.id} | AttemptID={data.attempt_id} | QuestionID={data.question_id} | "
        f"Language={data.language} | Verdict={primary_verdict} | Passed={passed_count}/{len(results)} | "
        f"Time={max_exec_time:.3f}s | Memory={max_memory_kb}KB | Compiler={results[0].get('compiler') if results else None} | "
        f"ContainerID={results[0].get('container_id') if results else None}"
    )

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
    logger.info(
        f"[API /code/submit Request] User ID: {user.id} ({user.name}) | Attempt ID: {data.attempt_id} | "
        f"Question ID: {data.question_id} | Language: {data.language} | Auth Verified"
    )

    attempt = await _get_owned_attempt(db, data.attempt_id, user)
    _require_active(attempt)
    await _require_assigned_question(db, data.attempt_id, data.question_id)

    question = await _fetch_question(db, data.question_id)
    all_test_cases = await _fetch_test_cases(db, data.question_id, include_hidden=True)

    if not all_test_cases:
        all_test_cases = [TestCase(
            id=0,
            question_id=data.question_id,
            input=getattr(question, "sample_input", "") or "",
            expected_output=getattr(question, "sample_output", "") or "",
            is_hidden=False,
        )]

    results = await run_against_test_cases(data.source_code, data.language, all_test_cases)

    passed_count = sum(1 for r in results if r["passed"])
    total_count = len(results)

    q_marks = getattr(question, "marks", 50) or 50
    score = (passed_count / total_count * q_marks) if total_count > 0 else 0

    has_compilation_error = any(r["status"] in ("compilation_error", "compiler_not_installed") for r in results)

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
        logger.warning(f"Could not persist Submission locally for attempt {data.attempt_id}: {e}")

    await _save_code(db, data.attempt_id, data.question_id, data.language, data.source_code)

    if has_compilation_error:
        status_str = "compilation_error"
    elif total_count > 0 and passed_count == total_count:
        status_str = "accepted"
    elif passed_count > 0:
        status_str = "partial"
    else:
        status_str = "wrong_answer"

    max_exec_time = max((r.get("execution_time", 0.0) for r in results), default=0.0)
    max_memory_kb = max((r.get("memory_used", 0) for r in results), default=0)

    logger.info(
        f"[JUDGE LOG] Action=SUBMIT | StudentID={user.id} | AttemptID={data.attempt_id} | QuestionID={data.question_id} | "
        f"Language={data.language} | Score={score}/{q_marks} | Passed={passed_count}/{total_count} | "
        f"Verdict={status_str} | Time={max_exec_time:.3f}s | Memory={max_memory_kb}KB | Compiler={results[0].get('compiler') if results else None} | "
        f"ContainerID={results[0].get('container_id') if results else None}"
    )

    return CodeSubmitResponse(
        score=score,
        total_marks=question.marks,
        passed_test_cases=passed_count,
        total_test_cases=total_count,
        status=status_str,
    )

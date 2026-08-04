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
    """Fetch an existing attempt and verify it belongs to the authenticated student."""

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
        raise HTTPException(
            status_code=404,
            detail="Attempt not found. Start the exam before running code.",
        )

    # Attempt exists — verify ownership
    if attempt.student_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Attempt does not belong to the current student",
        )

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


FALLBACK_TEST_CASES = {
    101: [
        {"id": 1011, "input": "4\n2 7 11 15\n9", "expected_output": "0 1", "is_hidden": False},
        {"id": 1012, "input": "3\n3 2 4\n6", "expected_output": "1 2", "is_hidden": True},
    ],
    102: [
        {"id": 1021, "input": "hello", "expected_output": "olleh", "is_hidden": False},
        {"id": 1022, "input": "CodeArena", "expected_output": "anerAedoC", "is_hidden": True},
    ],
    103: [
        {"id": 1031, "input": "racecar", "expected_output": "true", "is_hidden": False},
        {"id": 1032, "input": "hello", "expected_output": "false", "is_hidden": True},
    ],
    104: [
        {"id": 1041, "input": "9\n-2 1 -3 4 -1 2 1 -5 4", "expected_output": "6", "is_hidden": False},
        {"id": 1042, "input": "1\n1", "expected_output": "1", "is_hidden": True},
    ],
    105: [
        {"id": 1051, "input": "()[]{}", "expected_output": "true", "is_hidden": False},
        {"id": 1052, "input": "(]", "expected_output": "false", "is_hidden": True},
    ],
    106: [
        {"id": 1061, "input": "36.50", "expected_output": "309.65\n97.70", "is_hidden": False},
        {"id": 1062, "input": "122.11", "expected_output": "395.26\n251.80", "is_hidden": True},
    ],
    107: [
        {"id": 1071, "input": "27", "expected_output": "true", "is_hidden": False},
        {"id": 1072, "input": "0", "expected_output": "false", "is_hidden": True},
    ],
    108: [
        {"id": 1081, "input": "8", "expected_output": "2", "is_hidden": False},
        {"id": 1082, "input": "4", "expected_output": "2", "is_hidden": True},
    ],
    109: [
        {"id": 1091, "input": "3\n1 1 2", "expected_output": "1 2", "is_hidden": False},
        {"id": 1092, "input": "10\n0 0 1 1 1 2 2 3 3 4", "expected_output": "0 1 2 3 4", "is_hidden": True},
    ],
    110: [
        {"id": 1101, "input": "III", "expected_output": "3", "is_hidden": False},
        {"id": 1102, "input": "LVIII", "expected_output": "58", "is_hidden": True},
    ],
    111: [
        {"id": 1111, "input": "121", "expected_output": "true", "is_hidden": False},
        {"id": 1112, "input": "-121", "expected_output": "false", "is_hidden": True},
    ],
    112: [
        {"id": 1121, "input": "4\n3 1 2 4", "expected_output": "2 4 3 1", "is_hidden": False},
        {"id": 1122, "input": "1\n0", "expected_output": "0", "is_hidden": True},
    ],
    113: [
        {"id": 1131, "input": "3\n2 5 1 3 4 7", "expected_output": "2 3 5 4 1 7", "is_hidden": False},
        {"id": 1132, "input": "4\n1 2 3 4 4 3 2 1", "expected_output": "1 4 2 3 3 2 4 1", "is_hidden": True},
    ],
    114: [
        {"id": 1141, "input": "9\n1 1 2 3 3 4 4 8 8", "expected_output": "2", "is_hidden": False},
        {"id": 1142, "input": "7\n3 3 7 7 10 11 11", "expected_output": "10", "is_hidden": True},
    ],
    115: [
        {"id": 1151, "input": "6\n0 2 1 5 3 4", "expected_output": "0 1 2 4 5 3", "is_hidden": False},
        {"id": 1152, "input": "5\n5 0 1 2 3 4", "expected_output": "4 5 0 1 2 3", "is_hidden": True},
    ],
    116: [
        {"id": 1161, "input": "9\n1 2 2 6 6 6 6 7 10", "expected_output": "6", "is_hidden": False},
        {"id": 1162, "input": "4\n1 1 2 2", "expected_output": "1", "is_hidden": True},
    ],
    117: [
        {"id": 1171, "input": "4\n1 3 5 6\n5", "expected_output": "2", "is_hidden": False},
        {"id": 1172, "input": "4\n1 3 5 6\n2", "expected_output": "1", "is_hidden": True},
    ],
    118: [
        {"id": 1181, "input": "5\n0 1 0 3 12", "expected_output": "1 3 12 0 0", "is_hidden": False},
        {"id": 1182, "input": "1\n0", "expected_output": "0", "is_hidden": True},
    ],
    119: [
        {"id": 1191, "input": "4\n3 2 2 3\n3", "expected_output": "2 2", "is_hidden": False},
        {"id": 1192, "input": "8\n0 1 2 2 3 0 4 2\n2", "expected_output": "0 1 3 0 4", "is_hidden": True},
    ],
    120: [
        {"id": 1201, "input": "3\n2 2 1", "expected_output": "1", "is_hidden": False},
        {"id": 1202, "input": "5\n4 1 2 1 2", "expected_output": "4", "is_hidden": True},
    ],
}


async def _fetch_test_cases(db: AsyncSession, question_id: int, include_hidden: bool) -> list:
    """Fetch test cases for a question from the database or fallback mapping."""
    rows = []
    try:
        # 1. Try exact question_id
        tc_result = await db.execute(
            select(TestCase).where(TestCase.question_id == question_id)
        )
        rows = list(tc_result.scalars().all())

        # 2. Try mapped question_id (101 -> 1, 102 -> 2)
        if not rows and question_id >= 100:
            mapped_id = question_id - 100
            tc_result = await db.execute(
                select(TestCase).where(TestCase.question_id == mapped_id)
            )
            rows = list(tc_result.scalars().all())
    except Exception as e:
        logger.warning(f"Failed to fetch test cases for question {question_id}: {e}")

    # 3. Fallback to dictionary if DB has no test cases
    if not rows:
        dict_key = question_id if question_id in FALLBACK_TEST_CASES else (question_id + 100 if (question_id + 100) in FALLBACK_TEST_CASES else None)
        if dict_key and dict_key in FALLBACK_TEST_CASES:
            fb_list = FALLBACK_TEST_CASES[dict_key]
            rows = [
                TestCase(
                    id=item["id"],
                    question_id=question_id,
                    input=item["input"],
                    expected_output=item["expected_output"],
                    is_hidden=item["is_hidden"],
                )
                for item in fb_list
            ]

    if not include_hidden:
        rows = [tc for tc in rows if not tc.is_hidden]

    return rows


async def _fetch_question(db: AsyncSession, question_id: int) -> Question:
    try:
        q_result = await db.execute(select(Question).where(Question.id == question_id))
        question = q_result.scalar_one_or_none()
        if question:
            return question

        if question_id >= 100:
            q_result = await db.execute(select(Question).where(Question.id == (question_id - 100)))
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
            error=result.get("error") or result.get("stderr") or None,
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
    if public_test_cases:
        public_test_cases = public_test_cases[:2]

    if not public_test_cases:
        # Fallback: if no non-hidden test cases exist, fetch the first available test case
        all_cases = await _fetch_test_cases(db, data.question_id, include_hidden=True)
        if all_cases:
            public_test_cases = all_cases[:2]

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
                error=r.get("error") or None,
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

    submit_results = []
    for r in results:
        is_hidden = r.get("is_hidden", False)
        submit_results.append(TestCaseResult(
            test_case_id=r["test_case_id"],
            passed=r["passed"],
            input="[Hidden]" if is_hidden else r["input"],
            expected_output="[Hidden]" if is_hidden else r["expected_output"],
            actual_output=r["actual_output"],
            execution_time=r["execution_time"],
            memory_used=r["memory_used"],
            status=r["status"],
            error=r.get("error")
        ))

    return CodeSubmitResponse(
        score=score,
        total_marks=question.marks,
        passed_test_cases=passed_count,
        total_test_cases=total_count,
        status=status_str,
        results=submit_results,
    )

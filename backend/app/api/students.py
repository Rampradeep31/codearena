import random
import logging
import traceback
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.exc import IntegrityError
from app.database.connection import get_db
from app.config import settings
from app.models.user import User
from app.models.test import Test, TestQuestion
from app.models.question import Question, TestCase
from app.models.attempt import (
    StudentAttempt, StudentQuestion, StudentCode, Submission,
    StudentQuestionAssignment, AttemptStatus, SubmissionReason,
)
from app.models.violation import Violation
from app.schemas.schemas import (
    TestOut, AttemptOut, StudentQuestionOut, QuestionStudentOut,
    TestCasePublicOut, CodeSaveRequest, ViolationCreate, ViolationRecorded, UserOut,
    FinishAttemptRequest,
)
from app.security.dependencies import require_student
from app.utils import ensure_aware
from app.services.attempt_lifecycle import auto_submit_expired, submission_reason_for_status

router = APIRouter(prefix="/student", tags=["Student"])
logger = logging.getLogger("student_api")

COMPLETED_STATUSES = frozenset({
    AttemptStatus.SUBMITTED.value,
    AttemptStatus.AUTO_SUBMITTED.value,
})


def _status_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _log_attempt(
    action: str,
    *,
    student_id: int,
    test_id: int = None,
    attempt_id: int = None,
    question_id: int = None,
    reason: str = "",
    exc: Exception = None,
):
    msg = (
        f"[ATTEMPT] action='{action}' student_id={student_id} test_id={test_id} "
        f"attempt_id={attempt_id} question_id={question_id} reason='{reason}' "
        f"ts={datetime.now(timezone.utc).isoformat()}"
    )
    if exc:
        logger.error(f"{msg}\n{traceback.format_exc()}")
    else:
        logger.info(msg)


def _is_completed_status(status: str) -> bool:
    return _status_value(status).lower() in COMPLETED_STATUSES


async def _attempt_out(db: AsyncSession, attempt: StudentAttempt) -> AttemptOut:
    """Build AttemptOut with the test's max_violations attached."""
    test = await db.execute(select(Test).where(Test.id == attempt.test_id))
    test_row = test.scalar_one_or_none()
    return AttemptOut(
        id=attempt.id, student_id=attempt.user_id, test_id=attempt.test_id,
        started_at=attempt.started_at, expires_at=attempt.expires_at,
        submitted_at=attempt.submitted_at, status=_status_value(attempt.status),
        violation_count=attempt.violation_count or 0,
        submission_reason=submission_reason_for_status(attempt.status),
        total_score=float(attempt.score or 0),
        total_possible=float(test_row.total_marks) if test_row and test_row.total_marks else None,
        max_violations=test_row.max_violations if test_row else 3,
    )


@router.get("/profile", response_model=UserOut)
async def get_profile(
    user: User = Depends(require_student),
):
    """Get current student profile."""
    return UserOut(
        id=user.id, email=user.email, register_number=user.register_number,
        name=user.name, role="student", department=user.department,
        year=user.year, section=user.section,
        status=user.status.value if hasattr(user.status, 'value') else user.status,
    )


@router.get("/tests")
async def get_student_tests(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Get tests categorized as upcoming, active, completed, scoped to the student's year.

    Classification rules (server-authoritative):
    - No attempt AND test window open          → active (can start)
    - No attempt AND test window future        → upcoming
    - No attempt AND test window past          → silently excluded
    - Attempt exists, status in_progress       → active (resume)
    - Attempt exists, status completed         → completed
    Tests where the student already has an attempt are ALWAYS returned
    regardless of year filter or test end_time, so a refresh can never
    make a test disappear.
    """
    now = datetime.now(timezone.utc)
    _log_attempt("dashboard_fetch", student_id=user.id, reason="start")

    # Step 1: Collect all test_ids where this student already has an attempt.
    # These tests must ALWAYS be returned — the student's attempt is the source
    # of truth regardless of year filter or test schedule.
    existing_attempts_result = await db.execute(
        select(StudentAttempt).where(StudentAttempt.user_id == user.id)
    )
    existing_attempts = existing_attempts_result.scalars().all()
    attempted_test_ids = {a.test_id for a in existing_attempts}
    attempts_by_test = {a.test_id: a for a in existing_attempts}

    # Step 2: Build the year-scoped query for NEW tests (no attempt yet).
    year_label = {2: "Second Year", 3: "Third Year"}.get(user.year)

    year_query = select(Test).order_by(Test.start_time.desc())
    if year_label:
        # Only apply year filter to tests the student hasn't started yet.
        # Tests with existing attempts are fetched separately (step 3) so they
        # are never lost due to a year mismatch.
        year_query = year_query.where(
            or_(Test.year == year_label, Test.year.is_(None))
        )
    year_result = await db.execute(year_query)
    year_scoped_tests = year_result.scalars().all()

    # Step 3: Fetch tests where student has an attempt but year filter might
    # have excluded them (e.g. test year changed after attempt was created).
    missed_test_ids = attempted_test_ids - {t.id for t in year_scoped_tests}
    extra_tests = []
    if missed_test_ids:
        extra_result = await db.execute(
            select(Test).where(Test.id.in_(missed_test_ids))
        )
        extra_tests = extra_result.scalars().all()

    # Merge: de-duplicate by id, attempted tests first so they are never lost.
    seen_ids: set = set()
    all_tests = []
    for t in list(extra_tests) + list(year_scoped_tests):
        if t.id not in seen_ids:
            seen_ids.add(t.id)
            all_tests.append(t)

    upcoming = []
    active = []
    completed = []

    for t in all_tests:
        attempt = attempts_by_test.get(t.id)

        # Re-fetch from DB in case the in-memory dict is stale (e.g. concurrent
        # session started an attempt between the bulk fetch and this loop).
        if attempt is None and t.id in attempted_test_ids:
            att_r = await db.execute(
                select(StudentAttempt).where(
                    StudentAttempt.user_id == user.id,
                    StudentAttempt.test_id == t.id,
                )
            )
            attempt = att_r.scalar_one_or_none()

        # Server-side expiry enforcement: transition in_progress → auto_submitted
        # when the timer has passed. This runs on every dashboard read so the
        # client never needs to guess the correct status.
        if attempt:
            await auto_submit_expired(db, attempt)

        q_count = await db.execute(
            select(func.count(TestQuestion.id)).where(TestQuestion.test_id == t.id)
        )

        test_data = {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "year": t.year,
            "start_time": ensure_aware(t.start_time).isoformat(),
            "end_time": ensure_aware(t.end_time).isoformat(),
            "duration_minutes": t.duration_minutes,
            "total_marks": t.total_marks,
            "questions_per_student": t.questions_per_student,
            "allowed_languages": t.allowed_languages,
            "max_violations": t.max_violations,
            "allow_copy_paste": t.allow_copy_paste,
            "question_count": q_count.scalar() or 0,
        }

        attempt_status = _status_value(attempt.status) if attempt else None

        # Always expose attempt fields so the client contract is stable
        # (null when no attempt exists).
        if attempt:
            test_data["attempt_id"] = attempt.id
            test_data["attempt_status"] = attempt_status
            test_data["attempt_submitted_at"] = (
                attempt.submitted_at.isoformat() if attempt.submitted_at else None
            )
        else:
            test_data["attempt_id"] = None
            test_data["attempt_status"] = None
            test_data["attempt_submitted_at"] = None

        # ── Classification: DB-only truth, never frontend state ──────────
        #
        # Rule 1: attempt exists + completed status  → completed
        # Rule 2: attempt exists + any other status  → active (resume)
        # Rule 3: no attempt + future start_time     → upcoming
        # Rule 4: no attempt + window open now        → active (start)
        # Rule 5: no attempt + past end_time          → skip (no action possible)
        #
        # Tests that fall into Rule 5 are only excluded when there is NO
        # attempt. An attempt always anchors the test into a bucket (rules 1-2).
        if attempt and _is_completed_status(attempt_status):
            completed.append(test_data)
        elif attempt is not None:
            # in_progress or any non-completed state with an existing attempt
            active.append(test_data)
        elif ensure_aware(t.start_time) > now:
            upcoming.append(test_data)
        elif ensure_aware(t.end_time) >= now:
            active.append(test_data)
        # else: no attempt + test ended → intentionally excluded

    _log_attempt(
        "dashboard_fetch",
        student_id=user.id,
        reason=f"done active={len(active)} upcoming={len(upcoming)} completed={len(completed)}",
    )
    return {"upcoming": upcoming, "active": active, "completed": completed}


@router.post("/tests/{test_id}/start", response_model=AttemptOut)
async def start_test(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Start a test. Creates attempt with random question assignment. Idempotent."""
    u_id = user.id
    _log_attempt("Start Test", student_id=u_id, test_id=test_id)
    now = datetime.now(timezone.utc)

    # Get test
    test_result = await db.execute(select(Test).where(Test.id == test_id))
    test = test_result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    # Extract test properties to local variables BEFORE any DB operations/rollbacks
    duration_mins = test.duration_minutes
    test_end_time = test.end_time
    test_start_time = test.start_time
    easy_cnt = test.easy_count
    med_cnt = test.medium_count
    hard_cnt = test.hard_count
    q_per_student = test.questions_per_student

    # Validate test is active
    if ensure_aware(test_start_time) > now:
        raise HTTPException(status_code=400, detail="Test has not started yet")
    if ensure_aware(test_end_time) < now:
        raise HTTPException(status_code=400, detail="Test has already ended")

    # Check for existing attempt (idempotent)
    existing = await db.execute(
        select(StudentAttempt).where(
            StudentAttempt.user_id == u_id,
            StudentAttempt.test_id == test_id,
        )
    )
    attempt = existing.scalar_one_or_none()

    if attempt:
        _log_attempt("Existing Attempt", student_id=u_id, test_id=test_id, attempt_id=attempt.id, reason="existing_attempt_found")
        if _is_completed_status(attempt.status):
            raise HTTPException(
                status_code=400,
                detail="Test has already been submitted and cannot be restarted",
            )
        # Ensure student_questions assignment exists for this attempt
        sq_check = await db.execute(
            select(StudentQuestion).where(StudentQuestion.attempt_id == attempt.id)
        )
        if not sq_check.scalars().all():
            assign_res = await db.execute(
                select(StudentQuestionAssignment).where(
                    StudentQuestionAssignment.student_id == u_id,
                    StudentQuestionAssignment.test_id == test_id,
                )
            )
            asgn = assign_res.scalar_one_or_none()
            if asgn:
                sq = StudentQuestion(attempt_id=attempt.id, question_id=asgn.question_id, position=1)
                code = StudentCode(attempt_id=attempt.id, question_id=asgn.question_id, language="python", source_code="")
                db.add(sq)
                db.add(code)
                try:
                    await db.commit()
                    _log_attempt("Commit", student_id=u_id, test_id=test_id, attempt_id=attempt.id, reason="recovered_student_questions")
                except Exception as exc:
                    await db.rollback()
                    _log_attempt("Rollback", student_id=u_id, test_id=test_id, exc=exc)
        return await _attempt_out(db, attempt)

    # Check for existing question assignment
    assign_result = await db.execute(
        select(StudentQuestionAssignment).where(
            StudentQuestionAssignment.student_id == u_id,
            StudentQuestionAssignment.test_id == test_id,
        )
    )
    assignment = assign_result.scalar_one_or_none()

    if assignment is not None:
        _log_attempt("Existing Assignment", student_id=u_id, test_id=test_id, question_id=assignment.question_id)
        assigned_q = (await db.execute(
            select(Question).where(Question.id == assignment.question_id)
        )).scalar_one_or_none()
        if not assigned_q:
            raise HTTPException(status_code=400, detail="Assigned question no longer exists")
        selected = [assigned_q]
        _log_attempt("Question Reused", student_id=u_id, test_id=test_id, question_id=assignment.question_id)
    else:
        # Get question pool grouped by difficulty
        pool_result = await db.execute(
            select(Question)
            .join(TestQuestion, TestQuestion.question_id == Question.id)
            .where(TestQuestion.test_id == test_id)
        )
        pool = pool_result.scalars().all()
        if not pool:
            raise HTTPException(status_code=400, detail="No questions available in the test pool")

        easy = [q for q in pool if (q.difficulty.value if hasattr(q.difficulty, 'value') else q.difficulty) == "easy"]
        medium = [q for q in pool if (q.difficulty.value if hasattr(q.difficulty, 'value') else q.difficulty) == "medium"]
        hard = [q for q in pool if (q.difficulty.value if hasattr(q.difficulty, 'value') else q.difficulty) == "hard"]

        selected = []
        if easy_cnt > 0:
            if len(easy) < easy_cnt:
                raise HTTPException(status_code=400, detail=f"Not enough easy questions in pool ({len(easy)} < {easy_cnt})")
            selected.extend(random.sample(easy, easy_cnt))

        if med_cnt > 0:
            if len(medium) < med_cnt:
                raise HTTPException(status_code=400, detail=f"Not enough medium questions in pool ({len(medium)} < {med_cnt})")
            selected.extend(random.sample(medium, med_cnt))

        if hard_cnt > 0:
            if len(hard) < hard_cnt:
                raise HTTPException(status_code=400, detail=f"Not enough hard questions in pool ({len(hard)} < {hard_cnt})")
            selected.extend(random.sample(hard, hard_cnt))

        if len(selected) > q_per_student:
            raise HTTPException(
                status_code=400,
                detail=f"Difficulty counts ({easy_cnt}+{med_cnt}+{hard_cnt}) exceed questions per student ({q_per_student})",
            )

        if len(selected) < q_per_student:
            remaining_pool = [q for q in pool if q not in selected]
            needed = q_per_student - len(selected)
            if len(remaining_pool) < needed:
                raise HTTPException(
                    status_code=400,
                    detail=f"Not enough questions in pool ({len(pool)} < {q_per_student})",
                )
            selected.extend(random.sample(remaining_pool, needed))

        random.shuffle(selected)

        # Create StudentQuestionAssignment for the selected question
        selected_q = selected[0]
        assignment = StudentQuestionAssignment(
            student_id=u_id,
            test_id=test_id,
            question_id=selected_q.id,
        )
        db.add(assignment)
        try:
            await db.flush()
            _log_attempt("Question Assigned", student_id=u_id, test_id=test_id, question_id=selected_q.id)
        except IntegrityError as exc:
            await db.rollback()
            _log_attempt("Rollback", student_id=u_id, test_id=test_id, reason="assignment_race_condition", exc=exc)
            assign_result = await db.execute(
                select(StudentQuestionAssignment).where(
                    StudentQuestionAssignment.student_id == u_id,
                    StudentQuestionAssignment.test_id == test_id,
                )
            )
            assignment = assign_result.scalar_one_or_none()
            if assignment:
                assigned_q = (await db.execute(
                    select(Question).where(Question.id == assignment.question_id)
                )).scalar_one_or_none()
                selected = [assigned_q]
                _log_attempt("Question Reused", student_id=u_id, test_id=test_id, question_id=assignment.question_id)

    expires_at = min(
        now + timedelta(minutes=duration_mins),
        ensure_aware(test_end_time),
    )

    attempt = StudentAttempt(
        user_id=u_id,
        test_id=test_id,
        started_at=now,
        expires_at=expires_at,
        status=AttemptStatus.IN_PROGRESS.value,
        violation_count=0,
        score=0,
    )
    db.add(attempt)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        _log_attempt("Rollback", student_id=u_id, test_id=test_id, reason="attempt_race_condition", exc=exc)
        existing_attempt = (await db.execute(
            select(StudentAttempt).where(
                StudentAttempt.user_id == u_id,
                StudentAttempt.test_id == test_id,
            )
        )).scalar_one_or_none()
        if existing_attempt:
            _log_attempt("Existing Attempt", student_id=u_id, test_id=test_id, attempt_id=existing_attempt.id, reason="reused_concurrent_attempt")
            return await _attempt_out(db, existing_attempt)

    for pos, question in enumerate(selected, 1):
        sq = StudentQuestion(
            attempt_id=attempt.id,
            question_id=question.id,
            position=pos,
        )
        db.add(sq)

        code = StudentCode(
            attempt_id=attempt.id,
            question_id=question.id,
            language="python",
            source_code="",
        )
        db.add(code)

    try:
        await db.commit()
        _log_attempt("Commit", student_id=u_id, test_id=test_id, attempt_id=attempt.id)
    except IntegrityError as exc:
        await db.rollback()
        _log_attempt("Rollback", student_id=u_id, test_id=test_id, reason="commit_race_condition", exc=exc)
        existing_attempt = (await db.execute(
            select(StudentAttempt).where(
                StudentAttempt.user_id == u_id,
                StudentAttempt.test_id == test_id,
            )
        )).scalar_one_or_none()
        if existing_attempt:
            return await _attempt_out(db, existing_attempt)

    return await _attempt_out(db, attempt)


@router.get("/attempts/{attempt_id}", response_model=AttemptOut)
async def get_attempt(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Get attempt details."""
    result = await db.execute(
        select(StudentAttempt).where(
            StudentAttempt.id == attempt_id,
            StudentAttempt.user_id == user.id,
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    was_auto_submitted = await auto_submit_expired(db, attempt)
    if was_auto_submitted:
        _log_attempt("Auto Submit", student_id=user.id, test_id=attempt.test_id, attempt_id=attempt.id, reason="timer_expired_on_attempt_read")

    return await _attempt_out(db, attempt)


@router.get("/attempts/{attempt_id}/questions", response_model=List[StudentQuestionOut])
async def get_attempt_questions(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Get assigned questions for an attempt. Only public test cases are included."""
    # Verify ownership
    attempt_result = await db.execute(
        select(StudentAttempt).where(
            StudentAttempt.id == attempt_id,
            StudentAttempt.user_id == user.id,
        )
    )
    attempt = attempt_result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Server-side expiry check: auto-submits expired attempt and returns JSON 200 (never HTTP 400)
    was_auto_submitted = await auto_submit_expired(db, attempt)
    if was_auto_submitted:
        _log_attempt("Auto Submit", student_id=user.id, test_id=attempt.test_id, attempt_id=attempt.id, reason="timer_expired_on_questions_read")
        return JSONResponse(
            status_code=200,
            content={
                "status": "auto_submitted",
                "submitted": True,
                "expired": True,
                "attempt_id": attempt.id,
            }
        )

    current_status = _status_value(attempt.status)
    if current_status in (AttemptStatus.SUBMITTED.value, AttemptStatus.AUTO_SUBMITTED.value):
        _log_attempt("Auto Submit", student_id=user.id, test_id=attempt.test_id, attempt_id=attempt.id, reason="already_submitted_questions_read")
        return JSONResponse(
            status_code=200,
            content={
                "status": current_status,
                "submitted": True,
                "expired": current_status == AttemptStatus.AUTO_SUBMITTED.value,
                "attempt_id": attempt.id,
            }
        )

    # Get assigned questions
    sq_result = await db.execute(
        select(StudentQuestion)
        .where(StudentQuestion.attempt_id == attempt_id)
        .order_by(StudentQuestion.position)
    )
    student_questions = sq_result.scalars().all()

    output = []
    for sq in student_questions:
        # Get question
        q_result = await db.execute(select(Question).where(Question.id == sq.question_id))
        q = q_result.scalar_one_or_none()
        if not q:
            continue

        # Get ONLY public test cases — never send hidden ones
        tc_result = await db.execute(
            select(TestCase).where(
                TestCase.question_id == q.id,
                TestCase.is_hidden == False,
            )
        )
        public_test_cases = tc_result.scalars().all()

        # Get saved code
        code_result = await db.execute(
            select(StudentCode).where(
                StudentCode.attempt_id == attempt_id,
                StudentCode.question_id == q.id,
            )
        )
        saved_code = code_result.scalar_one_or_none()

        # Check if submitted
        sub_result = await db.execute(
            select(Submission).where(
                Submission.attempt_id == attempt_id,
                Submission.question_id == q.id,
            ).order_by(Submission.created_at.desc()).limit(1)
        )
        submission = sub_result.scalar_one_or_none()

        output.append(StudentQuestionOut(
            id=sq.id,
            attempt_id=sq.attempt_id,
            question_id=sq.question_id,
            position=sq.position,
            question=QuestionStudentOut(
                id=q.id, title=q.title, statement=q.statement,
                difficulty=q.difficulty.value if hasattr(q.difficulty, 'value') else q.difficulty,
                marks=q.marks, topic=q.topic,
                input_format=q.input_format, output_format=q.output_format,
                constraints=q.constraints, sample_input=q.sample_input,
                sample_output=q.sample_output, explanation=q.explanation,
                test_cases=[TestCasePublicOut(
                    id=tc.id, input=tc.input, expected_output=tc.expected_output,
                ) for tc in public_test_cases],
            ),
            saved_code=saved_code.source_code if saved_code else "",
            saved_language=saved_code.language if saved_code else "python",
            is_submitted=submission is not None,
            submission_score=submission.score if submission else None,
        ))

    return output


@router.put("/attempts/{attempt_id}/code")
async def save_code(
    attempt_id: int,
    data: CodeSaveRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Auto-save student code."""
    # Verify ownership and active attempt
    attempt_result = await db.execute(
        select(StudentAttempt).where(
            StudentAttempt.id == attempt_id,
            StudentAttempt.user_id == user.id,
        )
    )
    attempt = attempt_result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if _status_value(attempt.status) in ("submitted", "auto_submitted"):
        raise HTTPException(status_code=400, detail="Attempt already submitted")

    # Server-side expiry enforcement on write paths too.
    if await auto_submit_expired(db, attempt):
        raise HTTPException(status_code=400, detail="Attempt expired and has been auto-submitted")

    # Verify the question is assigned to this attempt
    assigned = await db.execute(
        select(StudentQuestion).where(
            StudentQuestion.attempt_id == attempt_id,
            StudentQuestion.question_id == data.question_id,
        )
    )
    if not assigned.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Question is not part of this attempt")

    # Update or create code entry
    code_result = await db.execute(
        select(StudentCode).where(
            StudentCode.attempt_id == attempt_id,
            StudentCode.question_id == data.question_id,
        )
    )
    code = code_result.scalar_one_or_none()

    if code:
        code.source_code = data.source_code
        code.language = data.language
    else:
        code = StudentCode(
            attempt_id=attempt_id,
            question_id=data.question_id,
            language=data.language,
            source_code=data.source_code,
        )
        db.add(code)

    try:
        await db.flush()
    except IntegrityError:
        # Concurrent auto-save: the unique constraint fired.
        # Roll back and re-read the existing row to update it.
        await db.rollback()
        code_result2 = await db.execute(
            select(StudentCode).where(
                StudentCode.attempt_id == attempt_id,
                StudentCode.question_id == data.question_id,
            )
        )
        code = code_result2.scalar_one_or_none()
        if code:
            code.source_code = data.source_code
            code.language = data.language
            await db.flush()
    return {"message": "Code saved"}


@router.post("/attempts/{attempt_id}/violations", response_model=ViolationRecorded)
async def record_violation(
    attempt_id: int,
    data: ViolationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Record a proctoring violation event. Includes dedup (2s window)."""
    # Verify ownership
    attempt_result = await db.execute(
        select(StudentAttempt).where(
            StudentAttempt.id == attempt_id,
            StudentAttempt.user_id == user.id,
        )
    )
    attempt = attempt_result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if _status_value(attempt.status) in ("submitted", "auto_submitted"):
        raise HTTPException(status_code=400, detail="Attempt already submitted")

    # Server-side expiry enforcement.
    if await auto_submit_expired(db, attempt):
        raise HTTPException(status_code=400, detail="Attempt expired and has been auto-submitted")

    now = datetime.now(timezone.utc)

    # Deduplication: ignore if the same violation type was recorded within 2 seconds.
    # The comparison is done in Python with normalized (aware) datetimes because
    # SQLite returns naive timestamps, and comparing them directly against an
    # aware datetime in SQL is unreliable.
    recent_result = await db.execute(
        select(Violation)
        .where(
            Violation.attempt_id == attempt_id,
            Violation.violation_type == data.violation_type,
        )
        .order_by(Violation.created_at.desc())
        .limit(1)
    )
    recent = recent_result.scalar_one_or_none()
    if recent and ensure_aware(recent.created_at) > now - timedelta(seconds=2):
        # Duplicate event, return existing state without incrementing
        test_result = await db.execute(select(Test).where(Test.id == attempt.test_id))
        test = test_result.scalar_one_or_none()
        effective_max = (
            settings.MAX_FACE_TURN_VIOLATIONS
            if data.violation_type == "face_turned"
            else (test.max_violations if test else settings.MAX_VIOLATIONS_DEFAULT)
        )
        return ViolationRecorded(
            id=recent.id, attempt_id=attempt_id, violation_type=data.violation_type,
            created_at=ensure_aware(recent.created_at), violation_count=attempt.violation_count,
            max_violations=effective_max,
            auto_submitted=False,
        )

    # Record violation
    violation = Violation(
        attempt_id=attempt_id,
        violation_type=data.violation_type,
    )
    db.add(violation)

    # Increment count
    attempt.violation_count += 1
    await db.flush()
    await db.refresh(violation)

    # Determine effective limit for display purposes only.
    # NOTE: reaching the violation limit must NEVER auto-submit the attempt.
    # The lifecycle only allows COMPLETED via the student's submit action or
    # the attempt timer expiring. Violation events are environmental (tab
    # switch, fullscreen exit) and must not complete an exam.
    test_result = await db.execute(select(Test).where(Test.id == attempt.test_id))
    test = test_result.scalar_one_or_none()

    effective_max = test.max_violations if test else settings.MAX_VIOLATIONS_DEFAULT
    if data.violation_type == "face_turned":
        face_count_result = await db.execute(
            select(func.count(Violation.id)).where(
                Violation.attempt_id == attempt_id,
                Violation.violation_type == "face_turned",
            )
        )
        effective_max = settings.MAX_FACE_TURN_VIOLATIONS

    return ViolationRecorded(
        id=violation.id, attempt_id=violation.attempt_id,
        violation_type=violation.violation_type, created_at=violation.created_at,
        violation_count=attempt.violation_count,
        max_violations=effective_max,
        auto_submitted=False,
    )


@router.post("/attempts/{attempt_id}/finish")
async def finish_test(
    attempt_id: int,
    data: FinishAttemptRequest = FinishAttemptRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Manually submit (finish) the test."""
    attempt_result = await db.execute(
        select(StudentAttempt).where(
            StudentAttempt.id == attempt_id,
            StudentAttempt.user_id == user.id,
        )
    )
    attempt = attempt_result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if _is_completed_status(attempt.status):
        raise HTTPException(status_code=400, detail="Already submitted")

    # Server-side expiry enforcement: if the timer has already passed, the
    # attempt was auto-submitted by the server and a manual finish is refused.
    if await auto_submit_expired(db, attempt):
        raise HTTPException(status_code=400, detail="Attempt expired and has been auto-submitted")

    now = datetime.now(timezone.utc)
    expires_at = ensure_aware(attempt.expires_at)
    grace = timedelta(seconds=settings.SUBMISSION_GRACE_PERIOD_SECONDS)

    # The server — not the client — decides the final status.
    # If the server-side timer has expired (with grace), mark auto_submitted.
    # Otherwise it is a manual submission regardless of what the client sent.
    # This eliminates phantom auto_submitted rows caused by client-clock skew.
    if now > expires_at + grace:
        attempt.status = AttemptStatus.AUTO_SUBMITTED.value
        finish_reason = SubmissionReason.TIME_EXPIRED.value
        _log_attempt(
            "finish_test_decision",
            student_id=user.id,
            test_id=attempt.test_id,
            attempt_id=attempt_id,
            reason=f"server_timer_expired expires_at={expires_at.isoformat()} now={now.isoformat()}",
        )
    else:
        attempt.status = AttemptStatus.SUBMITTED.value
        finish_reason = SubmissionReason.MANUAL.value
        _log_attempt(
            "finish_test_decision",
            student_id=user.id,
            test_id=attempt.test_id,
            attempt_id=attempt_id,
            reason=f"manual_submit remaining_secs={int((expires_at - now).total_seconds())}",
        )

    attempt.submitted_at = now

    subs_result = await db.execute(
        select(Submission).where(Submission.attempt_id == attempt_id)
    )
    submissions = subs_result.scalars().all()
    scores_by_question = {}
    for s in submissions:
        scores_by_question[s.question_id] = s.score
    attempt.score = int(sum(scores_by_question.values()))

    await db.flush()

    _log_attempt(
        "attempt_finish",
        student_id=user.id,
        test_id=attempt.test_id,
        attempt_id=attempt_id,
        reason=f"status={attempt.status} submission_reason={finish_reason}",
    )

    return {
        "message": "Test submitted successfully",
        "attempt_id": attempt.id,
        "test_id": attempt.test_id,
        "submitted_at": now.isoformat(),
        "status": attempt.status,
        "total_score": float(attempt.score or 0),
        "violation_count": attempt.violation_count or 0,
    }

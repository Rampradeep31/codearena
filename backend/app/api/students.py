import random
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.exc import IntegrityError
from app.database.connection import get_db
from app.config import settings
from app.models.user import User
from app.models.test import Test, TestQuestion
from app.models.question import Question, TestCase
from app.models.attempt import (
    StudentAttempt, StudentQuestion, StudentCode, Submission,
    AttemptStatus, SubmissionReason,
)
from app.models.violation import Violation
from app.schemas.schemas import (
    TestOut, AttemptOut, StudentQuestionOut, QuestionStudentOut,
    TestCasePublicOut, CodeSaveRequest, ViolationCreate, ViolationRecorded, UserOut,
    FinishAttemptRequest,
)
from app.security.dependencies import require_student
from app.utils import ensure_aware

router = APIRouter(prefix="/student", tags=["Student"])


def _status_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


async def _attempt_out(db: AsyncSession, attempt: StudentAttempt) -> AttemptOut:
    """Build AttemptOut with the test's max_violations attached."""
    test = await db.execute(select(Test).where(Test.id == attempt.test_id))
    test_row = test.scalar_one_or_none()
    return AttemptOut(
        id=attempt.id, student_id=attempt.student_id, test_id=attempt.test_id,
        started_at=attempt.started_at, expires_at=attempt.expires_at,
        submitted_at=attempt.submitted_at, status=_status_value(attempt.status),
        violation_count=attempt.violation_count,
        submission_reason=attempt.submission_reason,
        total_score=attempt.total_score, total_possible=attempt.total_possible,
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
    """Get tests categorized as upcoming, active, completed, scoped to the student's year."""
    now = datetime.now(timezone.utc)

    year_label = {2: "Second Year", 3: "Third Year"}.get(user.year)

    query = select(Test).order_by(Test.start_time.desc())
    if year_label:
        query = query.where(Test.year == year_label)
    result = await db.execute(query)
    tests = result.scalars().all()

    upcoming = []
    active = []
    completed = []

    for t in tests:
        # Check if student has an attempt
        attempt_result = await db.execute(
            select(StudentAttempt).where(
                StudentAttempt.student_id == user.id,
                StudentAttempt.test_id == t.id,
            )
        )
        attempt = attempt_result.scalar_one_or_none()

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

        if attempt:
            test_data["attempt_id"] = attempt.id
            test_data["attempt_status"] = _status_value(attempt.status)
            test_data["attempt_submitted_at"] = attempt.submitted_at.isoformat() if attempt.submitted_at else None

        attempt_status = _status_value(attempt.status) if attempt else None
        is_submitted = attempt_status in (
            AttemptStatus.SUBMITTED.value,
            AttemptStatus.AUTO_SUBMITTED.value,
        )

        if is_submitted:
            test_data["status"] = "completed"
            completed.append(test_data)
        elif ensure_aware(t.start_time) > now:
            test_data["status"] = "upcoming"
            upcoming.append(test_data)
        elif ensure_aware(t.end_time) >= now:
            test_data["status"] = "active"
            active.append(test_data)
        else:
            # Window ended without a submission: the test is no longer actionable.
            test_data["status"] = "completed"
            completed.append(test_data)

    return {"upcoming": upcoming, "active": active, "completed": completed}


@router.post("/tests/{test_id}/start", response_model=AttemptOut)
async def start_test(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """Start a test. Creates attempt with random question assignment. Idempotent."""
    now = datetime.now(timezone.utc)

    # Get test
    test_result = await db.execute(select(Test).where(Test.id == test_id))
    test = test_result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    # Validate test is active
    if ensure_aware(test.start_time) > now:
        raise HTTPException(status_code=400, detail="Test has not started yet")
    if ensure_aware(test.end_time) < now:
        raise HTTPException(status_code=400, detail="Test has already ended")

    # Check for existing attempt (idempotent)
    existing = await db.execute(
        select(StudentAttempt).where(
            StudentAttempt.student_id == user.id,
            StudentAttempt.test_id == test_id,
        )
    )
    attempt = existing.scalar_one_or_none()

    if attempt:
        # A submitted attempt is final: it cannot be reopened or retaken.
        if attempt.status in (AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED):
            raise HTTPException(
                status_code=400,
                detail="Test has already been submitted and cannot be restarted",
            )
        return await _attempt_out(db, attempt)

    # Get question pool grouped by difficulty
    pool_result = await db.execute(
        select(Question)
        .join(TestQuestion, TestQuestion.question_id == Question.id)
        .where(TestQuestion.test_id == test_id)
    )
    pool = pool_result.scalars().all()

    easy = [q for q in pool if (q.difficulty.value if hasattr(q.difficulty, 'value') else q.difficulty) == "easy"]
    medium = [q for q in pool if (q.difficulty.value if hasattr(q.difficulty, 'value') else q.difficulty) == "medium"]
    hard = [q for q in pool if (q.difficulty.value if hasattr(q.difficulty, 'value') else q.difficulty) == "hard"]

    # Select questions per difficulty distribution
    selected = []

    if test.easy_count > 0:
        if len(easy) < test.easy_count:
            raise HTTPException(status_code=400, detail=f"Not enough easy questions in pool ({len(easy)} < {test.easy_count})")
        selected.extend(random.sample(easy, test.easy_count))

    if test.medium_count > 0:
        if len(medium) < test.medium_count:
            raise HTTPException(status_code=400, detail=f"Not enough medium questions in pool ({len(medium)} < {test.medium_count})")
        selected.extend(random.sample(medium, test.medium_count))

    if test.hard_count > 0:
        if len(hard) < test.hard_count:
            raise HTTPException(status_code=400, detail=f"Not enough hard questions in pool ({len(hard)} < {test.hard_count})")
        selected.extend(random.sample(hard, test.hard_count))

    if len(selected) > test.questions_per_student:
        raise HTTPException(
            status_code=400,
            detail=f"Difficulty counts ({test.easy_count}+{test.medium_count}+{test.hard_count}) exceed questions per student ({test.questions_per_student})",
        )

    # If difficulty counts don't add up to questions_per_student, fill randomly
    if len(selected) < test.questions_per_student:
        remaining_pool = [q for q in pool if q not in selected]
        needed = test.questions_per_student - len(selected)
        if len(remaining_pool) < needed:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough questions in pool ({len(pool)} < {test.questions_per_student})",
            )
        selected.extend(random.sample(remaining_pool, needed))

    # Randomize order
    random.shuffle(selected)

    # Calculate expiry (minimum of duration or test end time)
    expires_at = min(
        now + timedelta(minutes=test.duration_minutes),
        ensure_aware(test.end_time),
    )

    # Create attempt
    attempt = StudentAttempt(
        student_id=user.id,
        test_id=test_id,
        started_at=now,
        expires_at=expires_at,
        status=AttemptStatus.IN_PROGRESS,
        violation_count=0,
        total_score=0,
        total_possible=sum(q.marks for q in selected),
    )
    db.add(attempt)
    try:
        await db.flush()
    except IntegrityError:
        # Concurrent start: another request already created the attempt
        await db.rollback()
        existing = await db.execute(
            select(StudentAttempt).where(
                StudentAttempt.student_id == user.id,
                StudentAttempt.test_id == test_id,
            )
        )
        attempt = existing.scalar_one()
        return await _attempt_out(db, attempt)
    await db.refresh(attempt)

    # Create student questions
    for pos, question in enumerate(selected, 1):
        sq = StudentQuestion(
            attempt_id=attempt.id,
            question_id=question.id,
            position=pos,
        )
        db.add(sq)

        # Create empty code entry
        code = StudentCode(
            attempt_id=attempt.id,
            question_id=question.id,
            language="python",
            source_code="",
        )
        db.add(code)

    await db.flush()

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
            StudentAttempt.student_id == user.id,
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

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
            StudentAttempt.student_id == user.id,
        )
    )
    attempt = attempt_result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if attempt.status in (AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED):
        raise HTTPException(
            status_code=400,
            detail="Attempt has already been submitted and can no longer be viewed"
        )

    now = datetime.now(timezone.utc)
    if now > ensure_aware(attempt.expires_at):
        raise HTTPException(status_code=400, detail="Attempt has expired")

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
            ).order_by(Submission.submitted_at.desc()).limit(1)
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
    if now > ensure_aware(attempt.expires_at):
        raise HTTPException(status_code=400, detail="Attempt has expired")

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
            StudentAttempt.student_id == user.id,
        )
    )
    attempt = attempt_result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if attempt.status in ("submitted", "auto_submitted"):
        raise HTTPException(status_code=400, detail="Attempt already submitted")

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

    # Check if violation limit reached — auto submit.
    # face_turned (camera-away) has its own stricter limit (2).
    test_result = await db.execute(select(Test).where(Test.id == attempt.test_id))
    test = test_result.scalar_one_or_none()

    limit_reached = False
    effective_max = test.max_violations if test else settings.MAX_VIOLATIONS_DEFAULT
    if data.violation_type == "face_turned":
        face_count_result = await db.execute(
            select(func.count(Violation.id)).where(
                Violation.attempt_id == attempt_id,
                Violation.violation_type == "face_turned",
            )
        )
        limit_reached = (face_count_result.scalar() or 0) >= settings.MAX_FACE_TURN_VIOLATIONS
        effective_max = settings.MAX_FACE_TURN_VIOLATIONS
    elif test:
        limit_reached = attempt.violation_count >= test.max_violations

    auto_submitted = False
    if limit_reached:
        attempt.status = AttemptStatus.AUTO_SUBMITTED
        attempt.submitted_at = now
        attempt.submission_reason = SubmissionReason.VIOLATION_LIMIT
        auto_submitted = True
        await db.flush()

    return ViolationRecorded(
        id=violation.id, attempt_id=violation.attempt_id,
        violation_type=violation.violation_type, created_at=violation.created_at,
        violation_count=attempt.violation_count,
        max_violations=effective_max,
        auto_submitted=auto_submitted,
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
            StudentAttempt.student_id == user.id,
        )
    )
    attempt = attempt_result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if _status_value(attempt.status) in ("submitted", "auto_submitted"):
        raise HTTPException(status_code=400, detail="Already submitted")

    now = datetime.now(timezone.utc)
    requested_status = data.status if data.status in ("submitted", "auto_submitted") else "submitted"
    attempt.status = (
        AttemptStatus.AUTO_SUBMITTED
        if requested_status == "auto_submitted"
        else AttemptStatus.SUBMITTED
    )
    attempt.submitted_at = now
    attempt.submission_reason = (
        SubmissionReason.TIME_EXPIRED
        if requested_status == "auto_submitted" or now > ensure_aware(attempt.expires_at)
        else SubmissionReason.MANUAL
    )

    # Calculate total score from the LATEST submission per question (avoid double counting)
    subs_result = await db.execute(
        select(Submission).where(Submission.attempt_id == attempt_id)
    )
    submissions = subs_result.scalars().all()
    scores_by_question = {}
    for s in submissions:
        scores_by_question[s.question_id] = s.score
    attempt.total_score = sum(scores_by_question.values())

    await db.flush()

    return {
        "message": "Test submitted successfully",
        "attempt_id": attempt.id,
        "test_id": attempt.test_id,
        "submitted_at": now.isoformat(),
        "status": requested_status,
        "total_score": attempt.total_score,
        "violation_count": attempt.violation_count,
    }

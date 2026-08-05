import csv
import io
import secrets
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, and_
from app.database.connection import get_db
from app.models.user import User, UserRole, UserStatus
from app.models.question import Question, TestCase
from app.models.test import Test, TestQuestion
from app.models.attempt import StudentAttempt, Submission, StudentQuestion, StudentCode
from app.models.violation import Violation
from app.models.question_bank import QuestionBank
from app.schemas.schemas import (
    StudentCreate, StudentUpdate, UserOut,
    QuestionCreate, QuestionUpdate, QuestionOut, TestCaseOut, TestCaseCreate,
    TestCreate, TestUpdate, TestOut,
    DashboardStats, DashboardData, SubmissionOut, AttemptOut,
    QuestionBankCreate, QuestionBankUpdate, QuestionBankOut,
    StudentMonitorRow, ResultRow, ViolationOut,
)
from app.security.dependencies import require_admin
from app.security.hashing import hash_password
from app.utils import ensure_aware
from app.services.attempt_lifecycle import submission_reason_for_status

router = APIRouter(prefix="/admin", tags=["Admin"])


async def _test_out(db: AsyncSession, test: Test) -> TestOut:
    """Build a TestOut with question_count and question_ids attached."""
    q_count = await db.execute(
        select(func.count(TestQuestion.id)).where(TestQuestion.test_id == test.id)
    )
    q_ids = await db.execute(
        select(TestQuestion.question_id).where(TestQuestion.test_id == test.id)
    )
    return TestOut(
        id=test.id, name=test.name, description=test.description,
        year=test.year, question_bank_id=test.question_bank_id,
        randomize_questions=test.randomize_questions,
        start_time=test.start_time, end_time=test.end_time,
        duration_minutes=test.duration_minutes, total_marks=test.total_marks,
        questions_per_student=test.questions_per_student,
        easy_count=test.easy_count, medium_count=test.medium_count, hard_count=test.hard_count,
        allowed_languages=test.allowed_languages,
        max_violations=test.max_violations, allow_copy_paste=test.allow_copy_paste,
        scoring_type=test.scoring_type if isinstance(test.scoring_type, str) else test.scoring_type.value,
        show_results=test.show_results,
        question_count=q_count.scalar() or 0,
        question_ids=list(q_ids.scalars().all()),
        created_at=test.created_at,
    )


async def _load_test_cases(db: AsyncSession, question_id: int) -> List[TestCaseOut]:
    tc_result = await db.execute(
        select(TestCase).where(TestCase.question_id == question_id)
    )
    return [
        TestCaseOut(id=tc.id, input=tc.input, expected_output=tc.expected_output, is_hidden=tc.is_hidden)
        for tc in tc_result.scalars().all()
    ]


def _question_out(q: Question, test_cases: Optional[List[TestCaseOut]] = None) -> QuestionOut:
    return QuestionOut(
        id=q.id, title=q.title, statement=q.statement,
        difficulty=q.difficulty.value if hasattr(q.difficulty, 'value') else q.difficulty,
        marks=q.marks, topic=q.topic,
        input_format=q.input_format, output_format=q.output_format,
        constraints=q.constraints, sample_input=q.sample_input,
        sample_output=q.sample_output, explanation=q.explanation,
        question_bank_id=q.question_bank_id,
        test_cases=test_cases or [],
        created_at=q.created_at,
    )


# ─── Dashboard ────────────────────────────────────────
@router.get("/dashboard", response_model=DashboardData)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Get aggregate dashboard statistics plus the raw lists the UI needs."""
    now = datetime.now(timezone.utc)
    total_students = (await db.execute(
        select(func.count(User.id)).where(User.role == UserRole.STUDENT)
    )).scalar() or 0
    total_tests = (await db.execute(select(func.count(Test.id)))).scalar() or 0
    active_tests = (await db.execute(
        select(func.count(Test.id)).where(and_(Test.start_time <= now, Test.end_time >= now))
    )).scalar() or 0
    completed_tests = (await db.execute(
        select(func.count(Test.id)).where(Test.end_time < now)
    )).scalar() or 0
    total_questions = (await db.execute(select(func.count(Question.id)))).scalar() or 0
    total_submissions = (await db.execute(select(func.count(Submission.id)))).scalar() or 0

    students = (await db.execute(
        select(User).where(User.role == UserRole.STUDENT)
    )).scalars().all()
    tests = (await db.execute(select(Test))).scalars().all()
    questions = (await db.execute(
        select(Question).order_by(Question.created_at.desc())
    )).scalars().all()
    attempts = (await db.execute(
        select(StudentAttempt).order_by(StudentAttempt.started_at.desc())
    )).scalars().all()
    submissions = (await db.execute(
        select(Submission).order_by(Submission.submitted_at.desc())
    )).scalars().all()
    banks = (await db.execute(
        select(QuestionBank).order_by(QuestionBank.created_at.desc())
    )).scalars().all()

    # Lookup used to fill total_possible (attempts do not store it).
    test_marks = {t.id: t.total_marks for t in tests}

    return DashboardData(
        total_students=total_students,
        total_tests=total_tests,
        active_tests=active_tests,
        completed_tests=completed_tests,
        total_questions=total_questions,
        total_submissions=total_submissions,
        students=[
            UserOut(
                id=s.id, email=s.email, register_number=s.register_number,
                name=s.name, role=s.role.value if hasattr(s.role, 'value') else s.role,
                department=s.department, year=s.year, section=s.section,
                status=s.status.value if hasattr(s.status, 'value') else s.status,
            ) for s in students
        ],
        tests=[await _test_out(db, t) for t in tests],
        questions=[_question_out(q) for q in questions],
        attempts=[
            AttemptOut(
                id=a.id, student_id=a.user_id, test_id=a.test_id,
                started_at=a.started_at, expires_at=a.expires_at,
                submitted_at=a.submitted_at,
                status=a.status if isinstance(a.status, str) else a.status.value,
                violation_count=a.violation_count or 0,
                submission_reason=submission_reason_for_status(a.status),
                total_score=float(a.score or 0),
                total_possible=test_marks.get(a.test_id),
            ) for a in attempts
        ],
        submissions=[SubmissionOut.from_orm(s) for s in submissions],
        banks=[QuestionBankOut.from_orm(b) for b in banks],
    )


# ─── Student Management ──────────────────────────────
@router.get("/students", response_model=List[UserOut])
async def list_students(
    search: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all students with optional search/filter."""
    query = select(User).where(User.role == UserRole.STUDENT)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            (User.name.ilike(search_term)) |
            (User.register_number.ilike(search_term)) |
            (User.email.ilike(search_term))
        )
    if department:
        query = query.where(User.department == department)
    if year:
        query = query.where(User.year == year)

    query = query.order_by(User.name)
    result = await db.execute(query)
    students = result.scalars().all()

    return [
        UserOut(
            id=s.id, email=s.email, register_number=s.register_number,
            name=s.name, role=s.role.value if hasattr(s.role, 'value') else s.role,
            department=s.department, year=s.year, section=s.section,
            status=s.status.value if hasattr(s.status, 'value') else s.status,
        ) for s in students
    ]


@router.post("/students", response_model=UserOut, status_code=201)
async def create_student(
    data: StudentCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a new student."""
    # Check uniqueness
    existing = await db.execute(
        select(User).where(
            (User.register_number == data.register_number) | (User.email == data.email)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Register number or email already exists")

    # Optional password: generate a strong random one when not provided.
    password = data.password or secrets.token_urlsafe(12)

    student = User(
        name=data.name,
        register_number=data.register_number,
        email=data.email,
        password_hash=hash_password(password),
        role=UserRole.STUDENT,
        department=data.department,
        year=data.year,
        section=data.section,
        status=UserStatus.ACTIVE,
        is_active=True,
    )
    db.add(student)
    await db.flush()
    await db.refresh(student)

    return UserOut(
        id=student.id, email=student.email, register_number=student.register_number,
        name=student.name, role="student", department=student.department,
        year=student.year, section=student.section, status="active",
    )


@router.put("/students/{student_id}", response_model=UserOut)
async def update_student(
    student_id: int,
    data: StudentUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update student details."""
    result = await db.execute(
        select(User).where(User.id == student_id, User.role == UserRole.STUDENT)
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    update_data = data.model_dump(exclude_unset=True)
    if "password" in update_data:
        student.password_hash = hash_password(update_data.pop("password"))
    if "status" in update_data:
        new_status = update_data.pop("status")
        if new_status not in ("active", "inactive"):
            raise HTTPException(status_code=400, detail="status must be 'active' or 'inactive'")
        student.status = UserStatus.ACTIVE if new_status == "active" else UserStatus.INACTIVE
        student.is_active = new_status == "active"

    for field, value in update_data.items():
        setattr(student, field, value)

    await db.flush()
    await db.refresh(student)

    return UserOut(
        id=student.id, email=student.email, register_number=student.register_number,
        name=student.name, role="student", department=student.department,
        year=student.year, section=student.section,
        status=student.status.value if hasattr(student.status, 'value') else student.status,
    )


@router.delete("/students/{student_id}")
async def delete_student(
    student_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a student."""
    result = await db.execute(
        select(User).where(User.id == student_id, User.role == UserRole.STUDENT)
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    await db.delete(student)
    return {"message": "Student deleted"}


@router.post("/students/import")
async def import_students_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Bulk import students from CSV. Columns: name, register_number, email, department, year, section, password"""
    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))

    created = 0
    errors = []
    seen_regs = set()
    seen_emails = set()
    created_passwords = []

    for i, row in enumerate(reader, start=2):
        try:
            reg = row.get("register_number", "").strip()
            email = row.get("email", "").strip()
            name = row.get("name", "").strip()

            if not reg or not name:
                errors.append(f"Row {i}: register_number and name are required")
                continue

            if reg in seen_regs:
                errors.append(f"Row {i}: {reg} is a duplicate within the file")
                continue
            seen_regs.add(reg)

            if email and email in seen_emails:
                errors.append(f"Row {i}: {email} is a duplicate within the file")
                continue
            if email:
                seen_emails.add(email)

            # Check duplicate in database
            existing = await db.execute(
                select(User).where(
                    (User.register_number == reg) | (User.email == email)
                )
            )
            if existing.scalar_one_or_none():
                errors.append(f"Row {i}: {reg} already exists")
                continue

            year = None
            if row.get("year"):
                year = int(row["year"])

            # If no password is provided, generate a strong random one instead
            # of defaulting to the register number.
            raw_password = (row.get("password") or "").strip()
            password = raw_password if raw_password else secrets.token_urlsafe(12)

            student = User(
                name=name,
                register_number=reg,
                email=email or f"{reg.lower()}@codearena.com",
                password_hash=hash_password(password),
                role=UserRole.STUDENT,
                department=row.get("department", "").strip() or None,
                year=year,
                section=row.get("section", "").strip() or None,
                status=UserStatus.ACTIVE,
                is_active=True,
            )
            db.add(student)
            created += 1
            if not raw_password:
                created_passwords.append(f"{reg}: {password}")
        except Exception as e:
            errors.append(f"Row {i}: {str(e)}")

    await db.flush()
    return {
        "created": created,
        "errors": errors,
        "generated_passwords": created_passwords,
    }


# ─── Question Bank ────────────────────────────────────
@router.get("/questions", response_model=List[QuestionOut])
async def list_questions(
    difficulty: Optional[str] = Query(None),
    topic: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all questions with optional filters."""
    query = select(Question)

    if difficulty:
        query = query.where(Question.difficulty == difficulty)
    if topic:
        query = query.where(Question.topic == topic)
    if search:
        query = query.where(
            (Question.title.ilike(f"%{search}%")) | (Question.topic.ilike(f"%{search}%"))
        )

    query = query.order_by(Question.created_at.desc())
    result = await db.execute(query)
    questions = result.scalars().all()

    return [_question_out(q, await _load_test_cases(db, q.id)) for q in questions]


@router.post("/questions", response_model=QuestionOut, status_code=201)
async def create_question(
    data: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a coding question with test cases."""
    question = Question(
        title=data.title, statement=data.statement,
        difficulty=data.difficulty, marks=data.marks, topic=data.topic,
        input_format=data.input_format, output_format=data.output_format,
        constraints=data.constraints, sample_input=data.sample_input,
        sample_output=data.sample_output, explanation=data.explanation,
        question_bank_id=data.question_bank_id,
    )
    db.add(question)
    await db.flush()
    await db.refresh(question)

    test_cases = []
    for tc_data in data.test_cases:
        tc = TestCase(
            question_id=question.id,
            input=tc_data.input,
            expected_output=tc_data.expected_output,
            is_hidden=tc_data.is_hidden,
        )
        db.add(tc)
        await db.flush()
        await db.refresh(tc)
        test_cases.append(TestCaseOut(
            id=tc.id, input=tc.input, expected_output=tc.expected_output, is_hidden=tc.is_hidden
        ))

    return _question_out(question, test_cases)


@router.get("/questions/{question_id}", response_model=QuestionOut)
async def get_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get a single question with all test cases."""
    result = await db.execute(select(Question).where(Question.id == question_id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    return _question_out(q, await _load_test_cases(db, q.id))


@router.put("/questions/{question_id}", response_model=QuestionOut)
async def update_question(
    question_id: int,
    data: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update a question. When test_cases is provided, the full set is replaced."""
    result = await db.execute(select(Question).where(Question.id == question_id))
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    update_data = data.model_dump(exclude_unset=True)
    test_cases = update_data.pop("test_cases", None)

    if "question_bank_id" in update_data:
        value = update_data.pop("question_bank_id")
        if isinstance(value, str) and value == "":
            value = None
        question.question_bank_id = value

    for field, value in update_data.items():
        setattr(question, field, value)

    if test_cases is not None:
        await db.execute(delete(TestCase).where(TestCase.question_id == question.id))
        for tc_data in test_cases:
            db.add(TestCase(
                question_id=question.id,
                input=tc_data.input,
                expected_output=tc_data.expected_output,
                is_hidden=tc_data.is_hidden,
            ))

    await db.flush()
    await db.refresh(question)

    return _question_out(question, await _load_test_cases(db, question.id))


@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a question and its test cases."""
    result = await db.execute(select(Question).where(Question.id == question_id))
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    await db.delete(question)
    return {"message": "Question deleted"}


# ─── Test Case Management ────────────────────────────
@router.post("/questions/{question_id}/test-cases", response_model=TestCaseOut, status_code=201)
async def add_test_case(
    question_id: int,
    data: TestCaseCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Add a test case to a question."""
    result = await db.execute(select(Question).where(Question.id == question_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Question not found")

    tc = TestCase(
        question_id=question_id,
        input=data.input,
        expected_output=data.expected_output,
        is_hidden=data.is_hidden,
    )
    db.add(tc)
    await db.flush()
    await db.refresh(tc)

    return TestCaseOut(id=tc.id, input=tc.input, expected_output=tc.expected_output, is_hidden=tc.is_hidden)


@router.delete("/test-cases/{test_case_id}")
async def delete_test_case(
    test_case_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a test case."""
    result = await db.execute(select(TestCase).where(TestCase.id == test_case_id))
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found")

    await db.delete(tc)
    return {"message": "Test case deleted"}


# ─── Question Bank Management ─────────────────────────
@router.get("/question-banks", response_model=List[QuestionBankOut])
async def list_question_banks(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all question banks."""
    result = await db.execute(select(QuestionBank).order_by(QuestionBank.created_at.desc()))
    return result.scalars().all()


@router.post("/question-banks", response_model=QuestionBankOut, status_code=201)
async def create_question_bank(
    data: QuestionBankCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a question bank."""
    bank = QuestionBank(
        title=data.title,
        description=data.description,
        year=data.year or "Second Year",
        status=data.status or "Active",
    )
    db.add(bank)
    await db.flush()
    await db.refresh(bank)
    return QuestionBankOut.from_orm(bank)


@router.get("/question-banks/{bank_id}", response_model=QuestionBankOut)
async def get_question_bank(
    bank_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get a single question bank."""
    result = await db.execute(select(QuestionBank).where(QuestionBank.id == bank_id))
    bank = result.scalar_one_or_none()
    if not bank:
        raise HTTPException(status_code=404, detail="Question bank not found")
    return QuestionBankOut.from_orm(bank)


@router.put("/question-banks/{bank_id}", response_model=QuestionBankOut)
async def update_question_bank(
    bank_id: int,
    data: QuestionBankUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update a question bank."""
    result = await db.execute(select(QuestionBank).where(QuestionBank.id == bank_id))
    bank = result.scalar_one_or_none()
    if not bank:
        raise HTTPException(status_code=404, detail="Question bank not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(bank, field, value)

    await db.flush()
    await db.refresh(bank)
    return QuestionBankOut.from_orm(bank)


@router.delete("/question-banks/{bank_id}")
async def delete_question_bank(
    bank_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a question bank. Questions and tests referencing it lose the link."""
    result = await db.execute(select(QuestionBank).where(QuestionBank.id == bank_id))
    bank = result.scalar_one_or_none()
    if not bank:
        raise HTTPException(status_code=404, detail="Question bank not found")

    await db.delete(bank)
    return {"message": "Question bank deleted"}


# ─── Test Management ─────────────────────────────────
@router.get("/tests", response_model=List[TestOut])
async def list_tests(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all tests."""
    result = await db.execute(select(Test).order_by(Test.created_at.desc()))
    tests = result.scalars().all()

    output = []
    for t in tests:
        output.append(await _test_out(db, t))

    return output


@router.post("/tests", response_model=TestOut, status_code=201)
async def create_test(
    data: TestCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a new test with question pool."""
    # Validate the question pool is large enough and all question ids exist
    if len(data.question_ids) < data.questions_per_student:
        raise HTTPException(
            status_code=400,
            detail=f"Question pool has {len(data.question_ids)} questions but test requires {data.questions_per_student} per student",
        )

    pool_result = await db.execute(
        select(func.count(Question.id)).where(Question.id.in_(data.question_ids))
    )
    if pool_result.scalar() != len(data.question_ids):
        raise HTTPException(status_code=400, detail="One or more question ids do not exist")

    test = Test(
        name=data.name, description=data.description,
        year=data.year, question_bank_id=data.question_bank_id,
        randomize_questions=data.randomize_questions,
        start_time=data.start_time, end_time=data.end_time,
        duration_minutes=data.duration_minutes, total_marks=data.total_marks,
        questions_per_student=data.questions_per_student,
        easy_count=data.easy_count, medium_count=data.medium_count, hard_count=data.hard_count,
        allowed_languages=data.allowed_languages,
        max_violations=data.max_violations, allow_copy_paste=data.allow_copy_paste,
        scoring_type=data.scoring_type, show_results=data.show_results,
    )
    db.add(test)
    await db.flush()
    await db.refresh(test)

    # Add question pool
    for qid in data.question_ids:
        tq = TestQuestion(test_id=test.id, question_id=qid)
        db.add(tq)

    await db.flush()

    return await _test_out(db, test)


@router.put("/tests/{test_id}", response_model=TestOut)
async def update_test(
    test_id: int,
    data: TestUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update a test."""
    result = await db.execute(select(Test).where(Test.id == test_id))
    test = result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    update_data = data.model_dump(exclude_unset=True)
    question_ids = update_data.pop("question_ids", None)

    qps = data.questions_per_student if data.questions_per_student is not None else test.questions_per_student

    # Validate pool size if question pool is being replaced
    if question_ids is not None and len(question_ids) < qps:
        raise HTTPException(
            status_code=400,
            detail=f"Question pool has {len(question_ids)} questions but test requires {qps} per student",
        )

    # If replacing the pool, verify all ids exist
    if question_ids is not None:
        pool_result = await db.execute(
            select(func.count(Question.id)).where(Question.id.in_(question_ids))
        )
        if pool_result.scalar() != len(question_ids):
            raise HTTPException(status_code=400, detail="One or more question ids do not exist")

    for field, value in update_data.items():
        setattr(test, field, value)

    if question_ids is not None:
        await db.execute(delete(TestQuestion).where(TestQuestion.test_id == test.id))
        for qid in question_ids:
            db.add(TestQuestion(test_id=test.id, question_id=qid))

    await db.flush()
    await db.refresh(test)

    return await _test_out(db, test)


@router.delete("/tests/{test_id}")
async def delete_test(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a test."""
    result = await db.execute(select(Test).where(Test.id == test_id))
    test = result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    await db.delete(test)
    return {"message": "Test deleted"}


# ─── Live Monitoring ──────────────────────────────────
@router.get("/tests/{test_id}/monitor", response_model=List[StudentMonitorRow])
async def monitor_test(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get live monitoring data for a test."""
    now = datetime.now(timezone.utc)

    # Get all students
    students_result = await db.execute(
        select(User).where(User.role == UserRole.STUDENT, User.is_active == True)
    )
    students = students_result.scalars().all()

    rows = []
    for student in students:
        # Get attempt for this test
        attempt_result = await db.execute(
            select(StudentAttempt).where(
                StudentAttempt.user_id == student.id,
                StudentAttempt.test_id == test_id,
            )
        )
        attempt = attempt_result.scalar_one_or_none()

        if not attempt:
            rows.append(StudentMonitorRow(
                student_id=student.id,
                student_name=student.name,
                register_number=student.register_number or "",
                status="not_started",
                questions_attempted=0,
                questions_submitted=0,
                violation_count=0,
            ))
            continue

        # Count attempted (has saved code)
        code_count = await db.execute(
            select(func.count(StudentCode.id)).where(
                StudentCode.attempt_id == attempt.id,
                StudentCode.source_code != "",
                StudentCode.source_code.isnot(None),
            )
        )
        questions_attempted = code_count.scalar() or 0

        # Count submitted
        sub_count = await db.execute(
            select(func.count(Submission.id)).where(Submission.attempt_id == attempt.id)
        )
        questions_submitted = sub_count.scalar() or 0

        last_activity = None

        # Determine status
        if attempt.status in ("submitted", "auto_submitted"):
            status_str = attempt.status
        elif ensure_aware(attempt.expires_at) < now:
            status_str = "auto_submitted"
        else:
            # Check last activity
            last_code = await db.execute(
                select(StudentCode.updated_at)
                .where(StudentCode.attempt_id == attempt.id)
                .order_by(StudentCode.updated_at.desc())
                .limit(1)
            )
            last_activity = last_code.scalar_one_or_none()

            if last_activity and (now - ensure_aware(last_activity)).total_seconds() > 120:
                status_str = "disconnected"
            else:
                status_str = "writing"

        expires_at = ensure_aware(attempt.expires_at)
        remaining = max(0, int((expires_at - now).total_seconds())) if expires_at > now else 0

        rows.append(StudentMonitorRow(
            student_id=student.id,
            student_name=student.name,
            register_number=student.register_number or "",
            status=status_str,
            questions_attempted=questions_attempted,
            questions_submitted=questions_submitted,
            violation_count=attempt.violation_count or 0,
            remaining_seconds=remaining,
            last_activity=last_activity,
        ))

    return rows


# ─── Results ──────────────────────────────────────────
@router.get("/tests/{test_id}/results", response_model=List[ResultRow])
async def get_test_results(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get results for a test."""
    test_result = await db.execute(select(Test).where(Test.id == test_id))
    test = test_result.scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    total_possible = test.total_marks or 0

    attempts_result = await db.execute(
        select(StudentAttempt).where(StudentAttempt.test_id == test_id)
    )
    attempts = attempts_result.scalars().all()

    rows = []
    for attempt in attempts:
        # Get student
        student_result = await db.execute(select(User).where(User.id == attempt.student_id))
        student = student_result.scalar_one_or_none()
        if not student:
            continue

        # Count questions assigned
        sq_count = await db.execute(
            select(func.count(StudentQuestion.id)).where(StudentQuestion.attempt_id == attempt.id)
        )
        questions_assigned = sq_count.scalar() or 0

        # Count attempted (has code)
        code_count = await db.execute(
            select(func.count(StudentCode.id)).where(
                StudentCode.attempt_id == attempt.id,
                StudentCode.source_code != "",
                StudentCode.source_code.isnot(None),
            )
        )
        questions_attempted = code_count.scalar() or 0

        # Count submitted & get scores
        subs_result = await db.execute(
            select(Submission).where(Submission.attempt_id == attempt.id)
        )
        submissions = subs_result.scalars().all()
        # A submission only counts as solved when it actually ran against test
        # cases: NULL/0 totals (legacy or ungraded rows) must not be treated as
        # fully solved, since None == None would otherwise count them.
        questions_solved = sum(
            1 for s in submissions
            if s.total_test_cases and s.passed_test_cases == s.total_test_cases
        )

        score = attempt.total_score or 0
        percentage = (score / total_possible * 100) if total_possible > 0 else 0

        rows.append(ResultRow(
            rank=0,  # Will be calculated after sorting
            student_name=student.name,
            register_number=student.register_number or "",
            department=student.department,
            questions_assigned=questions_assigned,
            questions_attempted=questions_attempted,
            questions_solved=questions_solved,
            score=score,
            total_possible=total_possible,
            percentage=round(percentage, 2),
            violation_count=attempt.violation_count or 0,
            submission_type=submission_reason_for_status(attempt.status),
            submitted_at=attempt.submitted_at,
        ))

    # Sort by score descending and assign ranks
    rows.sort(key=lambda r: r.score, reverse=True)
    for i, row in enumerate(rows, 1):
        row.rank = i

    return rows


# ─── Violations ───────────────────────────────────────
@router.get("/violations", response_model=List[ViolationOut])
async def list_violations(
    test_id: Optional[int] = Query(None),
    student_id: Optional[int] = Query(None),
    violation_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List violations with filters."""
    query = select(Violation)

    if test_id:
        query = query.join(StudentAttempt).where(StudentAttempt.test_id == test_id)
    if student_id:
        if test_id:
            query = query.where(StudentAttempt.user_id == student_id)
        else:
            query = query.join(StudentAttempt).where(StudentAttempt.user_id == student_id)
    if violation_type:
        query = query.where(Violation.violation_type == violation_type)

    query = query.order_by(Violation.created_at.desc())
    result = await db.execute(query)
    violations = result.scalars().all()

    return [ViolationOut(
        id=v.id, attempt_id=v.attempt_id, violation_type=v.violation_type,
        created_at=v.created_at,
    ) for v in violations]


@router.get("/tests/{test_id}/violations", response_model=List[ViolationOut])
async def get_test_violations(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get all violations for a specific test."""
    result = await db.execute(
        select(Violation)
        .join(StudentAttempt)
        .where(StudentAttempt.test_id == test_id)
        .order_by(Violation.created_at.desc())
    )
    violations = result.scalars().all()

    return [ViolationOut(
        id=v.id, attempt_id=v.attempt_id, violation_type=v.violation_type,
        created_at=v.created_at,
    ) for v in violations]

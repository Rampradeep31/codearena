import enum
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Integer, Float, func, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database.connection import Base


class AttemptStatus(str, enum.Enum):
    """Canonical attempt lifecycle. Only these four values are ever persisted.

    NOT_STARTED is the implicit state before a test_attempts row exists
    (login / dashboard / refresh never create a row). A row is created only
    by Start Test (IN_PROGRESS), then moved to SUBMITTED (manual finish) or
    AUTO_SUBMITTED (server-side timer expiry).
    """
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    AUTO_SUBMITTED = "auto_submitted"


class SubmissionReason(str, enum.Enum):
    MANUAL = "manual"
    TIME_EXPIRED = "time_expired"


class StudentAttempt(Base):
    __tablename__ = "test_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    test_id: Mapped[int] = mapped_column(
        ForeignKey("tests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=AttemptStatus.IN_PROGRESS.value
    )
    violation_count: Mapped[int] = mapped_column(Integer, nullable=True, default=0)
    score: Mapped[int] = mapped_column(Integer, nullable=True, default=0)

    __table_args__ = (
        UniqueConstraint("user_id", "test_id", name="uq_user_test"),
    )


class StudentQuestionAssignment(Base):
    """Stable per-student question assignment for a test.

    Created exactly once when the student first starts the test and never
    changed afterwards, so a refresh always returns the same question. The
    UNIQUE(student_id, test_id) constraint guarantees a single assignment.
    """
    __tablename__ = "student_question_assignments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    test_id: Mapped[int] = mapped_column(
        ForeignKey("tests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("student_id", "test_id", name="uq_student_test_assignment"),
    )


class StudentQuestion(Base):
    """Maps assigned questions to a student's test attempt (random selection result)."""
    __tablename__ = "student_questions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("test_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_student_question_attempt_question"),
    )


class StudentCode(Base):
    """Auto-saved student code draft for each question in an attempt."""
    __tablename__ = "student_code"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("test_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    language: Mapped[str] = mapped_column(String(20), nullable=False, default="python")
    source_code: Mapped[str] = mapped_column(Text, nullable=True, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_student_code_attempt_question"),
    )


class Submission(Base):
    """Final graded code submission for a question."""
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("test_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    language: Mapped[str] = mapped_column(String(20), nullable=False, default="python")
    code: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    status: Mapped[str] = mapped_column(String(50), nullable=True, default="submitted")
    score: Mapped[float] = mapped_column(Float, nullable=True, default=0)
    total_test_cases: Mapped[int] = mapped_column(Integer, nullable=True, default=0)
    passed_test_cases: Mapped[int] = mapped_column(Integer, nullable=True, default=0)


class SubmissionResult(Base):
    """Per-test-case result for a submission (backend-managed detail table)."""
    __tablename__ = "submission_results"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    test_case_id: Mapped[int] = mapped_column(Integer, nullable=True, default=0)
    passed: Mapped[bool] = mapped_column(nullable=False, default=False)
    output: Mapped[str] = mapped_column(Text, nullable=True)
    execution_time: Mapped[float] = mapped_column(Float, nullable=True)
    memory_used: Mapped[int] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=True)

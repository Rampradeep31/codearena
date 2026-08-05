import enum
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Integer, Float, func, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database.connection import Base


class AttemptStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    AUTO_SUBMITTED = "auto_submitted"
    EXPIRED = "expired"


class SubmissionReason(str, enum.Enum):
    MANUAL = "manual"
    TIME_EXPIRED = "time_expired"
    VIOLATION_LIMIT = "violation_limit"


class StudentAttempt(Base):
    """Maps to Supabase public.test_attempts (single source of truth)."""

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

    # ── Compatibility shims (instance-level reads only) ──────────────
    # These exist so legacy call sites like attempt.student_id / attempt.total_score
    # keep working after the student_id→user_id and total_score→score renames.
    # They are plain Python properties, NOT mapped columns: in SQLAlchemy WHERE
    # filters you MUST use StudentAttempt.user_id / StudentAttempt.score.
    # Using StudentAttempt.student_id in a .where() silently yields WHERE false
    # (a property object never equals an int), hiding all rows.
    @property
    def student_id(self) -> int:
        return self.user_id

    @student_id.setter
    def student_id(self, value: int) -> None:
        self.user_id = value

    @property
    def total_score(self) -> float:
        return float(self.score or 0)

    @total_score.setter
    def total_score(self, value) -> None:
        self.score = int(value or 0)


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
    """Auto-saved student code for each question in an attempt."""
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
    """Final code submission for a question (Supabase public.submissions)."""
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("test_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    language: Mapped[str] = mapped_column(String(20), nullable=False, default="python")
    source_code: Mapped[str] = mapped_column("code", Text, nullable=False, default="")
    submitted_at: Mapped[datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=func.now()
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

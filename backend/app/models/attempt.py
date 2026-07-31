import enum
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Integer, Float, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database.connection import Base


class AttemptStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    AUTO_SUBMITTED = "auto_submitted"


class SubmissionReason(str, enum.Enum):
    MANUAL = "manual"
    TIME_EXPIRED = "time_expired"
    VIOLATION_LIMIT = "violation_limit"


class StudentAttempt(Base):
    __tablename__ = "student_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    test_id: Mapped[int] = mapped_column(
        ForeignKey("tests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[AttemptStatus] = mapped_column(
        String(20), nullable=False, default=AttemptStatus.IN_PROGRESS
    )
    violation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    submission_reason: Mapped[str] = mapped_column(String(20), nullable=True)
    total_score: Mapped[float] = mapped_column(Float, nullable=True, default=0)
    total_possible: Mapped[float] = mapped_column(Float, nullable=True, default=0)


class StudentQuestion(Base):
    """Maps assigned questions to a student's test attempt (random selection result)."""
    __tablename__ = "student_questions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("student_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)


class StudentCode(Base):
    """Auto-saved student code for each question in an attempt."""
    __tablename__ = "student_code"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("student_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    language: Mapped[str] = mapped_column(String(20), nullable=False, default="python")
    source_code: Mapped[str] = mapped_column(Text, nullable=True, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Submission(Base):
    """Final code submission for a question."""
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("student_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    language: Mapped[str] = mapped_column(String(20), nullable=False)
    source_code: Mapped[str] = mapped_column(Text, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    total_test_cases: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    passed_test_cases: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class SubmissionResult(Base):
    """Per-test-case result for a submission."""
    __tablename__ = "submission_results"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    test_case_id: Mapped[int] = mapped_column(
        ForeignKey("test_cases.id", ondelete="CASCADE"), nullable=False
    )
    passed: Mapped[bool] = mapped_column(nullable=False, default=False)
    output: Mapped[str] = mapped_column(Text, nullable=True)
    execution_time: Mapped[float] = mapped_column(Float, nullable=True)
    memory_used: Mapped[int] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=True)  # e.g., "Accepted", "Wrong Answer", "TLE"

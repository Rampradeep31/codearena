import enum
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Integer, func, Boolean, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database.connection import Base


class ScoringType(str, enum.Enum):
    PARTIAL = "partial"
    ALL_OR_NOTHING = "all_or_nothing"


class Test(Base):
    __tablename__ = "tests"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    total_marks: Mapped[int] = mapped_column(Integer, nullable=False)
    questions_per_student: Mapped[int] = mapped_column(Integer, nullable=False)

    # Difficulty distribution: how many of each difficulty to assign
    easy_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    medium_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hard_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Allowed languages as JSON array e.g. ["python", "java", "c", "cpp"]
    allowed_languages: Mapped[list] = mapped_column(
        JSON, nullable=False, default=lambda: ["python", "java", "c", "cpp"]
    )

    # Proctoring settings
    max_violations: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    allow_copy_paste: Mapped[bool] = mapped_column(Boolean, default=False)

    # Scoring
    scoring_type: Mapped[ScoringType] = mapped_column(
        String(20), nullable=False, default=ScoringType.PARTIAL
    )

    # Whether students can see results after submission
    show_results: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TestQuestion(Base):
    """Maps questions to a test's question pool."""
    __tablename__ = "test_questions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    test_id: Mapped[int] = mapped_column(
        ForeignKey("tests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )

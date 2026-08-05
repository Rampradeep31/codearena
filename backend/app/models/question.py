import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, Enum, DateTime, Integer, func, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database.connection import Base


class Difficulty(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    easy = "easy"
    medium = "medium"
    hard = "hard"


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[Difficulty] = mapped_column(
        Enum(Difficulty, native_enum=False, values_callable=lambda obj: [e.value for e in obj]), nullable=False
    )
    marks: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    topic: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="General", server_default="General")
    input_format: Mapped[str] = mapped_column(Text, nullable=True)
    output_format: Mapped[str] = mapped_column(Text, nullable=True)
    constraints: Mapped[str] = mapped_column(Text, nullable=True)
    sample_input: Mapped[str] = mapped_column(Text, nullable=True)
    sample_output: Mapped[str] = mapped_column(Text, nullable=True)
    explanation: Mapped[str] = mapped_column(Text, nullable=True)
    question_bank_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("question_banks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TestCase(Base):
    __tablename__ = "test_cases"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    input: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output: Mapped[str] = mapped_column(Text, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

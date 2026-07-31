import enum
from datetime import datetime
from sqlalchemy import String, DateTime, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database.connection import Base


class ViolationType(str, enum.Enum):
    TAB_HIDDEN = "tab_hidden"
    WINDOW_BLUR = "window_blur"
    FULLSCREEN_EXIT = "fullscreen_exit"
    COPY_ATTEMPT = "copy_attempt"
    PASTE_ATTEMPT = "paste_attempt"


class Violation(Base):
    __tablename__ = "violations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("student_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    violation_type: Mapped[ViolationType] = mapped_column(
        String(30), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

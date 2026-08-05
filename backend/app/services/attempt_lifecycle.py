import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attempt import AttemptStatus
from app.utils import ensure_aware

logger = logging.getLogger("attempt_lifecycle")


def _status_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


async def auto_submit_expired(db: AsyncSession, attempt) -> bool:
    """Server-side expiry enforcement.

    Transitions an in_progress attempt to ``auto_submitted`` the moment its
    ``expires_at`` passes. This is the ONLY place an attempt may become
    auto_submitted on the server: a client cannot complete an exam early, and
    a refresh can never change exam state because the same server-side rule
    runs on every attempt read.

    Returns True when the attempt was transitioned, False otherwise.
    """
    if attempt is None:
        return False
    if _status_value(attempt.status) != AttemptStatus.IN_PROGRESS.value:
        return False

    now = datetime.now(timezone.utc)
    expires_at = ensure_aware(attempt.expires_at)
    if now <= expires_at:
        return False

    attempt.status = AttemptStatus.AUTO_SUBMITTED.value
    attempt.submitted_at = now
    try:
        await db.flush()
        # Commit immediately so concurrent readers observe the final status.
        await db.commit()
        await db.refresh(attempt)
    except Exception:
        # If the commit fails (e.g. race condition — another request already
        # committed the same transition) roll back silently and re-read the
        # attempt to return its authoritative final state.
        await db.rollback()
        from sqlalchemy import select
        from app.models.attempt import StudentAttempt as _SA
        refreshed = await db.execute(select(_SA).where(_SA.id == attempt.id))
        refreshed_row = refreshed.scalar_one_or_none()
        if refreshed_row:
            attempt.status = refreshed_row.status
            attempt.submitted_at = refreshed_row.submitted_at
    logger.info(
        f"[ATTEMPT] action=auto_submit_expired student_id={attempt.user_id} "
        f"test_id={attempt.test_id} attempt_id={attempt.id} reason=timer_expired "
        f"ts={now.isoformat()}"
    )
    return True


def submission_reason_for_status(status) -> str:
    """Map an attempt status back to its SubmissionReason label."""
    s = _status_value(status)
    if s == AttemptStatus.AUTO_SUBMITTED.value:
        return "time_expired"
    if s == AttemptStatus.SUBMITTED.value:
        return "manual"
    return None

from datetime import datetime, timezone


def ensure_aware(dt):
    """Ensure a datetime is timezone-aware (UTC).

    SQLite stores naive datetimes, so values read back from the database
    must be normalized to UTC before comparing against aware datetimes.
    """
    if dt is None:
        return dt
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def ensure_aware_utc(dt):
    """Normalize to UTC regardless of the original offset."""
    dt = ensure_aware(dt)
    return dt.astimezone(timezone.utc) if dt else dt

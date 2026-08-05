from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from app.config import settings


# Supabase (Postgres) is the ONLY database in production. The test suite
# overrides DATABASE_URL with a throwaway SQLite file purely as test
# infrastructure; the production code paths below contain no SQLite logic.
db_url = settings.DATABASE_URL.strip()

if db_url.startswith("postgresql"):
    engine = create_async_engine(
        db_url,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=3600,
        connect_args={
            "ssl": "require",
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
        },
    )
elif db_url.startswith("sqlite") and settings.JUDGE_ENGINE == "local":
    # Test harness only (aiosqlite temp file, set by backend/tests/conftest.py).
    # WAL + busy timeout let the concurrent-start tests exercise the same
    # unique-constraint races that Postgres handles natively in production.
    engine = create_async_engine(db_url, connect_args={"timeout": 30})

    @event.listens_for(engine.sync_engine, "connect")
    def _set_test_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()
else:
    # Supabase (Postgres) is the only database. A misconfigured URL must fail
    # loudly instead of silently falling back to another storage engine.
    raise RuntimeError(
        f"DATABASE_URL must be a Postgres URL (got {db_url!r}). "
        "SQLite is only accepted for the integration test suite."
    )

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """Dependency that provides a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables():
    """Best-effort schema bootstrap for self-managed Postgres.

    For Supabase the authoritative schema is applied via ``supabase_schema.sql``
    in the SQL editor; ``create_all(checkfirst=True)`` here only creates tables
    that are missing, so it is safe in both setups. Failures are logged, never
    fatal — a missing table will surface as a clear query error instead of a
    silent startup crash.
    """
    try:
        async with engine.begin() as conn:
            from app.models import user, test, question, attempt, violation, question_bank  # noqa: F401
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        print(f"Startup table check warning: {e}")

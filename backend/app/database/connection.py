from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from app.config import settings


# Supabase (Postgres) is the ONLY database in production. The test suite
# overrides DATABASE_URL with a throwaway SQLite file purely as test
# infrastructure; the production code paths below contain no SQLite logic.
db_url = settings.DATABASE_URL.strip()

# config.py already raises if DATABASE_URL is an unset SQLite default outside
# JUDGE_ENGINE=local, so by the time we get here db_url is trustworthy.
if db_url.startswith("postgresql://"):
    db_url = "postgresql+asyncpg://" + db_url[len("postgresql://"):]
elif db_url.startswith("postgres://"):
    db_url = "postgresql+asyncpg://" + db_url[len("postgres://"):]

if db_url.startswith("postgresql+asyncpg"):
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


async def ensure_admin_user():
    """Ensure default admin user exists in Postgres on startup."""
    try:
        from app.models.user import User, UserRole, UserStatus
        from app.security.hashing import hash_password
        from sqlalchemy import select
        async with AsyncSessionLocal() as session:
            admin_email = "admin@codearena.com"
            res = await session.execute(select(User).where(User.email == admin_email))
            existing = res.scalar_one_or_none()
            if not existing:
                admin = User(
                    email=admin_email,
                    name="Admin User",
                    password_hash=hash_password("admin123"),
                    role=UserRole.ADMIN,
                    status=UserStatus.ACTIVE,
                    is_active=True,
                )
                session.add(admin)
                await session.commit()
                print(f"[STARTUP] Default admin user ensured ({admin_email}).")
    except Exception as e:
        print(f"[STARTUP] ensure_admin_user warning: {e}")


async def create_tables():
    """Best-effort schema bootstrap for self-managed Postgres."""
    try:
        async with engine.begin() as conn:
            from app.models import user, test, question, attempt, violation, question_bank  # noqa: F401
            await conn.run_sync(Base.metadata.create_all)
        await ensure_admin_user()
    except Exception as e:
        print(f"Startup table check warning: {e}")

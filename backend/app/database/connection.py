from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings


engine_kwargs = {"echo": False}
if not settings.DATABASE_URL.startswith("sqlite"):
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 10,
        "pool_pre_ping": True,
        "pool_recycle": 3600,
        "connect_args": {"ssl": "require"},
    })

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

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
    """Create all tables on startup if they do not exist."""
    try:
        async with engine.begin() as conn:
            from app.models import user, test, question, attempt, violation  # noqa: F401
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        print(f"Startup table check warning: {e}")


async def drop_tables():
    """Drop all tables. Used during development."""
    async with engine.begin() as conn:
        from app.models import user, test, question, attempt, violation  # noqa: F401
        await conn.run_sync(Base.metadata.drop_all)

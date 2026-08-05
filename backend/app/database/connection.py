from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text, event
from app.config import settings


db_url = settings.DATABASE_URL.strip()

engine_kwargs = {"echo": False}
if db_url.startswith("sqlite"):
    # SQLite: raise the busy timeout so concurrent writers (e.g. many students
    # starting a test at once during a test run) wait instead of erroring.
    engine_kwargs["connect_args"] = {"timeout": 30}
else:
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 10,
        "pool_pre_ping": True,
        "pool_recycle": 3600,
        "connect_args": {
            "ssl": "require",
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
        },
    })

engine = create_async_engine(db_url, **engine_kwargs)

if db_url.startswith("sqlite"):
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

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
        if not db_url.startswith("sqlite"):
            await sync_supabase_columns()
    except Exception as e:
        print(f"Startup table check warning: {e}")


async def sync_supabase_columns():
    """Idempotently add model columns missing from an existing Postgres schema.

    ``create_all`` only creates missing tables; tables that already exist in
    Supabase (e.g. a managed ``users`` table) never gain new model columns.
    This walks the ORM metadata and emits ``ALTER TABLE ... ADD COLUMN`` for any
    missing column. Every statement is best-effort: reads that need privileges
    the connection lacks are logged and skipped rather than crashing startup.
    """
    from sqlalchemy import inspect

    async with engine.begin() as conn:
        existing_tables = set((await conn.run_sync(lambda c: inspect(c).get_table_names())))
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            dialect = conn.dialect
            existing_cols = set((await conn.run_sync(
                lambda c, t=table: {r["name"] for r in inspect(c).get_columns(t.name)}
            )))
            added = 0
            for col in table.columns:
                if col.name in existing_cols:
                    continue
                col_type = col.type.compile(dialect=dialect)
                if col.nullable:
                    null_clause = "NULL"
                elif col.server_default is not None or col.default is not None:
                    null_clause = "NOT NULL"
                else:
                    # Can't add a NOT NULL column without a default to a
                    # populated table; fall back to nullable so the app can
                    # still run and backfill. This matches the old create_all
                    # behaviour for new tables (nullable columns are accepted).
                    null_clause = "NULL"
                ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type} {null_clause}'
                try:
                    await conn.execute(text(ddl))
                    added += 1
                except Exception as e:
                    print(
                        f"Column sync skipped: {table.name}.{col.name} "
                        f"({type(e).__name__}: {e})"
                    )
            if added:
                print(f"Column sync: added {added} column(s) to {table.name}")


async def drop_tables():
    """Drop all tables. Used during development."""
    async with engine.begin() as conn:
        from app.models import user, test, question, attempt, violation  # noqa: F401
        await conn.run_sync(Base.metadata.drop_all)

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
    """Create all tables on startup if they do not exist, then self-heal schema drift.

    Order of operations:
      1. ``create_all`` — create any missing tables (SQLite included).
      2. ``sync_supabase_columns`` — add model columns missing from existing
         tables (SQLite included: a stale local ``codearena.db`` from an older
         schema must gain the new columns instead of crashing every query).
      3. ``_migrate_legacy_sqlite`` — copy legacy SQLite rows into the current
         table/column shape (``student_attempts`` → ``test_attempts``,
         ``submissions.source_code/submitted_at`` → ``code/created_at``).
    """
    try:
        async with engine.begin() as conn:
            from app.models import user, test, question, attempt, violation  # noqa: F401
            await conn.run_sync(Base.metadata.create_all)
        await sync_supabase_columns()
        if db_url.startswith("sqlite"):
            await _migrate_legacy_sqlite()
    except Exception as e:
        print(f"Startup table check warning: {e}")


async def _migrate_legacy_sqlite():
    """In-place migration for SQLite databases created by older schema versions.

    Older deployments used a ``student_attempts`` table (with a ``student_id``
    column) and stored submissions in ``source_code`` / ``submitted_at``
    columns. The current models use ``test_attempts`` (``user_id``) and
    ``code`` / ``created_at``. ``create_tables`` creates the missing table and
    ``sync_supabase_columns`` adds the missing columns; this function copies the
    legacy rows into the current shape so no historical attempts or submissions
    are lost when a developer opens an old local database.

    The legacy ``student_attempts`` table is intentionally left in place: it is
    unused by the current models, and dropping it could cascade-delete child
    rows (student_questions / student_code / submissions / violations) through
    SQLite foreign-key actions.
    """
    from sqlalchemy import inspect

    async with engine.begin() as conn:
        tables = set(await conn.run_sync(lambda c: inspect(c).get_table_names()))

    # 1) Legacy attempt table: student_attempts -> test_attempts
    # The old table used ``student_id``/``total_score`` where the current model
    # uses ``user_id``/``score``. Build the column mapping from whatever the
    # legacy table actually has so any older shape migrates without crashing.
    # The legacy ``id`` values are preserved so child rows (student_questions,
    # student_code, submissions, violations) keep pointing at the right attempt.
    # This is safe because the copy only runs when test_attempts is empty (a
    # fresh table created by create_all). One caveat: a single legacy duplicate
    # (student_id, test_id) row violates the UNIQUE(user_id, test_id) constraint
    # and aborts the whole copy — acceptable for an edge case that should not
    # exist.
    if "student_attempts" in tables and "test_attempts" in tables:
        try:
            async with engine.begin() as conn:
                count = (await conn.execute(
                    text("SELECT COUNT(*) FROM test_attempts")
                )).scalar_one()
                if count == 0:
                    old_cols = {r["name"] for r in await conn.run_sync(
                        lambda c, t="student_attempts": inspect(c).get_columns(t)
                    )}
                    insert_cols, select_exprs = [], []
                    if "student_id" in old_cols:
                        insert_cols.extend(("id", "user_id"))
                        select_exprs.extend(("id", "student_id"))
                    for c in ("test_id", "started_at", "expires_at", "submitted_at", "status"):
                        if c in old_cols:
                            insert_cols.append(c)
                            select_exprs.append(c)
                    insert_cols.append("violation_count")
                    select_exprs.append(
                        "COALESCE(violation_count, 0)" if "violation_count" in old_cols else "0"
                    )
                    insert_cols.append("score")
                    if "total_score" in old_cols:
                        select_exprs.append("COALESCE(total_score, 0)")
                    elif "score" in old_cols:
                        select_exprs.append("COALESCE(score, 0)")
                    else:
                        select_exprs.append("0")
                    if "user_id" in insert_cols:
                        await conn.execute(text(
                            f"INSERT INTO test_attempts ({', '.join(insert_cols)}) "
                            f"SELECT {', '.join(select_exprs)} FROM student_attempts"
                        ))
                        print("Column sync: migrated student_attempts -> test_attempts")
        except Exception as e:
            print(f"Column sync skipped: student_attempts -> test_attempts ({type(e).__name__}: {e})")

    # 2) Legacy submission columns: source_code/submitted_at -> code/created_at
    async with engine.begin() as conn:
        if "submissions" in tables:
            cols = {r["name"] for r in await conn.run_sync(
                lambda c, t="submissions": inspect(c).get_columns(t)
            )}
            if "code" in cols and "source_code" in cols:
                await conn.execute(text(
                    "UPDATE submissions SET code = source_code "
                    "WHERE code IS NULL AND source_code IS NOT NULL"
                ))
            if "created_at" in cols and "submitted_at" in cols:
                await conn.execute(text(
                    "UPDATE submissions SET created_at = submitted_at "
                    "WHERE created_at IS NULL AND submitted_at IS NOT NULL"
                ))


async def sync_supabase_columns():
    """Idempotently add model columns missing from an existing schema.

    ``create_all`` only creates missing tables; tables that already exist (e.g.
    a Supabase-managed ``users`` table, or a local ``codearena.db`` created by
    an older schema version) never gain new model columns. This walks the ORM
    metadata and emits ``ALTER TABLE ... ADD COLUMN`` for any missing column.
    Every statement is best-effort: statements that fail (permission, dialect
    constraints) are logged and skipped rather than crashing startup.
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
                if db_url.startswith("sqlite"):
                    # SQLite only allows ADD COLUMN ... NOT NULL when a literal
                    # non-NULL DEFAULT is supplied (Python-side defaults are not
                    # emitted into the DDL), so legacy columns are added as NULL
                    # and backfilled by the ORM on the next write. This matches
                    # the old create_all behaviour for new tables.
                    null_clause = "NULL"
                elif col.nullable:
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

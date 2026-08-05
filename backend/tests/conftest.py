"""Shared fixtures for the CodeArena backend integration tests.

The DATABASE_URL is switched to an isolated temp SQLite file BEFORE any app
module is imported, so the engine/session factory bind to the test database.
"""

import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

_TMP_DIR = tempfile.mkdtemp(prefix="codearena_tests_")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{os.path.join(_TMP_DIR, 'test.db')}"
os.environ["JWT_SECRET"] = "integration-test-secret"
os.environ["ALLOW_LOCAL_EXECUTION"] = "true"

from app.database.connection import Base, AsyncSessionLocal, engine  # noqa: E402
from app.models import user, test, question, attempt, violation, question_bank  # noqa: E402,F401
from app.security.hashing import hash_password  # noqa: E402


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session", autouse=True)
async def db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="session")
async def client():
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as c:
        yield c


async def _make_test(
    *,
    name="Integration Test",
    year="Second Year",
    duration_minutes=60,
    start_delta_minutes=-10,
    end_delta_minutes=120,
    questions_per_student=1,
    easy_count=1,
    medium_count=0,
    hard_count=0,
    total_marks=50,
):
    now = datetime.now(timezone.utc)
    t = test.Test(
        name=name,
        description="integration test",
        year=year,
        start_time=now + timedelta(minutes=start_delta_minutes),
        end_time=now + timedelta(minutes=end_delta_minutes),
        duration_minutes=duration_minutes,
        total_marks=total_marks,
        questions_per_student=questions_per_student,
        easy_count=easy_count,
        medium_count=medium_count,
        hard_count=hard_count,
        allowed_languages=["python", "java", "c", "cpp"],
        max_violations=3,
        allow_copy_paste=False,
        scoring_type="partial",
        show_results=False,
    )
    async with AsyncSessionLocal() as s:
        s.add(t)
        await s.flush()
        test_id = t.id
        await s.commit()
    return test_id


async def _make_question(title="Sum of Two", difficulty="easy", marks=50):
    q = question.Question(
        title=title,
        statement="Read two integers and print their sum.",
        difficulty=difficulty,
        marks=marks,
        topic="Math",
        input_format="Two integers a b",
        output_format="Sum",
        sample_input="2 3",
        sample_output="5",
        explanation="2 + 3 = 5",
    )
    async with AsyncSessionLocal() as s:
        s.add(q)
        await s.flush()
        qid = q.id
        await s.commit()
    return qid


async def _make_test_case(qid, input_str, expected, hidden=False):
    tc = question.TestCase(
        question_id=qid, input=input_str, expected_output=expected, is_hidden=hidden
    )
    async with AsyncSessionLocal() as s:
        s.add(tc)
        await s.flush()
        tcid = tc.id
        await s.commit()
    return tcid


async def _link_question_to_test(test_id, qid):
    async with AsyncSessionLocal() as s:
        s.add(test.TestQuestion(test_id=test_id, question_id=qid))
        await s.commit()


async def _make_admin():
    # Idempotent: the admin row is unique by email, and multiple tests call this
    # helper against the same session-scoped database.
    async with AsyncSessionLocal() as s:
        from sqlalchemy import select

        existing = (
            await s.execute(select(user.User).where(user.User.email == "admin@test.local"))
        ).scalar_one_or_none()
        if existing:
            return existing.id
        u = user.User(
            email="admin@test.local",
            register_number="ADMIN001",
            name="Test Admin",
            password_hash=hash_password("admin123"),
            role=user.UserRole.ADMIN,
            status=user.UserStatus.ACTIVE,
            is_active=True,
        )
        s.add(u)
        await s.commit()
        return u.id


def _pick(body, test_id):
    """Return the dashboard entry for a specific test from whichever bucket it is in."""
    for bucket in ("active", "upcoming", "completed"):
        for entry in body.get(bucket, []):
            if entry["id"] == test_id:
                return entry, bucket
    return None, None


async def _make_attempt_expired(attempt_id):
    """Force an attempt's timer into the past (simulates time passing)."""
    async with AsyncSessionLocal() as s:
        from sqlalchemy import select

        att = (
            await s.execute(
                select(attempt.StudentAttempt).where(attempt.StudentAttempt.id == attempt_id)
            )
        ).scalar_one()
        att.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await s.commit()


async def _make_test_ended(test_id):
    async with AsyncSessionLocal() as s:
        from sqlalchemy import select

        t = (await s.execute(select(test.Test).where(test.Test.id == test_id))).scalar_one()
        t.end_time = datetime.now(timezone.utc) - timedelta(hours=1)
        await s.commit()


async def _count_attempts(test_id, user_id):
    from sqlalchemy import select, func

    async with AsyncSessionLocal() as s:
        return (
            await s.execute(
                select(func.count(attempt.StudentAttempt.id)).where(
                    attempt.StudentAttempt.test_id == test_id,
                    attempt.StudentAttempt.user_id == user_id,
                )
            )
        ).scalar_one()


async def _student_headers(client, register_number="TESTSTU1", name="Test Student"):
    res = await client.post(
        "/auth/student-entry",
        json={
            "register_number": register_number,
            "name": name,
            "department": "AI & DS",
            "section": "A",
            "year": "Second Year",
        },
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}

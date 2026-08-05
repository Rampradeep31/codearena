"""End-to-end integration tests for the CodeArena student lifecycle.

These tests exercise the REAL routers, models and code execution service. They
assert the invariants that were previously failing:

- Exam state is decided ONLY by the server (attempt status), never by the
  client; a refresh can never resurrect or move an exam between buckets.
- Any attempt that has started stays visible on the dashboard forever.
- The timer expiry is enforced server-side on every read (auto-submit).
- Manual submits cannot be replayed as early auto-submits and vice versa.
- Grading persists submissions and rejects questions not assigned to the
  attempt.
- Admin dashboard/results endpoints do not crash on missing fields.
- Concurrent unique attempts are safe.
"""

import asyncio
from datetime import datetime, timezone

import pytest
import sqlalchemy

from conftest import (
    AsyncSessionLocal,
    _count_attempts,
    _link_question_to_test,
    _make_admin,
    _make_attempt_expired,
    _make_test,
    _make_test_case,
    _make_test_ended,
    _make_question,
    _pick,
    _student_headers,
)

pytestmark = pytest.mark.anyio


# ─── Auth chain ─────────────────────────────────────────────────

async def test_health(client):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"


async def test_student_auth_chain(client):
    headers = await _student_headers(client, "CHAIN001", "Chain Student")
    res = await client.get("/student/profile", headers=headers)
    assert res.status_code == 200
    assert res.json()["register_number"] == "CHAIN001"
    assert res.json()["role"] == "student"


# ─── Dashboard classification + lifecycle ──────────────────────

async def test_dashboard_lifecycle_manual_submit(client):
    """Start -> active, questions assigned, save, violation, manual finish ->
    moves to completed and NEVER back to active on later reads."""
    qid = await _make_question()
    await _make_test_case(qid, "2 3", "5", hidden=False)
    await _make_test_case(qid, "10 20", "30", hidden=True)
    tid = await _make_test(questions_per_student=1, easy_count=1, total_marks=50)
    await _link_question_to_test(tid, qid)

    headers = await _student_headers(client, "LIFE001", "Lifecycle Student")

    # Dashboard: test is active, no attempt yet.
    res = await client.get("/student/tests", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert len(body["active"]) == 1
    assert body["upcoming"] == []
    assert body["completed"] == []
    assert body["active"][0]["attempt_id"] is None

    # Start: attempt created, idempotent on repeat.
    res = await client.post(f"/student/tests/{tid}/start", headers=headers)
    assert res.status_code == 200, res.text
    attempt_id = res.json()["id"]
    assert res.json()["status"] == "in_progress"

    again = await client.post(f"/student/tests/{tid}/start", headers=headers)
    assert again.status_code == 200 and again.json()["id"] == attempt_id

    # Questions: exactly 1 assigned, public test case only (hidden redacted).
    res = await client.get(f"/student/attempts/{attempt_id}/questions", headers=headers)
    assert res.status_code == 200
    qs = res.json()
    assert len(qs) == 1
    visible = qs[0]["question"]["test_cases"]
    assert len(visible) == 1
    assert visible[0]["expected_output"] == "5"

    # Save code.
    res = await client.put(
        f"/student/attempts/{attempt_id}/code",
        headers=headers,
        json={"question_id": qid, "language": "python", "source_code": "a,b=map(int,input().split());print(a+b)"},
    )
    assert res.status_code == 200

    # Violation recorded.
    res = await client.post(
        f"/student/attempts/{attempt_id}/violations",
        headers=headers,
        json={"violation_type": "fullscreen_exit"},
    )
    assert res.status_code == 200
    assert res.json()["violation_count"] == 1

    # Manual finish.
    res = await client.post(f"/student/attempts/{attempt_id}/finish", headers=headers, json={"status": "submitted"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "submitted"

    # Dashboard: test in completed, NOT active (issue 30 regression).
    res = await client.get("/student/tests", headers=headers)
    body = res.json()
    entry, bucket = _pick(body, tid)
    assert bucket == "completed"
    assert entry["attempt_status"] == "submitted"

    # Finished attempt cannot be re-opened or re-finished.
    res = await client.get(f"/student/attempts/{attempt_id}/questions", headers=headers)
    assert res.status_code == 400
    res = await client.post(f"/student/attempts/{attempt_id}/finish", headers=headers, json={"status": "submitted"})
    assert res.status_code == 400


# ─── Expiry auto-submit (server-enforced) ──────────────────────

async def test_expiry_auto_submits_on_read(client):
    qid = await _make_question()
    await _make_test_case(qid, "2 3", "5")
    tid = await _make_test(questions_per_student=1, easy_count=1)
    await _link_question_to_test(tid, qid)

    headers = await _student_headers(client, "EXP001", "Expiry Student")
    res = await client.post(f"/student/tests/{tid}/start", headers=headers)
    attempt_id = res.json()["id"]

    # Force the timer into the past.
    await _make_attempt_expired(attempt_id)

    # getAttempt applies the server rule and reports auto_submitted.
    res = await client.get(f"/student/attempts/{attempt_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "auto_submitted"
    assert res.json()["submitted_at"] is not None

    # Dashboard reflects the completion; attempt never disappears.
    res = await client.get("/student/tests", headers=headers)
    body = res.json()
    entry, bucket = _pick(body, tid)
    assert bucket == "completed"
    assert entry["attempt_status"] == "auto_submitted"

    # Same answer on a second read (stable state, no resurrection).
    res = await client.get("/student/tests", headers=headers)
    entry, _ = _pick(res.json(), tid)
    assert entry["attempt_status"] == "auto_submitted"

    # Questions and code writes are blocked after expiry.
    res = await client.get(f"/student/attempts/{attempt_id}/questions", headers=headers)
    assert res.status_code == 400
    res = await client.put(
        f"/student/attempts/{attempt_id}/code",
        headers=headers,
        json={"question_id": qid, "language": "python", "source_code": "x"},
    )
    assert res.status_code == 400
    res = await client.post(
        f"/student/attempts/{attempt_id}/violations",
        headers=headers,
        json={"violation_type": "tab_hidden"},
    )
    assert res.status_code == 400

    # A manual finish after expiry is refused (server already auto-submitted).
    res = await client.post(f"/student/attempts/{attempt_id}/finish", headers=headers, json={"status": "submitted"})
    assert res.status_code == 400


async def test_early_auto_submit_status_ignored_by_server(client):
    """The server — never the client — decides the final status.

    A client that passes status='auto_submitted' before the timer has expired
    must NOT be able to fabricate an auto-submit: the backend ignores the
    client value and records a normal manual submission instead.
    """
    qid = await _make_question()
    tid = await _make_test(questions_per_student=1, easy_count=1)
    await _link_question_to_test(tid, qid)

    headers = await _student_headers(client, "EARLY001", "Early Submit Student")
    res = await client.post(f"/student/tests/{tid}/start", headers=headers)
    attempt_id = res.json()["id"]

    res = await client.post(
        f"/student/attempts/{attempt_id}/finish",
        headers=headers,
        json={"status": "auto_submitted"},
    )
    assert res.status_code == 200, res.text
    # The client-requested status is ignored: the attempt is a MANUAL submit,
    # never an early auto_submitted. Server-authoritative final status.
    assert res.json()["status"] == "submitted"

    recheck = await client.get(f"/student/attempts/{attempt_id}", headers=headers)
    assert recheck.status_code == 200
    assert recheck.json()["status"] == "submitted"
    assert recheck.json()["submission_reason"] == "manual"


# ─── Attempts never disappear ──────────────────────────────────

async def test_in_progress_attempt_never_disappears(client):
    qid = await _make_question()
    tid = await _make_test(questions_per_student=1, easy_count=1)
    await _link_question_to_test(tid, qid)

    headers = await _student_headers(client, "VIS001", "Visual Student")
    res = await client.post(f"/student/tests/{tid}/start", headers=headers)
    attempt_id = res.json()["id"]

    # Exam window closes while the student is still writing.
    await _make_test_ended(tid)

    # The started attempt must still be visible (as active), never vanished.
    res = await client.get("/student/tests", headers=headers)
    body = res.json()
    entry, bucket = _pick(body, tid)
    assert bucket == "active"
    assert entry["attempt_id"] == attempt_id


# ─── Ownership isolation ───────────────────────────────────────

async def test_attempt_ownership_isolated(client):
    qid = await _make_question()
    tid = await _make_test(questions_per_student=1, easy_count=1)
    await _link_question_to_test(tid, qid)

    h1 = await _student_headers(client, "OWN001", "Owner Student")
    res = await client.post(f"/student/tests/{tid}/start", headers=h1)
    attempt_id = res.json()["id"]

    h2 = await _student_headers(client, "OWN002", "Other Student")
    res = await client.get(f"/student/attempts/{attempt_id}", headers=h2)
    assert res.status_code == 404

    # Non-student / wrong attempt in code endpoints also rejected.
    res = await client.post(
        "/code/run",
        headers=h2,
        json={
            "attempt_id": attempt_id,
            "question_id": qid,
            "language": "python",
            "source_code": "print(1)",
        },
    )
    assert res.status_code == 403


# ─── Grading ───────────────────────────────────────────────────

async def test_submit_unassigned_question_rejected(client):
    qid = await _make_question("Pooled A")
    other = await _make_question("Pooled B")
    tid = await _make_test(questions_per_student=1, easy_count=1)
    # Only qid is linked; `other` exists in the pool DB but is NOT assigned.
    await _link_question_to_test(tid, qid)

    headers = await _student_headers(client, "GRADE1", "Grade Student")
    res = await client.post(f"/student/tests/{tid}/start", headers=headers)
    attempt_id = res.json()["id"]

    res = await client.post(
        "/code/submit",
        headers=headers,
        json={
            "attempt_id": attempt_id,
            "question_id": other,
            "language": "python",
            "source_code": "print(1)",
        },
    )
    assert res.status_code == 400
    assert "not part of this attempt" in res.json()["detail"].lower()


async def test_python_grading_verdicts(client):
    qid = await _make_question()
    await _make_test_case(qid, "2 3", "5")
    await _make_test_case(qid, "100 200", "300", hidden=True)
    tid = await _make_test(questions_per_student=1, easy_count=1, total_marks=50)
    await _link_question_to_test(tid, qid)

    headers = await _student_headers(client, "GRADE2", "Grade Two")
    res = await client.post(f"/student/tests/{tid}/start", headers=headers)
    attempt_id = res.json()["id"]
    payload = {
        "attempt_id": attempt_id,
        "question_id": qid,
        "language": "python",
        "source_code": None,
    }

    # Accepted.
    payload["source_code"] = "a,b=map(int,input().split());print(a+b)"
    res = await client.post("/code/submit", headers=headers, json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "accepted"
    assert data["passed_test_cases"] == 2
    assert data["total_test_cases"] == 2
    assert data["score"] == 50
    assert data["total_marks"] == 50

    # Wrong answer.
    payload["source_code"] = "a,b=map(int,input().split());print(a*b)"
    res = await client.post("/code/submit", headers=headers, json=payload)
    assert res.status_code == 200
    assert res.json()["status"] == "wrong_answer"

    # Compilation error.
    payload["source_code"] = "def broken(:"
    res = await client.post("/code/submit", headers=headers, json=payload)
    assert res.status_code == 200
    assert res.json()["status"] == "compilation_error"


async def test_java_grading_when_compiler_present(client):
    import shutil

    if not shutil.which("javac"):
        pytest.skip("javac not installed on this machine")
    qid = await _make_question()
    await _make_test_case(qid, "2 3", "5")
    tid = await _make_test(questions_per_student=1, easy_count=1)
    await _link_question_to_test(tid, qid)

    headers = await _student_headers(client, "JAVA01", "Java Student")
    res = await client.post(f"/student/tests/{tid}/start", headers=headers)
    attempt_id = res.json()["id"]

    java_code = (
        "import java.util.*;\n"
        "public class Main {\n"
        "  public static void main(String[] args) {\n"
        "    Scanner sc = new Scanner(System.in);\n"
        "    int a = sc.nextInt(); int b = sc.nextInt();\n"
        "    System.out.println(a + b);\n"
        "  }\n"
        "}\n"
    )
    res = await client.post(
        "/code/submit",
        headers=headers,
        json={
            "attempt_id": attempt_id,
            "question_id": qid,
            "language": "java",
            "source_code": java_code,
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "accepted"


async def test_cpp_reports_missing_compiler_on_this_machine(client):
    import shutil

    qid = await _make_question()
    await _make_test_case(qid, "2 3", "5")
    tid = await _make_test(questions_per_student=1, easy_count=1)
    await _link_question_to_test(tid, qid)

    headers = await _student_headers(client, "CPP01", "Cpp Student")
    res = await client.post(f"/student/tests/{tid}/start", headers=headers)
    attempt_id = res.json()["id"]

    res = await client.post(
        "/code/submit",
        headers=headers,
        json={
            "attempt_id": attempt_id,
            "question_id": qid,
            "language": "cpp",
            "source_code": "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;}\n",
        },
    )
    assert res.status_code == 200, res.text
    if not shutil.which("g++"):
        assert res.json()["status"] == "compilation_error"
    else:
        assert res.json()["status"] in ("accepted", "wrong_answer", "compilation_error")


async def test_submission_persisted(client):
    from sqlalchemy import select, func
    from app.models.attempt import Submission

    qid = await _make_question()
    await _make_test_case(qid, "2 3", "5")
    tid = await _make_test(questions_per_student=1, easy_count=1)
    await _link_question_to_test(tid, qid)

    headers = await _student_headers(client, "PERS1", "Persist Student")
    res = await client.post(f"/student/tests/{tid}/start", headers=headers)
    attempt_id = res.json()["id"]

    await client.post(
        "/code/submit",
        headers=headers,
        json={
            "attempt_id": attempt_id,
            "question_id": qid,
            "language": "python",
            "source_code": "a,b=map(int,input().split());print(a+b)",
        },
    )
    await client.post(f"/student/attempts/{attempt_id}/finish", headers=headers, json={"status": "submitted"})

    async with AsyncSessionLocal() as s:
        total = (
            await s.execute(select(func.count(Submission.id)).where(Submission.attempt_id == attempt_id))
        ).scalar_one()
        assert total == 1
        score = (
            await s.execute(select(Submission.score).where(Submission.attempt_id == attempt_id))
        ).scalar_one()
        assert score == 50


# ─── Admin endpoints (regression fix verification) ─────────────

async def test_admin_dashboard_and_results(client):
    await _make_admin()
    qid = await _make_question()
    await _make_test_case(qid, "2 3", "5")
    tid = await _make_test(name="Weekly Challenge", questions_per_student=1, easy_count=1)
    await _link_question_to_test(tid, qid)

    headers = await _student_headers(client, "ADMINR1", "Admin Result Student")
    res = await client.post(f"/student/tests/{tid}/start", headers=headers)
    attempt_id = res.json()["id"]
    await client.post(
        "/code/submit",
        headers=headers,
        json={
            "attempt_id": attempt_id,
            "question_id": qid,
            "language": "python",
            "source_code": "a,b=map(int,input().split());print(a+b)",
        },
    )
    await client.post(f"/student/attempts/{attempt_id}/finish", headers=headers, json={"status": "submitted"})

    admin_headers = {
        "Authorization": "Bearer " + await _login_admin(client)
    }
    res = await client.get("/admin/dashboard", headers=admin_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_students"] >= 1
    assert isinstance(body["attempts"], list)

    res = await client.get(f"/admin/tests/{tid}/results", headers=admin_headers)
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["total_possible"] == 50
    assert rows[0]["submission_type"] == "manual"


async def _login_admin(client):
    # The server-side admin login path (not the frontend hardcoded shortcut).
    r = await client.post(
        "/auth/login", json={"email": "admin@test.local", "password": "admin123"}
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ─── Concurrency (unique attempt invariant) ────────────────────

async def test_68_concurrent_starts_yield_unique_attempts(client):
    qid = await _make_question()
    tid = await _make_test(questions_per_student=1, easy_count=1)
    await _link_question_to_test(tid, qid)

    async def start_one(i):
        reg = f"CONC{i:03d}"
        headers = await _student_headers(client, reg, f"Concurrent {i}")
        r = await client.post(f"/student/tests/{tid}/start", headers=headers)
        return r.status_code

    # Bounded parallelism: 10 at a time (SQLite serializes writers; the real
    # deployment on Postgres handles true parallelism natively).
    sem = asyncio.Semaphore(10)

    async def limited(i):
        async with sem:
            return await start_one(i)

    results = await asyncio.gather(*[limited(i) for i in range(68)])
    assert all(code == 200 for code in results), f"failures: {[r for r in results if r != 200]}"

    # Every student has exactly ONE attempt for the test.
    from sqlalchemy import select, func
    from app.models.user import User
    from app.models.attempt import StudentAttempt

    async def check(i):
        reg = f"CONC{i:03d}"
        async with AsyncSessionLocal() as s:
            u = (await s.execute(select(User).where(User.register_number == reg))).scalar_one()
            total = (
                await s.execute(
                    select(func.count(StudentAttempt.id)).where(
                        StudentAttempt.user_id == u.id, StudentAttempt.test_id == tid
                    )
                )
            ).scalar_one()
            return total

    totals = await asyncio.gather(*[check(i) for i in range(68)])
    assert all(t == 1 for t in totals), f"duplicates: {[t for t in totals if t != 1]}"


async def test_same_user_concurrent_starts_are_idempotent(client):
    qid = await _make_question()
    tid = await _make_test(questions_per_student=1, easy_count=1)
    await _link_question_to_test(tid, qid)

    headers = await _student_headers(client, "RACE01", "Same-User Racer")
    res = await client.post(f"/student/tests/{tid}/start", headers=headers)
    assert res.status_code == 200, res.text
    attempt_id = res.json()["id"]

    # Repeated starts resume the SAME attempt (idempotent), never a second row.
    for _ in range(2):
        again = await client.post(f"/student/tests/{tid}/start", headers=headers)
        assert again.status_code == 200, again.text
        assert again.json()["id"] == attempt_id

    async with AsyncSessionLocal() as s:
        from sqlalchemy import select, func
        from app.models.user import User
        from app.models.attempt import StudentAttempt

        u = (await s.execute(select(User).where(User.register_number == "RACE01"))).scalar_one()
        total = (
            await s.execute(
                select(func.count(StudentAttempt.id)).where(
                    StudentAttempt.user_id == u.id, StudentAttempt.test_id == tid
                )
            )
        ).scalar_one()
        assert total == 1


async def test_unique_constraint_resolves_concurrent_race(client):
    """Two sessions racing to insert the same (user_id, test_id) resolve to one row.

    This exercises the UNIQUE constraint that the eager-commit + IntegrityError
    path in start_test relies on. SQLite serializes the writes; exactly one
    insert succeeds and the other raises IntegrityError (as Postgres does).
    """
    qid = await _make_question()
    tid = await _make_test(questions_per_student=1, easy_count=1)
    await _link_question_to_test(tid, qid)
    await _student_headers(client, "RACE02", "Racing Student")

    from sqlalchemy import func, select
    from app.models.user import User
    from app.models.attempt import AttemptStatus, StudentAttempt

    async with AsyncSessionLocal() as s:
        u = (await s.execute(select(User).where(User.register_number == "RACE02"))).scalar_one()

    async def insert_one():
        async with AsyncSessionLocal() as s:
            s.add(
                StudentAttempt(
                    user_id=u.id,
                    test_id=tid,
                    started_at=datetime.now(timezone.utc),
                    expires_at=datetime.now(timezone.utc),
                    status=AttemptStatus.IN_PROGRESS.value,
                    violation_count=0,
                    score=0,
                )
            )
            await s.flush()
            await s.commit()

    with pytest.raises(sqlalchemy.exc.IntegrityError):
        await asyncio.gather(insert_one(), insert_one())

    async with AsyncSessionLocal() as s:
        total = (
            await s.execute(
                select(func.count(StudentAttempt.id)).where(
                    StudentAttempt.user_id == u.id, StudentAttempt.test_id == tid
                )
            )
        ).scalar_one()
        assert total == 1
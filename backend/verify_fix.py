import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

# Ensure sys.path includes backend and set test env vars before app import
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_verify.db"
os.environ["JUDGE_ENGINE"] = "local"

from app.database.connection import AsyncSessionLocal, create_tables
from app.models.user import User, UserRole, UserStatus
from app.models.test import Test, TestQuestion
from app.models.question import Question, TestCase
from app.models.attempt import StudentAttempt, StudentQuestionAssignment, StudentQuestion, AttemptStatus
from app.security.jwt import create_access_token
from app.services.local_executor import LocalCodeExecutor
from httpx import AsyncClient, ASGITransport
from app.main import app

async def run_verification():
    print("==================================================")
    print("       CODEARENA MASTER PROMPT VERIFICATION       ")
    print("==================================================")

    await create_tables()
    uid = uuid.uuid4().hex[:6]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with AsyncSessionLocal() as db:
            # 1. Setup Test Student and Test Exam
            from sqlalchemy import select
            student = User(
                name=f"Verify Student {uid}",
                email=f"verify_{uid}@codearena.com",
                register_number=f"V_{uid}",
                password_hash="not_needed",
                role=UserRole.STUDENT,
                department="AI & DS",
                year=2,
                section="A",
                status=UserStatus.ACTIVE,
                is_active=True
            )
            db.add(student)
            await db.commit()
            await db.refresh(student)

            # Ensure questions exist
            q_res = await db.execute(select(Question))
            questions = q_res.scalars().all()
            if not questions:
                q1 = Question(title="Two Sum", statement="Add 2 numbers", difficulty="easy", marks=10, topic="Arrays")
                q2 = Question(title="Reverse String", statement="Reverse string", difficulty="easy", marks=10, topic="Strings")
                db.add_all([q1, q2])
                await db.commit()
                await db.refresh(q1)
                await db.refresh(q2)
                questions = [q1, q2]

            now = datetime.now(timezone.utc)
            test_exam = Test(
                name=f"Verify Test {uid}",
                description="Verification Exam",
                year="Second Year",
                start_time=now - timedelta(hours=1),
                end_time=now + timedelta(hours=2),
                duration_minutes=60,
                total_marks=10,
                questions_per_student=1,
                easy_count=1,
                medium_count=0,
                hard_count=0,
                allowed_languages=["python", "java", "c", "cpp"],
                max_violations=3,
                allow_copy_paste=False,
                scoring_type="partial",
                show_results=True
            )
            db.add(test_exam)
            await db.commit()
            await db.refresh(test_exam)

            # Link question to test
            tq = TestQuestion(test_id=test_exam.id, question_id=questions[0].id)
            db.add(tq)
            await db.commit()

            token = create_access_token(user_id=student.id, role="student")
            headers = {"Authorization": f"Bearer {token}"}

            # -------------------------------------------------------------
            # TEST 1: Fresh Student -> attempt, assignment, student_questions
            # -------------------------------------------------------------
            print("\n[TEST 1] Starting Fresh Student Test...")
            res1 = await client.post(f"/student/tests/{test_exam.id}/start", headers=headers)
            print(f"Status: {res1.status_code}")
            assert res1.status_code == 200, f"Expected 200, got {res1.status_code}: {res1.text}"
            attempt1 = res1.json()
            attempt_id = attempt1["id"]
            print(f"Created Attempt ID: {attempt_id}")

            # Check DB rows
            asgn_res = await db.execute(select(StudentQuestionAssignment).where(StudentQuestionAssignment.student_id == student.id, StudentQuestionAssignment.test_id == test_exam.id))
            asgn = asgn_res.scalar_one_or_none()
            assert asgn is not None, "StudentQuestionAssignment missing!"
            print(f"[PASS] StudentQuestionAssignment present: Question ID {asgn.question_id}")

            sq_res = await db.execute(select(StudentQuestion).where(StudentQuestion.attempt_id == attempt_id))
            sqs = sq_res.scalars().all()
            assert len(sqs) == 1, f"Expected 1 student_question, got {len(sqs)}"
            print(f"[PASS] StudentQuestion present: Question ID {sqs[0].question_id}")

            # -------------------------------------------------------------
            # TEST 2: Refresh -> Same Question
            # -------------------------------------------------------------
            print("\n[TEST 2] Verifying Refresh (Same Question)...")
            q_res2 = await client.get(f"/student/attempts/{attempt_id}/questions", headers=headers)
            assert q_res2.status_code == 200, f"Expected 200, got {q_res2.status_code}: {q_res2.text}"
            qs2 = q_res2.json()
            assert isinstance(qs2, list) and len(qs2) == 1, "Expected question list of 1 item"
            assert qs2[0]["question_id"] == asgn.question_id, "Refresh returned different question!"
            print(f"[PASS] Refresh returned identical assigned Question ID {qs2[0]['question_id']}")

            # -------------------------------------------------------------
            # TEST 3: Double-Click Start -> Idempotent, One Attempt
            # -------------------------------------------------------------
            print("\n[TEST 3] Verifying Double-Click Start (Idempotency)...")
            res3 = await client.post(f"/student/tests/{test_exam.id}/start", headers=headers)
            assert res3.status_code == 200, f"Expected 200, got {res3.status_code}"
            assert res3.json()["id"] == attempt_id, "Double-click created duplicate attempt!"
            print(f"[PASS] Double-click returned existing Attempt ID {attempt_id}")

            # -------------------------------------------------------------
            # TEST 4: Concurrent Start Requests -> 1 Attempt, 1 Assignment
            # -------------------------------------------------------------
            print("\n[TEST 4] Verifying Concurrent Start Requests...")
            student2 = User(
                name=f"Concurrent Student {uid}",
                email=f"concurrent_{uid}@codearena.com",
                register_number=f"C_{uid}",
                password_hash="not_needed",
                role=UserRole.STUDENT,
                department="AI & DS",
                year=2,
                section="A",
                status=UserStatus.ACTIVE,
                is_active=True
            )
            db.add(student2)
            await db.commit()
            await db.refresh(student2)

            token2 = create_access_token(user_id=student2.id, role="student")
            headers2 = {"Authorization": f"Bearer {token2}"}

            req1 = client.post(f"/student/tests/{test_exam.id}/start", headers=headers2)
            req2 = client.post(f"/student/tests/{test_exam.id}/start", headers=headers2)
            c_res1, c_res2 = await asyncio.gather(req1, req2)
            assert c_res1.status_code == 200 and c_res2.status_code == 200, f"Concurrent start failed: {c_res1.status_code}, {c_res2.status_code}"
            assert c_res1.json()["id"] == c_res2.json()["id"], "Concurrent requests created different attempt IDs!"
            print(f"[PASS] Concurrent start safely returned single Attempt ID {c_res1.json()['id']}")

            # -------------------------------------------------------------
            # TEST 5: Timer Expiry -> Auto-submitted, NO HTTP 400
            # -------------------------------------------------------------
            print("\n[TEST 5] Verifying Timer Expiry (No HTTP 400)...")
            async with AsyncSessionLocal() as db5:
                student3 = User(
                    name=f"Expired Student {uid}",
                    email=f"expired_{uid}@codearena.com",
                    register_number=f"E_{uid}",
                    password_hash="not_needed",
                    role=UserRole.STUDENT,
                    department="AI & DS",
                    year=2,
                    section="A",
                    status=UserStatus.ACTIVE,
                    is_active=True
                )
                db5.add(student3)
                await db5.commit()
                await db5.refresh(student3)

                token3 = create_access_token(user_id=student3.id, role="student")
                headers3 = {"Authorization": f"Bearer {token3}"}

                expired_attempt = StudentAttempt(
                    user_id=student3.id,
                    test_id=test_exam.id,
                    started_at=now - timedelta(hours=3),
                    expires_at=now - timedelta(minutes=10),
                    status=AttemptStatus.IN_PROGRESS.value,
                    violation_count=0,
                    score=0
                )
                db5.add(expired_attempt)
                await db5.commit()
                await db5.refresh(expired_attempt)
                expired_attempt_id = expired_attempt.id

            exp_res = await client.get(f"/student/attempts/{expired_attempt_id}/questions", headers=headers3)
            print(f"Expired Questions Status: {exp_res.status_code}, Body: {exp_res.json()}")
            assert exp_res.status_code == 200, f"Expired attempt returned status {exp_res.status_code} instead of 200!"
            exp_json = exp_res.json()
            assert exp_json.get("submitted") is True, "Expected submitted: True"
            assert exp_json.get("status") == "auto_submitted", "Expected status: auto_submitted"
            print("[PASS] Expired attempt returned 200 OK JSON with status: auto_submitted, submitted: True")

            # -------------------------------------------------------------
            # TEST 6: Code Executors (Python, Java, C, C++)
            # -------------------------------------------------------------
            print("\n[TEST 6] Verifying Code Execution Engines...")
            exec_py = LocalCodeExecutor.execute("print('Hello Python')", "python", "")
            assert exec_py["status"] == "accepted" and "Hello Python" in exec_py["stdout"], f"Python failed: {exec_py}"
            print("[PASS] Python Executor Passed")

            exec_c = LocalCodeExecutor.execute('#include <stdio.h>\nint main() { printf("Hello C"); return 0; }', "c", "")
            assert exec_c["status"] in ("accepted", "compiler_not_installed"), f"C failed: {exec_c}"
            print(f"[PASS] C Executor Verified (Status: {exec_c['status']})")

            exec_cpp = LocalCodeExecutor.execute('#include <iostream>\nint main() { std::cout << "Hello CPP"; return 0; }', "cpp", "")
            assert exec_cpp["status"] in ("accepted", "compiler_not_installed"), f"C++ Executor failed: {exec_cpp}"
            print(f"[PASS] C++ Executor Verified (Status: {exec_cpp['status']})")

            exec_java = LocalCodeExecutor.execute('public class Main { public static void main(String[] args) { System.out.println("Hello Java"); } }', "java", "")
            assert exec_java["status"] in ("accepted", "compiler_not_installed"), f"Java Executor failed: {exec_java}"
            print(f"[PASS] Java Executor Verified (Status: {exec_java['status']})")

            print("\n==================================================")
            print("     ALL AUTOMATED VERIFICATION TESTS PASSED       ")
            print("==================================================")

if __name__ == "__main__":
    asyncio.run(run_verification())

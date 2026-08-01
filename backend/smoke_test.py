import sys
sys.path.insert(0, '.')
import time
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def check(name, resp, expected=200):
    status = "PASS" if resp.status_code == expected else f"FAIL (got {resp.status_code})"
    print(f"[{status}] {name}")
    if resp.status_code != expected:
        print("   body:", str(resp.json())[:300])
    return resp

# ── Auth ────────────────────────────────────────────────
r = check("admin login", client.post("/auth/login", json={"email": "admin@codearena.com", "password": "admin123"}))
admin_token = r.json()["access_token"]
admin_h = {"Authorization": f"Bearer {admin_token}"}

reg = f"STU{int(time.time()) % 100000:05d}"
r = check("student-entry (fresh student per run)", client.post("/auth/student-entry", json={
    "name": "Test User", "register_number": reg, "department": "AI & DS", "section": "A", "year": "2nd Year"}))
student_token = r.json()["access_token"]
student_h = {"Authorization": f"Bearer {student_token}"}

# ── Student flow (SQLite timezone checks) ───────────────
r = check("student tests list (tz-aware comparisons)", client.get("/student/tests", headers=student_h))
test_id = r.json()["active"][0]["id"]

r = check("start test", client.post(f"/student/tests/{test_id}/start", headers=student_h))
attempt_id = r.json()["id"]
check("start test again (idempotent)", client.post(f"/student/tests/{test_id}/start", headers=student_h))

r = check("get attempt (max_violations included)", client.get(f"/student/attempts/{attempt_id}", headers=student_h))
assert r.json().get("max_violations") == 3, "max_violations missing"
print("   max_violations:", r.json().get("max_violations"))

r = check("get attempt questions (public test cases only)", client.get(f"/student/attempts/{attempt_id}/questions", headers=student_h))
questions = r.json()
q = questions[0]
assert "is_hidden" not in q["question"]["test_cases"][0], "is_hidden leaked to student"
assert len(q["question"]["test_cases"]) <= 2, f"more than public test cases sent: {len(q['question']['test_cases'])}"
print("   questions:", len(questions), "| hidden leaked: no")

check("save code", client.put(f"/student/attempts/{attempt_id}/code", headers=student_h,
      json={"question_id": q["question_id"], "language": "python", "source_code": "print('hi')"}))

r = check("record violation", client.post(f"/student/attempts/{attempt_id}/violations", headers=student_h,
      json={"violation_type": "tab_hidden"}))
print("   violation response:", r.json())

r = check("finish test", client.post(f"/student/attempts/{attempt_id}/finish", headers=student_h))
print("   finish:", r.json())

# ── Admin flow ──────────────────────────────────────────
check("dashboard", client.get("/admin/dashboard", headers=admin_h))
check("admin list students", client.get("/admin/students", headers=admin_h))
check("admin list questions", client.get("/admin/questions", headers=admin_h))
check("admin list tests (question_ids present)", client.get("/admin/tests", headers=admin_h))
check("monitor test (tz + last_activity)", client.get(f"/admin/tests/{test_id}/monitor", headers=admin_h))
check("test results", client.get(f"/admin/tests/{test_id}/results", headers=admin_h))
check("violations list", client.get("/admin/violations", headers=admin_h))
check("test violations", client.get(f"/admin/tests/{test_id}/violations", headers=admin_h))

# ── Validation checks ───────────────────────────────────
check("invalid difficulty rejected", client.post("/admin/questions", headers=admin_h, json={
    "title": "X", "statement": "Y", "difficulty": "impossible", "marks": 10, "topic": "T",
    "test_cases": []}), expected=422)

check("test counts > qps rejected", client.post("/admin/tests", headers=admin_h, json={
    "name": "Bad", "start_time": "2026-01-01T00:00:00Z", "end_time": "2026-01-02T00:00:00Z",
    "duration_minutes": 60, "total_marks": 10, "questions_per_student": 3,
    "easy_count": 2, "medium_count": 2, "hard_count": 1, "question_ids": [1, 2, 3, 4]}), expected=422)

check("end before start rejected", client.post("/admin/tests", headers=admin_h, json={
    "name": "Bad2", "start_time": "2026-01-02T00:00:00Z", "end_time": "2026-01-01T00:00:00Z",
    "duration_minutes": 60, "total_marks": 10, "questions_per_student": 1,
    "question_ids": [1]}), expected=422)

check("pool too small rejected", client.post("/admin/tests", headers=admin_h, json={
    "name": "Bad3", "start_time": "2026-01-01T00:00:00Z", "end_time": "2026-01-02T00:00:00Z",
    "duration_minutes": 60, "total_marks": 10, "questions_per_student": 5,
    "easy_count": 2, "medium_count": 2, "hard_count": 1, "question_ids": [1]}), expected=400)

# unauthorized student hitting admin endpoint
check("student blocked from admin", client.get("/admin/dashboard", headers=student_h), expected=403)

# ── Auto-submit at max violations ─────────────────────
reg2 = f"STU{int(time.time()) % 100000 + 50000:05d}"
r = client.post("/auth/student-entry", json={
    "name": "AutoSubmit User", "register_number": reg2, "department": "CSE", "section": "B", "year": "1st Year"})
stu2_h = {"Authorization": f"Bearer {r.json()['access_token']}"}
r = check("fresh student starts test", client.post(f"/student/tests/{test_id}/start", headers=stu2_h))
attempt2 = r.json()["id"]
for i in range(2):
    check(f"violation {i+1}", client.post(f"/student/attempts/{attempt2}/violations", headers=stu2_h,
          json={"violation_type": "tab_hidden"}))
    time.sleep(2.5)  # exceed dedup window so each violation counts
r = check("3rd violation triggers auto-submit", client.post(f"/student/attempts/{attempt2}/violations",
      headers=stu2_h, json={"violation_type": "tab_hidden"}))
print("   auto-submit response:", r.json())
assert r.json()["auto_submitted"] is True, "auto-submit not triggered at max violations"
check("attempt now shows auto_submitted", client.get(f"/student/attempts/{attempt2}", headers=stu2_h))
print("   attempt status:", client.get(f"/student/attempts/{attempt2}", headers=stu2_h).json()["status"])
check("questions endpoint rejects submitted attempt", client.get(f"/student/attempts/{attempt2}/questions", headers=stu2_h), expected=400)

# ── Face-turn limit (2) triggers auto-submit ────────────
reg3 = f"STU{int(time.time()) % 100000 + 90000:05d}"
r = client.post("/auth/student-entry", json={
    "name": "FaceTurn User", "register_number": reg3, "department": "CSE", "section": "C", "year": "1st Year"})
stu3_h = {"Authorization": f"Bearer {r.json()['access_token']}"}
r = check("fresh student starts test", client.post(f"/student/tests/{test_id}/start", headers=stu3_h))
attempt3 = r.json()["id"]

r = check("1st face_turned violation (warning only)", client.post(f"/student/attempts/{attempt3}/violations",
      headers=stu3_h, json={"violation_type": "face_turned"}))
print("   response:", r.json())
assert r.json()["auto_submitted"] is False, "should NOT auto-submit on 1st face turn"
time.sleep(2.5)
r = check("2nd face_turned violation (auto-submit)", client.post(f"/student/attempts/{attempt3}/violations",
      headers=stu3_h, json={"violation_type": "face_turned"}))
print("   response:", r.json())
assert r.json()["auto_submitted"] is True, "should auto-submit on 2nd face turn (limit is 2)"

print("\nSMOKE TEST COMPLETE")

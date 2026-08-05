# CodeArena — Full Production Audit Report

Date: 2026-08-05
Scope: entire repository (backend FastAPI, frontend React, deployment, Supabase schema)
Target architecture: **Frontend → FastAPI → Supabase (only DB) → Local Docker Judge (only execution)**

---

## 0. Executive summary

The application works end-to-end on a local SQLite database, but it is **not production-ready** and violates the target architecture in four structural ways:

1. **Two databases.** The backend defaults to SQLite (`sqlite+aiosqlite:///./codearena.db`) and contains an entire SQLite-era layer: naive-datetime handling, `PRAGMA` listeners, legacy-table migration code, and schema-drift self-healing. Production also points at Postgres, so the codebase maintains *two* storage stacks.
2. **Two question seeds with different IDs.** `backend/seed.py` creates questions with IDs 1–20; `supabase_schema.sql` + `frontend/seed_supabase.js` create IDs 101–120. The execution API works around the mismatch with hardcoded `FALLBACK_TEST_CASES` and "id-100 mapping" hacks.
3. **Code executes inside the backend.** `LocalCodeExecutor` compiles/runs Python/Java/C/C++ via subprocess in the FastAPI container (the Dockerfile installs compilers). There is no isolated Docker judge.
4. **Authentication is wide open.** The API accepts unsigned magic tokens (`admin_token`, `sb_token_`, `local_token_`) that grant admin or fabricate student accounts, and the frontend hardcodes an admin shortcut that never contacts the backend.

Sections 1–10 list every finding. Section 11 defines the target schema. Section 12 defines the phased remediation plan.

---

## 1. Obsolete / dead files

| File | Why obsolete |
|---|---|
| `backend/seed.py` | SQLite-era demo seeder; seeds fake data with IDs 1–20 that conflict with the Supabase seed (101–120). Replaced by a Supabase-only seeder. |
| `frontend/seed_supabase.js` | Frontend writes directly to Supabase with the anon key; bypasses backend. Replaced by a backend seeder using the service-role connection. |
| `frontend/test_table.js` | Debug script calling the Supabase REST API directly. Delete. |
| `backend/_qdb.py`, `backend/_testjava.py` | One-off debug scripts (sqlite dump, local executor probe). Delete. |
| `frontend/src/services/supabaseClient.js` | No page imports it (verified). Direct-Supabase access must not exist in the frontend. Delete. |
| `backend/app/services/local_executor.py` | Backend executes code in-process — forbidden. Repurposed as the test-only "local" judge engine (never in production). |
| `backend/Dockerfile` compiler installs (default-jdk/gcc/g++) | Compilers belong in judge containers, not the API container. |
| `supabase_schema.sql` embedded demo data | Schema file must be schema-only; demo rows moved to the seeder. |
| `AUDIT.md` (this file) | Keeping as the architectural record. |

## 2. Obsolete / duplicate tables

Current ORM tables: `users, question_banks, questions, test_cases, tests, test_questions, test_attempts, student_questions, student_code, submissions, submission_results, violations`.

Required table set (target): `users, question_banks, questions, tests, test_questions, student_question_assignments, test_attempts, submissions, submission_results, test_cases, student_questions, violations`.

| Finding | Action |
|---|---|
| `student_code` | Duplicate of `submissions` (both store code per attempt+question; `student_code` is an auto-save draft). Draft is a product feature, but it must not be the *graded* record. Keep as draft storage; `submissions` remains the graded record. |
| Legacy `student_attempts` (SQLite) | Not in ORM; only exists in drifted local DBs. Removed by migration cleanup. Must never exist in Supabase. |
| `submission_results` | Missing from `supabase_schema.sql` (ORM-only). Must be added to the Supabase schema. |
| `student_question_assignments` | **Missing entirely** — required for stable per-student question assignment. Must be created (id, student_id, test_id, question_id, assigned_at, UNIQUE(student_id, test_id)). |
| `test_attempts` | `supabase_schema.sql` has no `UNIQUE(user_id, test_id)`; ORM has it. Schema must be authoritative and match. Status set must be exactly `not_started, in_progress, submitted, auto_submitted`. |

## 3. Duplicate code / duplicated endpoints

| Location | Finding |
|---|---|
| `/admin/violations?test_id=…` **and** `/admin/tests/{id}/violations` | Two endpoints returning the same data. Keep `/admin/violations` (filterable), remove `/admin/tests/{id}/violations`. |
| `/compiler/status` (main.py) **and** `/code/compiler/status` (execution.py) | Duplicated. Remove from `main.py`. |
| `execution.py` `FALLBACK_TEST_CASES` (120 hardcoded rows) + `_fetch_question` virtual-question fallback + id-100 mapping | Three fallback layers caused by the dual-seed ID mismatch. All removed; grading reads test cases from the DB only. |
| `api.js` client-side filtering for banks/questions/test counts | Counts must come from the backend aggregate, not from fetching full lists in the browser. |
| `_make_question`-style helpers vs. seed data | One seeder only (`backend/seed_supabase.py`). |
| `ensure_aware` / `ensure_aware_utc` | SQLite-only workaround; with Postgres timestamptz they are no-ops. Removed from logic that required them (UTC comparisons are native). |
| `sync_supabase_columns`, `_migrate_legacy_sqlite`, `drop_tables` | SQLite drift/migration machinery. Removed. |
| `DashboardStats` (schema) | Unused standalone; folded into `DashboardData`. Harmless but cleaned. |

## 4. Incorrect architecture

1. **Dual storage** — SQLite default + Postgres option + Supabase mirroring env vars (`SUPABASE_URL/SUPABASE_ANON_KEY`) that the backend never used. Target: single Postgres (Supabase) URL.
2. **In-container execution** — compilers installed in the API image; `LocalCodeExecutor` runs untrusted code in the API process. Target: `docker run` per submission with `--network none`, memory/CPU limits, per-language images.
3. **Frontend→Supabase writes** — `seed_supabase.js` and `test_table.js` bypass the backend; `supabaseClient.js` ships a committed anon key. Target: frontend calls FastAPI exclusively.
4. **Model/schema divergence** — ORM and `supabase_schema.sql` disagree (missing `submission_results`, missing `student_question_assignments`, missing unique constraint, different timestamp columns, `updated_at` absent in Supabase). Target: `supabase_schema.sql` is the single source of schema truth; ORM mirrors it.
5. **Two seeders with conflicting IDs (1–20 vs 101–120)** — the root cause of the execution fallback hacks. Target: one seeder, sequential IDs.

## 5. Missing relationships

| Gap | Required |
|---|---|
| `student_question_assignments (student_id → users, test_id → tests, question_id → questions, UNIQUE(student_id,test_id))` | Stable per-student question. Created at first `start`; never changed; same question on every refresh. |
| `tests.question_bank_id → question_banks.id` | Exists in ORM and schema. Test creation must default the pool from the bank. |
| `submission_results` in Supabase | Missing from schema. |
| `UNIQUE(user_id, test_id)` on `test_attempts` | Missing from schema (present in ORM). |

## 6. Broken / inconsistent APIs

| Endpoint / behavior | Issue |
|---|---|
| `POST /auth/login` | Fine (JWT). But `require_admin` never enforces a real admin because of magic tokens (see §9). |
| `GET /admin/tests/{id}/results` | Uses `attempt.student_id` (a property shim) in a query — correct only by accident of the property; uses `attempt.total_score` shim. Both removed in favor of `user_id`/`score`. |
| `POST /code/submit`, `/code/run` | Fallback test cases and virtual questions can grade with data that does not exist in the DB; `_save_code` swallows persistence errors. Removed/hardened. |
| `GET /admin/dashboard` | Serializes *all* rows and computes aggregates client-side; `SubmissionOut.from_orm` binds to legacy attribute names. |
| `GET /admin/question-banks` | Returns no `question_count`; the frontend computes it by fetching every question. Backend must return the aggregate. |
| `FinishAttemptRequest.status` | Accepted then ignored — dead input. Removed. |

## 7. Broken UI flows

| Flow | Issue | Fix |
|---|---|---|
| Admin login | Hardcoded shortcut `admin@codearena.com`/`admin123` returns `admin_token` without contacting the backend. | Real `/auth/login`; admin must exist in DB. |
| Question bank page | "Questions: N" computed by fetching all questions into the browser and filtering. | Backend returns `question_count`. |
| Dashboard test classification | Server-authoritative logic is correct, but it still handles legacy statuses (`completed`, `expired`). | Restrict to the 4 canonical statuses. |
| Direct Supabase writes | `seed_supabase.js`/`test_table.js` write outside FastAPI. | Removed. |
| Student must always get the same question after refresh | Works via idempotent attempt today, but is not backed by a persistent assignment row. | `student_question_assignments` get-or-create. |

## 8. Incorrect database queries / performance

| Location | Issue |
|---|---|
| `_test_out` in admin.py | 2 queries per test (count + ids) → N+1 over the tests list and dashboard. Batch into one aggregated query. |
| `list_questions` | Loads test cases per question (N+1). Batch. |
| `monitor_test` | Per-student queries (attempt, code count, submission count, last activity) → N+1 over all students. |
| `get_test_results` | Per-attempt queries (student, question counts, submissions). |
| `get_dashboard_stats` | Loads every row of 6 tables to compute counts. Use `func.count` aggregates only. |
| `students.get_student_tests` | Per-test question-count query; per-test attempt re-fetch. |
| SQLite-era naive datetime handling | `ensure_aware` at every comparison; unnecessary with timestamptz. |

## 9. Security issues (critical)

1. **Unsigned magic tokens grant admin.** `dependencies.get_current_user` accepts `admin_token` → user id 1 with `role=admin`; `sb_token_<id>` → student; `local_token_<reg>` → student id derived from a char-code checksum. `jwt.py` mirrors the same parsing. Anyone can send `Authorization: Bearer admin_token` and get full admin API access. **Remove all three; JWT-only.**
2. **Frontend admin shortcut.** `api.js` returns a fake admin session for a hardcoded email/password. Removed with the token it issues.
3. **Implicit user creation.** `_ensure_user_in_db` creates a user row for any unknown id on any authenticated request — auth-bypass vector and phantom-account source. Removed; users are created only by `/auth/student-entry` and admin endpoints.
4. **Committed Supabase anon key** in `supabaseClient.js`, with `supabase_schema.sql` granting `ALL` to `anon` under permissive RLS policies — the database is effectively open to the public internet. Locked to `service_role` only.
5. **Global exception handler** returns raw `str(exc)` to clients (info disclosure) — 500s return a generic message; details stay in logs.
6. **CORS** `allow_origin_regex` matches *any* `*.vercel.app`/`*.onrender.com` subdomain with credentials. Restrict to the two known frontend origins.
7. `render.yaml` declares unused secrets (`DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`) — removed with the dead config they served.

## 10. Performance

- All N+1s in §8 are the dominant cost on real class sizes (25–150 students × 20 questions).
- The execution semaphore (20) is fine, but subprocess-per-test-case with full test suites serializes poorly; a Docker judge with one container per test case and `--cpus`/`--memory` limits is the target.
- No pagination anywhere; dashboard queries should be aggregate-only.

---

## 11. Target schema (Supabase, authoritative)

```
users(id, name, register_number UNIQUE, email UNIQUE, password_hash, role, department, year, section, status, is_active, created_at, updated_at)
question_banks(id, title, description, year, status, created_at, updated_at)
questions(id, title, statement, difficulty, marks, topic, input_format, output_format, constraints,
          sample_input, sample_output, explanation, question_bank_id → question_banks ON DELETE SET NULL, created_at, updated_at)
test_cases(id, question_id → questions ON DELETE CASCADE, input, expected_output, is_hidden)
tests(id, name, description, year, question_bank_id → question_banks ON DELETE SET NULL,
      start_time, end_time, duration_minutes, questions_per_student, total_marks,
      easy_count, medium_count, hard_count, allowed_languages JSONB, max_violations, allow_copy_paste,
      scoring_type, show_results, created_at, updated_at)
test_questions(id, test_id → tests ON DELETE CASCADE, question_id → questions ON DELETE CASCADE, UNIQUE(test_id, question_id))
student_question_assignments(id, student_id → users ON DELETE CASCADE, test_id → tests ON DELETE CASCADE,
                             question_id → questions ON DELETE CASCADE, assigned_at, UNIQUE(student_id, test_id))
test_attempts(id, user_id → users ON DELETE CASCADE, test_id → tests ON DELETE CASCADE,
              status CHECK IN (not_started, in_progress, submitted, auto_submitted) DEFAULT 'in_progress',
              started_at, expires_at, submitted_at, violation_count, score, UNIQUE(user_id, test_id))
submissions(id, attempt_id → test_attempts ON DELETE CASCADE, question_id → questions ON DELETE CASCADE,
            language, code, status, score, total_test_cases, passed_test_cases, created_at)
submission_results(id, submission_id → submissions ON DELETE CASCADE, test_case_id, passed, output,
                   execution_time, memory_used, status)
student_questions(id, attempt_id → test_attempts ON DELETE CASCADE, question_id → questions ON DELETE CASCADE, position)
violations(id, attempt_id → test_attempts ON DELETE CASCADE, violation_type, created_at)
```

RLS: all tables `ENABLE ROW LEVEL SECURITY`; policies grant access to `service_role` only (the backend connects as service role). `anon` gets nothing. No demo rows in the schema file.

Lifecycle rules (enforced server-side):
- Login / dashboard / refresh **never** create attempts.
- `POST /student/tests/{id}/start` → get-or-create `student_question_assignments`, then create attempt `in_progress`.
- `POST /student/attempts/{id}/finish` → `submitted`.
- Timer expiry (checked on every read/write) → `auto_submitted`.
- Assignment is created once and never changed; the same question is returned on every refresh.

Judge (Docker-only, production):
- Backend shells out to `docker run --rm --network none --cpus=0.5 --memory=256m --pids-limit=64 -v <tmp>:/work -w /work <lang-image> …` per test case.
- Language images: `python:3.11-slim`, `openjdk:17-slim`, `gcc:13`. Compile step inside the container for Java/C/C++; run step with `/usr/bin/time`-style timing (via wall-clock + `resource`-in-container).
- Verdicts: `accepted, wrong_answer, compilation_error, runtime_error, time_limit_exceeded, memory_limit_exceeded, internal_error`.
- `JUDGE_ENGINE=docker` (production) | `local` (test suite only). The backend never executes code when `docker`.
- The backend persists results (submission + per-case `submission_results`) in Supabase. The judge container never touches the database.

---

## 12. Phased remediation plan (each phase verified before the next)

1. **Phase 1 — Database layer:** Postgres-only connection; remove SQLite pragmas, migration, sync, drop; clean config.
2. **Phase 2 — Models/schemas:** remove property shims and `EXPIRED`; canonical 4 statuses; add `StudentQuestionAssignment`; align `submissions` columns; add `question_count` to bank output.
3. **Phase 3 — Auth:** JWT-only; remove magic tokens and implicit user creation; remove frontend admin shortcut; lock CORS.
4. **Phase 4 — Admin API:** `user_id` fixes; remove duplicate endpoints; aggregate queries; bank question counts.
5. **Phase 5 — Judge:** Docker executor; remove all execution fallbacks; engine switch.
6. **Phase 6 — Student flow:** assignment get-or-create in `start`; exact lifecycle; same-question guarantee.
7. **Phase 7 — Schema & seeding:** authoritative `supabase_schema.sql`; `seed_supabase.py`; delete SQLite seeder + temp files.
8. **Phase 8 — Frontend:** backend-driven counts; delete `supabaseClient`; remove SQLite-era comments/fallbacks.
9. **Phase 9 — Verification:** full test suite, frontend build, deployment files, code review.

## 13. Known constraints (honest notes)

- **Render free tier cannot mount a Docker socket.** The Docker judge requires a host with Docker (a VPS or Docker-enabled platform). Until then `JUDGE_ENGINE=local` on Render keeps the service alive but executes in-container — a documented, configurable deviation. The default config is `docker`.
- The integration test suite uses an in-memory SQLite file as test infrastructure (it never ships). Production code contains zero SQLite.

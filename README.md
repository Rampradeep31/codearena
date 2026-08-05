# CodeArena – Online Coding Assessment Platform

A production-style full-stack coding examination platform for colleges to conduct
coding assessments for up to 70+ simultaneous students.

## 🏗 Architecture

```
Frontend (React + Vite)  →  FastAPI Backend  →  Supabase (Postgres)  →  Docker Judge
```

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + Tailwind CSS v4 + Monaco Editor |
| Backend | FastAPI (Python 3.11), async SQLAlchemy |
| Database | **Supabase (Postgres)** — the only database |
| Auth | JWT (signed, HS256) + bcrypt |
| Code Execution | **Local Docker judge** — one isolated container per test case |

Rules that hold everywhere:

- **No SQLite.** Production code has zero SQLite. The integration test suite
  uses a throwaway SQLite file purely as test infrastructure.
- **No mixed storage.** The frontend never touches Supabase directly; every
  request goes through FastAPI. `supabase_schema.sql` grants nothing to `anon`.
- **No execution in the API.** The backend never compiles or runs student code;
  the Docker judge does, in `--network none` containers with memory/CPU/pid
  limits. `JUDGE_ENGINE=local` exists only for the dev/test suite.
- **No fallbacks, no fake data.** Grading reads test cases from the database
  only. There are no hardcoded questions, virtual questions, or demo rows in
  runtime code.

## 📋 Prerequisites

- **Python** 3.11+
- **Node.js** 18+
- **Docker** (for the judge: `python:3.11-slim`, `eclipse-temurin:17-jdk-alpine`, `gcc:13`)
- **A Supabase project** (or any Postgres 15+)

## 🚀 Quick Start

### 1. Database (Supabase)

1. Create a Supabase project.
2. Open the SQL editor and run **`supabase_schema.sql`** (creates all tables,
   constraints, and RLS restricted to `service_role`).
3. Grab the **connection string** (Settings → Database) for `DATABASE_URL`.

### 2. Backend Setup

```bash
cd backend
python -m venv venv
# Windows:  venv\Scripts\activate   |   Linux/Mac:  source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
DATABASE_URL=postgresql+asyncpg://postgres:[password]@[host]:5432/postgres
JWT_SECRET=openssl rand -hex 32
JUDGE_ENGINE=docker
```

### 3. Seed Data (optional, dev only)

```bash
cd backend
python seed_supabase.py
```

Creates (idempotently): admin `admin@codearena.com` / `admin123`, 25 students
(`STU001`–`STU025`, password = lowercase register number), one question bank
with 20 questions + test cases, and one active test.

### 4. Start Backend

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs

### 5. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173 (Vite proxies `/api` → `http://127.0.0.1:8000`)

## 🔐 Default Credentials (after seeding)

| Role | Login | Password |
|------|-------|----------|
| Admin | `admin@codearena.com` | `admin123` |
| Student | `STU001` | `stu001` |

> Change `ADMIN_PASSWORD` (or use the `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars)
> before any real deployment.

## 📁 Project Structure

```
codearena/
├── supabase_schema.sql     # Authoritative Supabase schema (service_role only)
├── AUDIT.md                # Architecture audit & remediation record
├── frontend/               # React + Vite + Tailwind (calls FastAPI only)
│   └── src/services/api.js # Single API layer (axios) — no direct Supabase
├── backend/                # FastAPI + async SQLAlchemy
│   ├── app/
│   │   ├── api/            # auth, admin, students, execution routers
│   │   ├── models/         # SQLAlchemy models (mirror supabase_schema.sql)
│   │   ├── services/       # docker_executor, execution_service, attempt_lifecycle
│   │   ├── security/       # JWT (signed), hashing, dependencies
│   │   └── database/       # Postgres-only engine
│   └── seed_supabase.py    # Idempotent Supabase seeder
```

## 🔌 Code Execution (Docker Judge)

Every test case runs in a throwaway container:

```bash
docker run --rm --network none --cpus 0.5 --memory 256m --pids-limit 64 \
  -v <tmp>:/work -w /work python:3.11-slim timeout 10 python3 main.py < input.txt
```

- **Isolation:** no network, capped CPU/memory/pids, throwaway containers.
- **Languages:** Python (`python:3.11-slim`), Java (`eclipse-temurin:17-jdk-alpine`),
  C/C++ (`gcc:13`). Images are configurable via `JUDGE_IMAGE_*` settings.
- **Verdicts:** `accepted`, `wrong_answer`, `compilation_error`, `runtime_error`,
  `time_limit_exceeded`, `internal_error`.
- **Results** are persisted by the backend (submission + `submission_results`)
  into Supabase. Judge containers never touch the database.
- `JUDGE_ENGINE=local` uses the in-process executor **for the test suite only**
  and refuses to run when `JUDGE_ENGINE` is anything else.

> **Deployment note:** the Docker judge needs a host with a Docker socket
> (a VPS or Docker-enabled platform). Render's free tier cannot mount one; on
> Render set `JUDGE_ENGINE=local` as a documented dev fallback until the judge
> runs on Docker-enabled infrastructure.

## 🛡 Security

- JWT-only authentication — no magic tokens, no implicit user creation.
- Passwords hashed with bcrypt; server-side score calculation.
- Hidden test cases never leave the server.
- Supabase RLS: `service_role` only; `anon`/`authenticated` are revoked.
- CORS allow-list of known frontend origins (no wildcard).
- 500 responses never leak internal details.
- Judge containers run with `--network none` and resource limits.

## 🎯 Key Features

- Admin dashboard, question banks, questions, tests, results, live monitor
- **Stable question assignment** (`student_question_assignments`, one question
  per student+test, never reassigned after first draw)
- Server-authoritative attempt lifecycle:
  `not_started → in_progress → submitted | auto_submitted`
- Monaco editor for Python/Java/C/C++, server-synced timer, auto-save drafts
- Violation detection (tab switch, blur, fullscreen exit, copy/paste) with
  deduplication

## 🧪 Tests

```bash
cd backend
python -m pytest
```

The suite (17 tests) exercises the full student lifecycle, grading, expiry
auto-submit, ownership isolation, and concurrent-start safety. It uses an
in-memory SQLite file and the `local` judge engine as test infrastructure.

## 📊 Production Deployment

1. Apply `supabase_schema.sql` to your Supabase project.
2. Backend: build `backend/Dockerfile` (no compilers) and set `DATABASE_URL`,
   `JWT_SECRET`, `JUDGE_ENGINE`.
3. Frontend: `npm run build`, serve statically (see `render.yaml` / `vercel.json`).
4. Run the judge host on Docker-enabled infrastructure (`JUDGE_ENGINE=docker`).

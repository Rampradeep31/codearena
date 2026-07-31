# CodeArena – Online Coding Assessment Platform

A production-style full-stack coding examination platform designed for colleges to conduct coding assessments for up to 70+ simultaneous students.

## 🏗 Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS v4 |
| Code Editor | Monaco Editor (@monaco-editor/react) |
| Backend | FastAPI (Python 3.11+) |
| Database | PostgreSQL 15+ with async SQLAlchemy |
| Auth | JWT + bcrypt |
| Code Execution | Judge0 CE (self-hosted or RapidAPI) |

## 📋 Prerequisites

- **Python** 3.11+
- **Node.js** 18+
- **PostgreSQL** 15+
- **Judge0 API** key (RapidAPI) or self-hosted Judge0 instance

## 🚀 Quick Start

### 1. Clone & Setup

```bash
cd codearena
```

### 2. PostgreSQL Database

```bash
# Create the database
createdb codearena

# Or via psql
psql -U postgres -c "CREATE DATABASE codearena;"
```

### 3. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Linux/Mac)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and JUDGE0_API_KEY
```

### 4. Environment Variables

Edit `backend/.env`:

```env
DATABASE_URL=postgresql+asyncpg://postgres:yourpassword@localhost:5432/codearena
JWT_SECRET=your-secret-key-here
JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY=your-rapidapi-key
```

### 5. Seed Demo Data

```bash
cd backend
python seed.py
```

This creates:
- **Admin**: `admin@codearena.com` / `admin123`
- **25 Students**: `STU001`–`STU025` (password = lowercase register number, e.g., `stu001`)
- **20 Coding Questions** (8 Easy, 9 Medium, 3 Hard)
- **1 Active Test**: "Coding Assessment - Round 1" (60 min, 5 questions/student)

### 6. Start Backend

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs available at: http://localhost:8000/docs

### 7. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:5173

## 🔐 Default Credentials

| Role | Login | Password |
|------|-------|----------|
| Admin | `admin@codearena.com` | `admin123` |
| Student | `STU001` | `stu001` |
| Student | `STU002` | `stu002` |

## 📁 Project Structure

```
codearena/
├── frontend/               # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route pages (admin/, student/)
│   │   ├── services/       # API service layer (axios)
│   │   ├── context/        # React context (auth)
│   │   ├── App.jsx         # Router & routes
│   │   └── main.jsx        # Entry point
│   └── ...
├── backend/                # FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── api/            # Route handlers
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── services/       # Business logic
│   │   ├── security/       # JWT, hashing, dependencies
│   │   ├── database/       # Connection & base
│   │   ├── config.py       # Settings
│   │   └── main.py         # FastAPI app
│   └── seed.py             # Demo data seeder
├── .env.example
└── README.md
```

## 🔌 Code Execution (Judge0)

### Option A: RapidAPI (Easiest)

1. Sign up at [RapidAPI](https://rapidapi.com/judge0-official/api/judge0-ce)
2. Subscribe to Judge0 CE (free tier: ~100 submissions/day)
3. Copy your API key to `JUDGE0_API_KEY` in `.env`

### Option B: Self-Hosted

```bash
# Docker Compose
git clone https://github.com/judge0/judge0.git
cd judge0
docker-compose up -d
```

Set `JUDGE0_API_URL=http://localhost:2358` in `.env`

## 🛡 Security Features

- JWT authentication with role-based access control
- Password hashing with bcrypt
- Server-side score calculation (students never see hidden test cases)
- Violation monitoring with deduplication
- Server-controlled timer (cannot be reset)
- CORS configuration
- SQL injection protection via SQLAlchemy ORM

## 🎯 Key Features

- **Admin Dashboard** with stats, student/question/test management
- **Question Bank** with difficulty levels, topics, and hidden/public test cases
- **Random Question Assignment** with difficulty-based distribution
- **Monaco Code Editor** supporting Python, Java, C, C++
- **Server-synced Timer** that persists across refreshes
- **Auto-Save** every 12 seconds
- **Violation Detection** (tab switch, window blur, fullscreen exit, copy/paste)
- **Live Monitoring** dashboard for admins
- **Results Dashboard** with CSV export
- **Connection Handling** with offline detection

## 📊 Production Deployment

For production deployment:

1. Use a production PostgreSQL instance
2. Set strong `JWT_SECRET`
3. Configure `CORS_ORIGINS` to your domain
4. Use `gunicorn` with `uvicorn` workers:
   ```bash
   gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
   ```
5. Build frontend: `npm run build` and serve with nginx
6. Self-host Judge0 for unlimited code executions
7. Use connection pooling (PgBouncer) for 70+ users

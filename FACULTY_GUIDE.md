# CodeArena — Faculty & Lab Administrator Guide

This guide provides complete instructions for faculty, lab administrators, and IT staff to set up, deploy, and conduct online programming examinations using **CodeArena** across 60–100+ lab computers.

---

## 🏛️ 1. Architecture Overview

CodeArena runs as a unified, production-grade assessment system:

```
                          ┌──────────────────────────────────────────────┐
                          │   60–100 Student Lab PCs (Chrome / Edge)     │
                          │   • Fullscreen Lockdown (2-Strike Rule)      │
                          │   • Copy/Paste/PrintScreen Disabled          │
                          │   • Live Webcam (PiP) + Audio VU Monitor     │
                          └──────────────────────┬───────────────────────┘
                                                 │ HTTPS / WSS / REST
                                                 ▼
                          ┌──────────────────────────────────────────────┐
                          │     CodeArena Server (Spring Boot 3 + JRE)   │
                          │   • Single Port: 8000 (React SPA + REST APIs)│
                          │   • Embedded SSL / Cloudflare Zero-Warning   │
                          │   • Rate Limiting & Auto-Grading Engine      │
                          └──────────────┬───────────────┬───────────────┘
                                         │               │
                        ┌────────────────┘               └────────────────┐
                        ▼                                                 ▼
             ┌─────────────────────┐                           ┌─────────────────────┐
             │ Supabase PostgreSQL │                           │ Docker Judge Engine │
             │  Transaction Mode   │                           │ (Isolated Sandboxes)│
             │   pgBouncer: 6543   │                           │ Python, Java, C, C++│
             └─────────────────────┘                           └─────────────────────┘
```

---

## 💻 2. Server Requirements (Host Machine)

| Component | Minimum Specification | Recommended (60–100 PCs) |
|---|---|---|
| **OS** | Windows 10/11 Pro (WSL2), Ubuntu 22.04+ LTS | Ubuntu 22.04 LTS or Windows 11 Pro |
| **CPU** | 4 Cores (x86_64) | 8 Cores (Intel i7 / Ryzen 7 / Xeon) |
| **RAM** | 8 GB | 16 GB |
| **Disk** | 20 GB Free SSD Storage | 50 GB NVMe SSD |
| **Network** | 100 Mbps College Ethernet LAN | 1 Gbps Gigabit LAN Switch |
| **Software** | Docker Desktop (Windows) or Docker Engine (Linux) | Docker Engine + Java 17 + Node.js 18+ |

---

## 🚀 3. Method A: Docker Deployment (Recommended)

Running via Docker bundles the frontend, backend, security keystores, and sandbox CLI in a single container.

### Step 1: Pre-pull Judge Sandbox Images
Run these commands once on the host machine so the judge doesn't download images during the exam:
```bash
docker pull python:3.11-slim
docker pull eclipse-temurin:17-jdk-alpine
docker pull gcc:13
```

### Step 2: Create Persistent Docker Volume for Judge
```bash
docker volume create codearena-workdir
```

### Step 3: Build the CodeArena Image
```bash
docker build -t codearena-backend -f backend/Dockerfile .
```

### Step 4: Launch the Server Container
```powershell
docker run -d `
  --name codearena-api `
  -p 8000:8000 `
  -e DATABASE_URL="jdbc:postgresql://aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?prepareThreshold=0" `
  -e DATABASE_USERNAME="postgres.fvowlpdmgehizyuvoxgw" `
  -e DATABASE_PASSWORD="quantix@2026" `
  -e JWT_SECRET="dev-secret-key-for-local-use-32chars" `
  -e CORS_ORIGINS="https://localhost:8000,https://172.16.18.121:8000,http://localhost:5173" `
  -e JUDGE_WORKDIR_HOST="/var/lib/docker/volumes/codearena-workdir/_data" `
  -v //var/run/docker.sock:/var/run/docker.sock `
  -v codearena-workdir:/judge-workdir `
  codearena-backend
```

### Step 5: (Optional) Launch Cloudflare Public Tunnel for Zero-Warning HTTPS
To provide a globally trusted, zero-warning SSL link for all 60 systems:
```powershell
docker run -d `
  --name codearena-tunnel `
  cloudflare/cloudflared:latest `
  tunnel --protocol http2 --url https://host.docker.internal:8000 --no-tls-verify
```
*To view your active public tunnel URL:*
```powershell
docker logs codearena-tunnel 2>&1 | Select-String "trycloudflare.com"
```

---

## 🛠️ 4. Method B: Manual Bare-Metal Configuration (No Container)

If running directly on the host operating system without containerizing the backend:

### Step 1: Build the React Frontend
```bash
cd frontend
npm install
npm run build
```
*(The build outputs into `frontend/dist/`)*

### Step 2: Configure Environment Variables
Create or verify `.env` / system environment variables:
```properties
DATABASE_URL=jdbc:postgresql://aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?prepareThreshold=0
DATABASE_USERNAME=postgres.fvowlpdmgehizyuvoxgw
DATABASE_PASSWORD=quantix@2026
JWT_SECRET=dev-secret-key-for-local-use-32chars
PORT=8000
JUDGE_ENGINE=docker
```

### Step 3: Run the Spring Boot Backend
```bash
cd backend
# Windows:
mvnw.cmd clean spring-boot:run

# Linux:
./mvnw clean spring-boot:run
```

---

## 🎓 5. Student Lab PC Instructions (Exam Day)

### Connecting to the Exam:
1. Students open Google Chrome or Microsoft Edge on their lab computer.
2. Enter the assessment URL:
   * **Via Cloudflare Tunnel (Zero Warnings):** `https://mysterious-restoration-lloyd-vehicles.trycloudflare.com` *(or your generated tunnel link)*
   * **Via Local LAN:** `https://172.16.18.121:8000` *(Type `thisisunsafe` if Chrome displays a certificate warning)*.

### Student Login Credentials:
| Role | Login Identifier | Default Password |
|---|---|---|
| **Admin / Faculty** | `admin@codearena.com` | `admin123` |
| **Student** | `STU001` to `STU060` | `stu001` to `stu060` *(lowercase register number)* |

### Proctoring Rules Enforced:
1. **Fullscreen Mode:** Students must click *"Enter Fullscreen & Start Exam"* to begin.
2. **2-Strike Rule:**
   - **1st Tab Switch / Blur:** Code is saved; a prominent **Warning (1/2)** modal appears.
   - **2nd Tab Switch / Blur:** Exam is **immediately terminated** and auto-submitted.
3. **Anti-Copy Protection:** Right-click context menus, Ctrl+C, Ctrl+V, Ctrl+X, and PrintScreen screenshot keys are strictly disabled.
4. **Live Camera & Microphone:** Live preview widget monitors head orientation, presence, and ambient noise.

---

## 🔧 6. Maintenance & Troubleshooting FAQ

### Q1: How do I check if the server is healthy?
Run:
```bash
curl.exe -k -s -I https://localhost:8000/
```
Should return `HTTP/1.1 200 OK`.

### Q2: Port 8000 is already in use?
Find and terminate any zombie Java processes:
```powershell
Get-Process -Name java | Stop-Process -Force
```

### Q3: Student accidentally triggered 2-strike violation; how to unlock?
1. Log in to the Admin Dashboard (`https://<url>/admin`).
2. Go to **Active Attempts** / **Monitoring**.
3. Select the student attempt $\rightarrow$ Reset status or grant an attempt extension.

### Q4: How do I view live Docker judge executions?
```bash
docker ps --filter "ancestor=python:3.11-slim"
docker logs codearena-api --tail 50
```

### Q5: How do I stop the servers after the exam?
```powershell
docker stop codearena-api codearena-tunnel
```

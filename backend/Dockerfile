# ==============================================================================
# CodeArena Dockerfile — single-service build (frontend + backend)
# Production - Render Docker Deployment
#
# Build context is the REPO ROOT (see render.yaml: dockerContext: .), so this
# file can COPY from both backend/ and frontend/.
#
# Stage 1 builds the React SPA. Stage 2 is the FastAPI backend, which serves
# that build as static files (see app/main.py) alongside the API routes —
# one deployed service, one origin, no CORS needed in production.
#
# The API container does NOT compile or run student code. Every submission is
# executed by the Docker judge (backend/app/services/docker_executor.py) in an
# isolated throwaway container, so no compilers are installed here.
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: build the frontend
# ------------------------------------------------------------------------------
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ .
# Same-origin deployment: no VITE_API_URL means the frontend calls relative
# paths (/auth, /admin, /code, /student), which land on this same service.
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: backend runtime
# ------------------------------------------------------------------------------
FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/ .

# Copy the built frontend — app/main.py looks for this directory ("frontend_dist"
# next to the backend root) and serves it at "/", with API routes untouched.
COPY --from=frontend-build /frontend/dist ./frontend_dist

EXPOSE 8000

CMD ["sh","-c","uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

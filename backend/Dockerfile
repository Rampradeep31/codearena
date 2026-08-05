# ==============================================================================
# CodeArena Backend Dockerfile
# Production - Render Docker Deployment
#
# The API container does NOT compile or run student code. Every submission is
# executed by the Docker judge (backend/app/services/docker_executor.py) in an
# isolated throwaway container, so no compilers are installed here.
# ==============================================================================

FROM python:3.11-slim

# ------------------------------------------------------------------------------
# Environment
# ------------------------------------------------------------------------------
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# ------------------------------------------------------------------------------
# Application Directory
# ------------------------------------------------------------------------------
WORKDIR /app

# ------------------------------------------------------------------------------
# Install Python Dependencies
# ------------------------------------------------------------------------------
COPY requirements.txt .

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ------------------------------------------------------------------------------
# Copy Backend
# ------------------------------------------------------------------------------
COPY . .

# ------------------------------------------------------------------------------
# Render Port
# ------------------------------------------------------------------------------
EXPOSE 8000

# ------------------------------------------------------------------------------
# Start FastAPI
# ------------------------------------------------------------------------------
CMD ["sh","-c","uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

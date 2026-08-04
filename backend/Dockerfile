# ==============================================================================
# Production Dockerfile for CodeArena Backend
# Target Platform: Render Web Service (Docker)
# Base Image: Python 3.11 Slim
# Built-in Compilers: Python 3.11, OpenJDK 17 (Java), GCC (C), G++ (C++)
# ==============================================================================

FROM python:3.11-slim

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    PATH="/usr/lib/jvm/java-17-openjdk-amd64/bin:${PATH}"

# Install system dependencies & compilers (Java JDK 17, GCC, G++, build-essential, make, git, curl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk \
    gcc \
    g++ \
    build-essential \
    make \
    git \
    curl \
    procps \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory inside container
WORKDIR /app

# Copy Python requirements file first to leverage Docker layer caching
COPY requirements.txt .

# Install Python dependencies without cache to minimize image size
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source code
COPY . /app/

# Expose default port (Render will dynamically supply PORT at runtime)
EXPOSE 8000

# Start Uvicorn bound to dynamic Render PORT or default to 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

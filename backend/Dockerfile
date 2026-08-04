# ==============================================================================
# CodeArena Backend Dockerfile
# Production - Render Docker Deployment
# ==============================================================================

FROM python:3.11-bookworm

# ------------------------------------------------------------------------------
# Environment
# ------------------------------------------------------------------------------
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# ------------------------------------------------------------------------------
# Install Compilers & System Packages
# ------------------------------------------------------------------------------
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    default-jdk \
    gcc \
    g++ \
    build-essential \
    make \
    git \
    curl \
    procps && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------------------------
# Detect JAVA_HOME automatically
# ------------------------------------------------------------------------------
RUN JDK_DIR=$(dirname $(dirname $(readlink -f $(which javac)))) && \
    echo "JAVA_HOME=$JDK_DIR" >> /etc/environment && \
    ln -sfn "$JDK_DIR" /usr/lib/jvm/default-java

ENV JAVA_HOME=/usr/lib/jvm/default-java
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# ------------------------------------------------------------------------------
# Verify all compilers exist
# ------------------------------------------------------------------------------
RUN python3 --version && \
    gcc --version && \
    g++ --version && \
    javac -version && \
    java -version

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
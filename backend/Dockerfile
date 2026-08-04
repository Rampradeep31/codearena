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
    JAVA_HOME=/usr/lib/jvm/default-java \
    PATH="/usr/lib/jvm/default-java/bin:/usr/local/bin:${PATH}"

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
    && rm -rf /var/lib/apt/lists/* \
    && JDK_DIR=$(dirname $(dirname $(readlink -f $(which javac)))) \
    && mkdir -p /usr/lib/jvm \
    && ln -sfn "$JDK_DIR" /usr/lib/jvm/default-java

# Verify every judge compiler is present. If any version check fails, the
# image build fails loudly instead of deploying a broken judge.
RUN python3 --version \
    && gcc --version | head -n 1 \
    && g++ --version | head -n 1 \
    && javac -version 2>&1 \
    && java -version 2>&1 \
    && test -x "$(command -v python3)" \
    && test -x "$(command -v gcc)" \
    && test -x "$(command -v g++)" \
    && test -x "$(command -v javac)" \
    && test -x "$(command -v java)"

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

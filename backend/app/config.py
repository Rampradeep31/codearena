from pydantic_settings import BaseSettings
from typing import Optional
import secrets


class Settings(BaseSettings):
    # Database — Supabase is the ONLY database. DATABASE_URL must be a
    # Postgres connection string (the Supabase pooler or direct URL).
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/codearena"

    # JWT — if no secret is provided, a random one is generated at startup.
    # Set JWT_SECRET in production so tokens survive restarts.
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_MINUTES: int = 480  # 8 hours

    # ── Code Judge ─────────────────────────────────────────────────────────
    # JUDGE_ENGINE=docker runs every submission in an isolated container
    # (the only supported production mode). JUDGE_ENGINE=local uses the
    # in-process executor and is reserved for the development/test suite.
    JUDGE_ENGINE: str = "docker"

    # Timeouts & Limits (applied inside the judge container / local executor)
    CODE_TIMEOUT_SECONDS: float = 15.0
    TIMEOUT_PYTHON: float = 15.0
    TIMEOUT_C: float = 15.0
    TIMEOUT_CPP: float = 15.0
    TIMEOUT_JAVA: float = 15.0
    CODE_MEMORY_LIMIT_KB: int = 262144  # 256MB
    MAX_CONCURRENT_EXECUTIONS: int = 20  # Semaphore limit for execution governor
    MAX_PROCESSES_PER_SUBMISSION: int = 64  # RLIMIT_NPROC (local engine only)

    # Judge container images per language (Docker engine only)
    JUDGE_IMAGE_PYTHON: str = "python:3.11-slim"
    JUDGE_IMAGE_JAVA: str = "eclipse-temurin:17-jdk-alpine"
    JUDGE_IMAGE_C: str = "gcc:13"
    JUDGE_IMAGE_CPP: str = "gcc:13"

    # App Config
    MAX_VIOLATIONS_DEFAULT: int = 3
    MAX_FACE_TURN_VIOLATIONS: int = 2
    CORS_ORIGINS: str = "http://localhost:5173,https://codearena-indol.vercel.app"
    AUTO_SAVE_INTERVAL_SECONDS: int = 15
    SUBMISSION_GRACE_PERIOD_SECONDS: int = 5

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()

# Random JWT secret generated once at startup (only when JWT_SECRET env is unset).
# Wrapped in a property so consumers use settings.jwt_secret without exposing the raw field.
if not settings.JWT_SECRET:
    print(
        "WARNING: JWT_SECRET is not set. Using a random secret generated at startup. "
        "All tokens will be invalidated on restart. Set JWT_SECRET in production."
    )
    settings.JWT_SECRET = secrets.token_urlsafe(48)

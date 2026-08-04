from pydantic_settings import BaseSettings
from typing import Optional
import secrets


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./codearena.db"

    # JWT — if no secret is provided, a random one is generated at startup.
    # Set JWT_SECRET in production so tokens survive restarts.
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_MINUTES: int = 480  # 8 hours
    # Judge0 Code Execution
    JUDGE0_API_URL: str = "https://judge0-ce.p.rapidapi.com"
    JUDGE0_API_KEY: str = ""
    JUDGE0_MAX_CONCURRENT: int = 10
    # Code Execution Timeouts & Limits
    CODE_TIMEOUT_SECONDS: float = 15.0
    TIMEOUT_PYTHON: float = 15.0
    TIMEOUT_C: float = 15.0
    TIMEOUT_CPP: float = 15.0
    TIMEOUT_JAVA: float = 15.0
    CODE_MEMORY_LIMIT_KB: int = 262144  # 256MB
    MAX_CONCURRENT_EXECUTIONS: int = 20  # Semaphore limit for execution governor
    MAX_PROCESSES_PER_SUBMISSION: int = 64  # RLIMIT_NPROC

    # Gemini API Key for execution
    GEMINI_API_KEY: str = ""

    # Supabase (used to mirror attempts/test-cases created through the
    # frontend's Supabase-backed flows). Leave empty to rely only on the
    # local database.
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""

    # Local code execution engine. WARNING: running untrusted code locally is
    # only safe in isolated environments. A security filter blocks the most
    # dangerous APIs, but for production prefer a sandboxed judge (e.g. Judge0).
    ALLOW_LOCAL_EXECUTION: bool = True

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

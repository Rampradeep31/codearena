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
    CODE_TIMEOUT_SECONDS: int = 10
    CODE_MEMORY_LIMIT_KB: int = 262144  # 256MB (sent to Judge0 as bytes)

    # App Config
    MAX_VIOLATIONS_DEFAULT: int = 3
    MAX_FACE_TURN_VIOLATIONS: int = 2
    CORS_ORIGINS: str = "http://localhost:5173"
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

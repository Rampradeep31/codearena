from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./codearena.db"

    # JWT
    JWT_SECRET: str = "change-this-secret-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_MINUTES: int = 480  # 8 hours

    # Judge0 Code Execution
    JUDGE0_API_URL: str = "https://judge0-ce.p.rapidapi.com"
    JUDGE0_API_KEY: str = ""
    JUDGE0_MAX_CONCURRENT: int = 10
    CODE_TIMEOUT_SECONDS: int = 10
    CODE_MEMORY_LIMIT_KB: int = 262144  # 256MB

    # App Config
    MAX_VIOLATIONS_DEFAULT: int = 3
    CORS_ORIGINS: str = "http://localhost:5173"
    AUTO_SAVE_INTERVAL_SECONDS: int = 15
    SUBMISSION_GRACE_PERIOD_SECONDS: int = 5

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database.connection import create_tables
from app.api.auth import router as auth_router
from app.api.admin import router as admin_router
from app.api.students import router as student_router
from app.api.execution import router as execution_router
import logging
import sys


# ── Structured logging setup ────────────────────────────────────────────────
# Emit to stdout so Render / Docker can capture logs without file rotation.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stdout,
)
# Suppress noisy third-party loggers
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: best-effort schema bootstrap on startup."""
    await create_tables()
    yield


from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

app = FastAPI(
    title="CodeArena API",
    description="Online Coding Assessment Platform",
    version="1.0.0",
    lifespan=lifespan,
)

logger = logging.getLogger("main")

# CORS setup before routes and exception handling
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
if "https://codearena-indol.vercel.app" not in origins:
    origins.append("https://codearena-indol.vercel.app")
if "https://codearena-frontend.onrender.com" not in origins:
    origins.append("https://codearena-frontend.onrender.com")
if "http://localhost:5173" not in origins:
    origins.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    logger.error(f"[GLOBAL EXCEPTION] {request.method} {request.url}: {exc}\n{tb}")
    # Never leak internal error details to clients.
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

# Include routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(student_router)
app.include_router(execution_router)


@app.get("/")
async def root():
    return {"message": "CodeArena API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


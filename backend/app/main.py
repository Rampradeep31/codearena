from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.config import settings
from app.database.connection import create_tables
from app.api.auth import router as auth_router
from app.api.admin import router as admin_router
from app.api.students import router as student_router
from app.api.execution import router as execution_router
import logging
import os
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


@app.get("/health")
async def health():
    return {"status": "healthy"}


# ── Serve the built frontend (single-service deployment) ───────────────────
# Registered last so it never shadows the API routes above. The Docker image
# copies the frontend build to "frontend_dist" next to this backend root
# (see Dockerfile); a local dev checkout without a build falls back to a
# plain JSON root response instead.
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_FRONTEND_DIST_CANDIDATES = [
    os.path.join(_BACKEND_ROOT, "frontend_dist"),                    # Docker image
    os.path.join(_BACKEND_ROOT, "..", "frontend", "dist"),           # local dev build
]
FRONTEND_DIST = next(
    (os.path.abspath(p) for p in _FRONTEND_DIST_CANDIDATES if os.path.isdir(p)),
    None,
)

if FRONTEND_DIST:
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        # SPA fallback: any other path (client-side routes, "/") gets index.html.
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
else:
    @app.get("/")
    async def root():
        return {"message": "CodeArena API", "version": "1.0.0"}


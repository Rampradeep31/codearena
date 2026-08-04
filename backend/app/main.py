from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database.connection import create_tables
from app.api.auth import router as auth_router
from app.api.admin import router as admin_router
from app.api.students import router as student_router
from app.api.execution import router as execution_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: create tables on startup."""
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


import logging

logger = logging.getLogger("main")

# CORS setup before routes and exception handling
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
if "https://codearena-indol.vercel.app" not in origins:
    origins.append("https://codearena-indol.vercel.app")
if "http://localhost:5173" not in origins:
    origins.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    logger.error(f"[GLOBAL EXCEPTION] {request.method} {request.url}: {exc}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
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


@app.get("/compiler/status")
async def compiler_status():
    """Diagnostics endpoint for local compiler environment."""
    from app.services.local_executor import LocalCodeExecutor
    return LocalCodeExecutor.get_diagnostics()

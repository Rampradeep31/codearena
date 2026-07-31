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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print("GLOBAL EXCEPTION LOG:", tb)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": tb},
    )

# CORS
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

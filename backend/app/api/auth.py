from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.database.connection import get_db
from app.models.user import User
from app.schemas.schemas import LoginRequest, LoginResponse, UserOut
from app.security.hashing import verify_password
from app.security.jwt import create_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user with email/register_number and password."""
    # Allow login with either email or register number
    result = await db.execute(
        select(User).where(
            or_(User.email == request.email, User.register_number == request.email)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    token = create_access_token(user.id, user.role.value if hasattr(user.role, 'value') else user.role)

    return LoginResponse(
        access_token=token,
        role=user.role.value if hasattr(user.role, 'value') else user.role,
        user=UserOut(
            id=user.id,
            email=user.email,
            register_number=user.register_number,
            name=user.name,
            role=user.role.value if hasattr(user.role, 'value') else user.role,
            department=user.department,
            year=user.year,
            section=user.section,
            status=user.status.value if hasattr(user.status, 'value') else user.status,
        ),
    )

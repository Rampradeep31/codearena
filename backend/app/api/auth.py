from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.database.connection import get_db
from app.models.user import User, UserRole, UserStatus
from app.schemas.schemas import LoginRequest, LoginResponse, UserOut, StudentEntryRequest
from app.security.hashing import verify_password, hash_password
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


@router.post("/student-entry", response_model=LoginResponse)
async def student_entry(request: StudentEntryRequest, db: AsyncSession = Depends(get_db)):
    """Register or log in student directly with Name, Reg No, Dept, Section & Year."""
    reg_no = request.register_number.strip().upper()
    email = f"{reg_no.lower()}@codearena.com"

    # Parse numeric year if string format like '1st Year'
    year_num = 1
    if request.year:
        digits = ''.join(c for c in str(request.year) if c.isdigit())
        year_num = int(digits) if digits else 1

    # Check if student exists
    result = await db.execute(
        select(User).where(
            or_(User.register_number == reg_no, User.email == email)
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        # Create new student in database
        user = User(
            email=email,
            register_number=reg_no,
            name=request.name.strip(),
            password_hash=hash_password(reg_no.lower()),
            role=UserRole.STUDENT,
            department=request.department or "AI & DS",
            year=year_num,
            section=request.section or "A",
            status=UserStatus.ACTIVE,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Update details
        user.name = request.name.strip()
        user.department = request.department or "AI & DS"
        user.year = year_num
        user.section = request.section or "A"
        await db.commit()
        await db.refresh(user)

    token = create_access_token(user.id, "student")

    return LoginResponse(
        access_token=token,
        role="student",
        user=UserOut(
            id=user.id,
            email=user.email,
            register_number=user.register_number,
            name=user.name,
            role="student",
            department=user.department,
            year=user.year,
            section=user.section,
            status="active",
        ),
    )


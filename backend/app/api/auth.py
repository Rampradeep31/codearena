import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
import secrets
import traceback
from app.database.connection import get_db
from app.models.user import User, UserRole, UserStatus
from app.schemas.schemas import LoginRequest, LoginResponse, UserOut, StudentEntryRequest
from app.security.hashing import verify_password, hash_password
from app.security.jwt import create_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger("auth")


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user with email/register_number and password."""
    target = (request.email or "").strip()
    logger.info(f"[AUTH LOGIN] Incoming login request for target: {target}")

    try:
        # Allow login with either email or register number
        result = await db.execute(
            select(User).where(
                or_(User.email == target, User.register_number == target)
            )
        )
        user = result.scalar_one_or_none()

        if not user:
            logger.warning(f"[AUTH LOGIN FAILED] No user found for: {target}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User with this email or register number does not exist",
            )

        if not verify_password(request.password, user.password_hash):
            logger.warning(f"[AUTH LOGIN FAILED] Invalid password for user: {user.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid password",
            )

        if not user.is_active:
            logger.warning(f"[AUTH LOGIN FAILED] Account deactivated for user: {user.email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is deactivated",
            )

        role_str = user.role.value if hasattr(user.role, 'value') else str(user.role)
        token = create_access_token(user.id, role_str)
        logger.info(f"[AUTH LOGIN SUCCESS] Logged in user ID: {user.id}, role: {role_str}")

        return LoginResponse(
            access_token=token,
            role=role_str,
            user=UserOut(
                id=user.id,
                email=user.email,
                register_number=user.register_number,
                name=user.name,
                role=role_str,
                department=user.department,
                year=user.year,
                section=user.section,
                status=user.status.value if hasattr(user.status, 'value') else str(user.status),
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AUTH LOGIN ERROR] Exception during login for {target}: {e}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database or authentication failure: {str(e)}",
        )


@router.post("/student-entry", response_model=LoginResponse)
async def student_entry(request: StudentEntryRequest, db: AsyncSession = Depends(get_db)):
    """Register or log in student directly with Name, Reg No, Dept, Section & Year."""
    if not request.register_number or not request.register_number.strip():
        logger.warning("[STUDENT ENTRY FAILED] Register number missing")
        raise HTTPException(status_code=400, detail="Register number is required")

    reg_no = request.register_number.strip().upper()
    email = f"{reg_no.lower()}@codearena.com"

    if not request.name or not request.name.strip():
        logger.warning(f"[STUDENT ENTRY FAILED] Name missing for reg_no: {reg_no}")
        raise HTTPException(status_code=400, detail="Name is required")

    logger.info(f"[STUDENT ENTRY] Processing student registration/login for {reg_no} ({request.name.strip()})")

    # Parse numeric year if string format like '1st Year'
    year_num = 1
    if request.year:
        digits = ''.join(c for c in str(request.year) if c.isdigit())
        year_num = int(digits) if digits else 1

    try:
        # Check if student exists
        result = await db.execute(
            select(User).where(
                or_(User.register_number == reg_no, User.email == email)
            )
        )
        user = result.scalar_one_or_none()

        if not user:
            logger.info(f"[STUDENT ENTRY] Creating new student account for {reg_no}")
            user = User(
                email=email,
                register_number=reg_no,
                name=request.name.strip(),
                password_hash=hash_password(secrets.token_urlsafe(24)),
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
            logger.info(f"[STUDENT ENTRY] Updating existing student account ID {user.id} for {reg_no}")
            user.name = request.name.strip()
            user.department = request.department or "AI & DS"
            user.year = year_num
            user.section = request.section or "A"
            await db.commit()
            await db.refresh(user)

        token = create_access_token(user.id, "student")
        logger.info(f"[STUDENT ENTRY SUCCESS] Granted access token for student ID {user.id}")

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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[STUDENT ENTRY ERROR] Exception for {reg_no}: {e}\n{traceback.format_exc()}")
        err_msg = str(e)
        if "101" in err_msg or "unreachable" in err_msg.lower() or "cannot connect" in err_msg.lower():
            err_msg = "Database network unreachable. Please verify container internet access."
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration error: {err_msg}",
        )


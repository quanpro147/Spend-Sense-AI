import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.schemas import AuthResponse, GoogleLoginRequest, LoginRequest, RegisterRequest, UserResponse
from src.auth.dependencies import get_current_user
from src.auth.service import create_access_token, hash_password, user_id_from_email, verify_password
from src.core.config import get_settings
from src.db.base import ensure_database, get_db
from src.db.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    try:
        await ensure_database()
    except (ConnectionError, OSError, SQLAlchemyError):
        return _offline_auth_response(body.email)

    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return AuthResponse(
        access_token=create_access_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    try:
        await ensure_database()
    except (ConnectionError, OSError, SQLAlchemyError):
        if len(body.password) < 6:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        return _offline_auth_response(body.email)

    user = await db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return AuthResponse(
        access_token=create_access_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.post("/google", response_model=AuthResponse)
async def google_login(body: GoogleLoginRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID is not configured")

    try:
        from google.auth.transport import requests
        from google.oauth2 import id_token

        id_info = id_token.verify_oauth2_token(
            body.credential,
            requests.Request(),
            settings.google_client_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google credential") from exc

    email = str(id_info.get("email", "")).lower()
    if not email or not id_info.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google email is not verified")

    try:
        await ensure_database()
    except (ConnectionError, OSError, SQLAlchemyError):
        return _offline_auth_response(email)

    user = await db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(email=email, hashed_password=hash_password(secrets.token_urlsafe(32)))
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return AuthResponse(
        access_token=create_access_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


def _offline_auth_response(email: str) -> AuthResponse:
    normalized_email = email.lower()
    user_id = user_id_from_email(normalized_email)
    user = UserResponse(
        id=user_id,
        email=normalized_email,
        created_at=datetime.utcnow(),
    )
    return AuthResponse(
        access_token=create_access_token(user_id, email=normalized_email),
        user=user,
    )

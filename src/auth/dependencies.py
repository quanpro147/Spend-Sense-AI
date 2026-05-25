from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.service import decode_token_payload
from src.db.base import get_db
from src.db.models import User

_bearer = HTTPBearer()


@dataclass
class AuthenticatedUser:
    id: UUID
    email: str
    created_at: datetime


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User | AuthenticatedUser:
    try:
        payload = decode_token_payload(credentials.credentials)
        user_id = str(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        user = await db.get(User, UUID(user_id))
    except (ConnectionError, OSError, SQLAlchemyError):
        email = str(payload.get("email") or "offline@spendsense.local")
        return AuthenticatedUser(id=UUID(user_id), email=email, created_at=datetime.utcnow())

    if not user:
        email = payload.get("email")
        if email:
            return AuthenticatedUser(id=UUID(user_id), email=str(email), created_at=datetime.utcnow())
        raise HTTPException(status_code=401, detail="User not found")
    return user

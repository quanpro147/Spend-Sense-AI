from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, UUID, uuid5

import jwt
from passlib.context import CryptContext

from src.core.config import get_settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def user_id_from_email(email: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"spendsense:user:{email.lower()}")


def create_access_token(user_id: UUID, *, email: str | None = None) -> str:
    settings = get_settings()
    expire = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    if email:
        payload["email"] = email
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token_payload(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def decode_token(token: str) -> str:
    payload = decode_token_payload(token)
    return str(payload["sub"])

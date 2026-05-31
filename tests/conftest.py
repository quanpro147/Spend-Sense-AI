"""Shared pytest fixtures.

Integration tests run fully offline against an async SQLite database (one temp
file per test). External services (Gemini, ChromaDB, sentence-transformers,
market data) are never contacted — unit tests patch them explicitly.
"""
from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import main
from src.auth.service import create_access_token, hash_password
from src.db.base import Base, get_db
from src.db.models import User


@pytest.fixture
def db_engine(tmp_path):
    """Async SQLite engine backed by a temp file (NullPool → no cross-loop reuse)."""
    url = f"sqlite+aiosqlite:///{(tmp_path / 'test.db').as_posix()}"
    engine = create_async_engine(url, poolclass=NullPool)

    async def _create() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_create())
    yield engine
    asyncio.run(engine.dispose())


@pytest.fixture
def session_factory(db_engine):
    return async_sessionmaker(db_engine, expire_on_commit=False)


@pytest.fixture
def client(session_factory):
    """FastAPI TestClient with get_db overridden to the SQLite session.

    Instantiated without the context-manager form so lifespan/model warm-up is
    skipped during tests.
    """
    app = main.create_app()

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    return TestClient(app)


@pytest.fixture
def auth(session_factory):
    """Create a real user row + valid JWT; returns headers and user_id."""
    user_id = uuid4()
    email = "tester@spendsense.local"

    async def _create_user() -> None:
        async with session_factory() as session:
            session.add(User(id=user_id, email=email, hashed_password=hash_password("secret123")))
            await session.commit()

    asyncio.run(_create_user())
    token = create_access_token(user_id, email=email)
    return {"headers": {"Authorization": f"Bearer {token}"}, "user_id": user_id, "email": email}

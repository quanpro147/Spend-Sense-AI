from collections.abc import AsyncIterator

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from src.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _make_engine() -> object:
    settings = get_settings()
    return create_async_engine(
        settings.database_url,
        echo=settings.debug,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )


engine = _make_engine()
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def ensure_database() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_lightweight_migrations(conn)


async def _ensure_lightweight_migrations(conn: AsyncConnection) -> None:
    has_item_category = await conn.run_sync(
        lambda sync_conn: "category" in {column["name"] for column in inspect(sync_conn).get_columns("receipt_items")}
    )
    if not has_item_category:
        await conn.execute(text("ALTER TABLE receipt_items ADD COLUMN category VARCHAR(80) DEFAULT 'khac'"))

    # Auto-add columns to investment_assets table if they do not exist
    asset_columns = await conn.run_sync(
        lambda sync_conn: {column["name"] for column in inspect(sync_conn).get_columns("investment_assets")}
    )
    if "interest_rate" not in asset_columns:
        await conn.execute(text("ALTER TABLE investment_assets ADD COLUMN interest_rate FLOAT DEFAULT 0.0"))
    if "term_months" not in asset_columns:
        await conn.execute(text("ALTER TABLE investment_assets ADD COLUMN term_months INTEGER DEFAULT 0"))


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session

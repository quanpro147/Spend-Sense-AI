from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.schemas import PreferencesResponse, PreferencesUpdateRequest
from src.auth.dependencies import get_current_user
from src.db.base import get_db
from src.db.models import User, UserPreferences

router = APIRouter(prefix="/preferences", tags=["preferences"])


@router.get("", response_model=PreferencesResponse)
async def get_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PreferencesResponse:
    """Get the current user's AI preferences, creating defaults if absent."""
    prefs = await _get_or_create_preferences(current_user, db)
    return PreferencesResponse.model_validate(prefs)


@router.put("", response_model=PreferencesResponse)
async def update_preferences(
    body: PreferencesUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PreferencesResponse:
    """Update one or more AI preference toggles."""
    prefs = await _get_or_create_preferences(current_user, db)
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(prefs, field, value)
    await db.commit()
    await db.refresh(prefs)
    return PreferencesResponse.model_validate(prefs)


async def _get_or_create_preferences(current_user: User, db: AsyncSession) -> UserPreferences:
    result = await db.scalars(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = result.one_or_none()
    if prefs is None:
        prefs = UserPreferences(user_id=current_user.id)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)
    return prefs

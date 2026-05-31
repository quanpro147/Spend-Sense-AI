from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.schemas import (
    GoalCreateRequest,
    GoalListResponse,
    GoalResponse,
    GoalUpdateRequest,
)
from src.auth.dependencies import get_current_user
from src.db.base import get_db
from src.db.models import FinancialGoal, User

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("", response_model=GoalListResponse)
async def list_goals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GoalListResponse:
    """List all financial goals owned by the current user."""
    result = await db.scalars(
        select(FinancialGoal)
        .where(FinancialGoal.user_id == current_user.id)
        .order_by(FinancialGoal.created_at.desc())
    )
    items = [GoalResponse.from_goal(goal) for goal in result.all()]
    return GoalListResponse(items=items, total=len(items))


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    body: GoalCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GoalResponse:
    """Create a new financial goal."""
    goal = FinancialGoal(
        user_id=current_user.id,
        title=body.title.strip(),
        emoji=body.emoji,
        target_amount=body.target_amount,
        current_amount=body.current_amount,
        monthly_target=body.monthly_target,
        deadline=body.deadline,
        ai_note=body.ai_note,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return GoalResponse.from_goal(goal)


@router.patch("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: UUID,
    body: GoalUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GoalResponse:
    """Partially update a financial goal owned by the current user."""
    goal = await _get_owned_goal(goal_id, current_user, db)
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(goal, field, value)
    await db.commit()
    await db.refresh(goal)
    return GoalResponse.from_goal(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a financial goal owned by the current user."""
    goal = await _get_owned_goal(goal_id, current_user, db)
    await db.delete(goal)
    await db.commit()
    return None


async def _get_owned_goal(goal_id: UUID, current_user: User, db: AsyncSession) -> FinancialGoal:
    result = await db.scalars(
        select(FinancialGoal).where(
            FinancialGoal.id == goal_id,
            FinancialGoal.user_id == current_user.id,
        )
    )
    goal = result.one_or_none()
    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mục tiêu tài chính không tồn tại hoặc không thuộc sở hữu của bạn.",
        )
    return goal

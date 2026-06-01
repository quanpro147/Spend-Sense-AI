from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.schemas import HealthResponse, InsightListResponse, InsightResponse
from src.auth.dependencies import get_current_user
from src.cache.vector_store import get_insight, list_insights
from src.core.config import get_settings
from src.db.models import User

router = APIRouter(tags=["insights"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@router.get("/insights", response_model=InsightListResponse)
async def list_user_insights(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
) -> InsightListResponse:
    if not get_settings().semantic_cache_enabled:
        return InsightListResponse(items=[], total=0, limit=limit, offset=offset)

    result = list_insights(user_id=str(current_user.id), limit=limit, offset=offset)
    if result.failed:
        return InsightListResponse(items=[], total=0, limit=limit, offset=offset)
    items: list = result.data or []
    return InsightListResponse(
        items=[InsightResponse.from_insight(i) for i in items],
        total=len(items),
        limit=limit,
        offset=offset,
    )


@router.get("/insights/{insight_id}", response_model=InsightResponse)
async def get_user_insight(
    insight_id: str,
    current_user: User = Depends(get_current_user),
) -> InsightResponse:
    result = get_insight(insight_id=insight_id, user_id=str(current_user.id))
    if result.failed:
        raise HTTPException(
            status_code=500,
            detail=result.error_hint or "Failed to get insight",
        )
    if result.data is None:
        raise HTTPException(status_code=404, detail="Insight not found")
    return InsightResponse.from_insight(result.data)

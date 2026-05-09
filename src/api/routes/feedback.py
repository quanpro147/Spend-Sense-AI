from fastapi import APIRouter, Depends, HTTPException, Path, status

from src.api.schemas import FeedbackRequest, FeedbackResponse
from src.auth.dependencies import get_current_user
from src.cache.vector_store import cache_delete
from src.db.models import User
from src.models.expense import FeedbackAction

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("/{insight_id}", response_model=FeedbackResponse, status_code=status.HTTP_200_OK)
async def submit_feedback(
    insight_id: str = Path(description="Insight ID from the analyze response"),
    body: FeedbackRequest = ...,
    current_user: User = Depends(get_current_user),
) -> FeedbackResponse:
    """
    Submit 👍/👎 feedback for an insight.

    - CONFIRM (👍): pattern is kept in the cache.
    - REJECT  (👎): pattern is deleted from the cache (unlearn).
    """
    if body.action == FeedbackAction.CONFIRM:
        return FeedbackResponse(message="Pattern confirmed — thank you for your feedback.")

    # REJECT → delete vector
    result = cache_delete(body.vector_id)
    if result.failed:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": result.summary, "hint": result.error_hint},
        )

    return FeedbackResponse(message="Pattern removed — we'll improve future insights.")

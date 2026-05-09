from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from src.api.schemas import AnalyzeResponse, InsightResponse
from src.auth.dependencies import get_current_user
from src.db.models import User
from src.pipeline import PipelineError, analyze_receipt

router = APIRouter(prefix="/receipts", tags=["receipts"])


@router.post("/analyze", response_model=AnalyzeResponse, status_code=status.HTTP_200_OK)
async def analyze(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
) -> AnalyzeResponse:
    """
    Upload a receipt image and receive an AI-generated spending insight.

    - Runs vision + OCR + embedding + semantic cache lookup.
    - Returns cached insight if similarity >= threshold, otherwise calls LLM.
    """
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, and WebP images are supported.",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    try:
        insight = analyze_receipt(image_bytes)
    except PipelineError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": exc.result.summary,
                "hint": exc.result.error_hint,
                "step": exc.step,
            },
        ) from exc

    return AnalyzeResponse(
        insight=InsightResponse.from_insight(insight),
        vector_id=insight.vector_id,
    )

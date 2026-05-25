from fastapi import APIRouter, HTTPException, UploadFile, status

from src.api.schemas import (
    AnalyzeResponse,
    DetectedFieldResponse,
    InsightResponse,
    ReceiptDraftItemResponse,
    ReceiptDraftResponse,
    SuggestedTransactionResponse,
)
from src.pipeline import PipelineError, analyze_receipt_details

router = APIRouter(prefix="/receipts", tags=["receipts"])


@router.post("/analyze", response_model=AnalyzeResponse, status_code=status.HTTP_200_OK)
async def analyze(
    file: UploadFile,
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
        result = analyze_receipt_details(image_bytes)
    except PipelineError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": exc.result.summary,
                "hint": exc.result.error_hint,
                "step": exc.step,
            },
        ) from exc

    receipt = result["receipt"]
    insight = result["insight"]
    draft_items = result.get("draft_items", [])
    fields = [
        field
        for field in result.get("fields", [])
        if str(field.get("class_name", "")).strip().lower().replace("-", "_").replace(" ", "_") != "store_name"
    ]
    amount = sum(float(item.get("quantity", 0)) * float(item.get("unit_price", 0)) for item in draft_items)
    if amount <= 0:
        amount = receipt.total_amount
    suggested_category = _dominant_category(draft_items)

    return AnalyzeResponse(
        insight=InsightResponse.from_insight(insight),
        vector_id=insight.vector_id,
        receipt=ReceiptDraftResponse(
            receipt_id=receipt.id,
            merchant=receipt.merchant,
            purchase_date=receipt.purchase_date,
            total_amount=amount,
            currency=receipt.currency,
            raw_text=receipt.raw_text,
            items=[ReceiptDraftItemResponse(**item) for item in draft_items],
        ),
        suggested_transaction=SuggestedTransactionResponse(
            type="expense",
            amount=amount,
            currency=receipt.currency,
            category=suggested_category,
            description=receipt.merchant,
            merchant=receipt.merchant,
            transaction_date=receipt.purchase_date,
            receipt_id=None,
        ),
        detected_fields=[DetectedFieldResponse(**field) for field in fields],
    )


def _dominant_category(items: list[dict]) -> str:
    totals: dict[str, float] = {}
    for item in items:
        category = str(item.get("category") or "khac")
        amount = float(item.get("quantity", 0)) * float(item.get("unit_price", 0))
        totals[category] = totals.get(category, 0.0) + amount
    return max(totals, key=totals.get) if totals else "khac"

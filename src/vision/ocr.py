"""
OCR extractor — PaddleOCR stub.

Replace _run_ocr() body with real PaddleOCR call when ready.
"""

from __future__ import annotations

from datetime import date

from src.core.tool_result import ToolResult
from src.models.expense import Receipt, ReceiptItem


def extract_receipt(image_bytes: bytes) -> ToolResult:
    """
    Run OCR on a (cropped) receipt image and parse structured data.

    Args:
        image_bytes: cropped receipt region bytes

    Returns:
        ToolResult.data = Receipt
    """
    if not image_bytes:
        return ToolResult.error(
            summary="Empty image for OCR",
            error_hint="Received empty bytes. Check detector output.",
            next_actions=["Re-run detection", "Ask user to re-upload"],
        )

    try:
        raw_text, items, merchant, purchase_date, total = _run_ocr(image_bytes)
    except NotImplementedError:
        # Stub: return a placeholder receipt so the pipeline can continue
        receipt = _stub_receipt()
        return ToolResult.warning(
            summary="OCR not implemented — returning stub receipt",
            data=receipt,
            next_actions=["Embed receipt text", "Replace stub with real OCR output"],
            error_hint="PaddleOCR not loaded. Set up PaddleOCR to enable real extraction.",
        )
    except Exception as exc:
        return ToolResult.error(
            summary="OCR extraction failed",
            error_hint=f"{type(exc).__name__}: {exc}",
            next_actions=["Check image quality", "Retry with enhanced contrast"],
        )

    receipt = Receipt(
        merchant=merchant,
        purchase_date=purchase_date,
        items=items,
        total_amount=total,
        raw_text=raw_text,
    )
    return ToolResult.success(
        summary=f"Extracted {len(items)} items from {merchant}",
        data=receipt,
        next_actions=["Embed receipt canonical text"],
        artifacts={"receipt_id": str(receipt.id)},
    )


def _run_ocr(image_bytes: bytes) -> tuple[str, list[ReceiptItem], str, date, float]:
    """Plug real PaddleOCR inference here."""
    raise NotImplementedError


def _stub_receipt() -> Receipt:
    return Receipt(
        merchant="Unknown Merchant",
        purchase_date=date.today(),
        items=[ReceiptItem(name="Item A", unit_price=10000, total_price=10000)],
        total_amount=10000,
        raw_text="[stub]",
    )

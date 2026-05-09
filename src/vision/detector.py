"""
Receipt region detector — YOLOv11 stub.

Replace _run_model() body with real Ultralytics inference when model is ready.
The ToolResult contract must not change.
"""

from __future__ import annotations

from src.core.tool_result import ToolResult


def detect_receipt(image_bytes: bytes) -> ToolResult:
    """
    Detect and crop the receipt region from a raw image.

    Args:
        image_bytes: raw image content (JPEG / PNG)

    Returns:
        ToolResult.data = {"cropped_bytes": bytes, "confidence": float}
    """
    if not image_bytes:
        return ToolResult.error(
            summary="Empty image provided",
            error_hint="image_bytes is empty. Ensure the upload is not corrupted.",
            next_actions=["Ask user to re-upload the receipt image"],
        )

    try:
        cropped = _run_model(image_bytes)
    except NotImplementedError:
        # Stub passthrough: treat full image as receipt region
        cropped = image_bytes
        return ToolResult.success(
            summary="Detection skipped — model not loaded, using full image",
            data={"cropped_bytes": cropped, "confidence": 1.0},
            next_actions=["Extract text from region"],
        )
    except Exception as exc:
        return ToolResult.error(
            summary="YOLOv11 inference failed",
            error_hint=f"{type(exc).__name__}: {exc}. Check model path in YOLO_MODEL_PATH.",
            next_actions=["Verify model file exists", "Fall back to full image"],
        )

    return ToolResult.success(
        summary="Receipt region detected",
        data={"cropped_bytes": cropped, "confidence": 0.95},
        next_actions=["Extract text from cropped region"],
    )


def _run_model(image_bytes: bytes) -> bytes:
    """Plug real YOLOv11 inference here."""
    raise NotImplementedError

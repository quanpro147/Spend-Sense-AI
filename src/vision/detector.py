"""YOLOv11 receipt field detector."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any

import structlog

from src.core.config import get_settings
from src.core.tool_result import ToolResult

log = structlog.get_logger()


@dataclass(frozen=True)
class _ImageCandidate:
    name: str
    image: Any


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
        detections, cropped_bytes, metadata = _run_model(image_bytes)
    except NotImplementedError:
        return ToolResult.error(
            summary="YOLOv11 model is not configured",
            error_hint=(
                "Cannot find receipt_items_yolov11s.pt. Put it at "
                "src/models/yolo/receipt_items_yolov11s.pt or set YOLO_MODEL_PATH to the .pt file."
            ),
            next_actions=["Fix YOLO_MODEL_PATH", "Restart FastAPI", "Retry analysis"],
        )
    except Exception as exc:
        return ToolResult.error(
            summary="YOLOv11 inference failed",
            error_hint=(
                f"{type(exc).__name__}: {exc}. Check YOLO_MODEL_PATH or "
                "YOLO_MODEL_REPO/YOLO_MODEL_FILENAME."
            ),
            next_actions=["Verify model file exists", "Verify Hugging Face repo/file/token", "Retry analysis"],
        )

    classes = _class_counts(detections)
    log.info(
        "detector.yolo.done",
        detections=len(detections),
        classes=classes,
        cropped=metadata.get("cropped", False),
        confidence=metadata.get("confidence"),
        model_path=metadata.get("model_path"),
        source=metadata.get("source"),
    )

    if not detections:
        return ToolResult.error(
            summary="YOLOv11 detected no receipt fields",
            error_hint=(
                "The YOLO model loaded, but returned 0 Item/price/quantity boxes. "
                "Use a clearer receipt image or lower YOLO_CONFIDENCE."
            ),
            next_actions=["Retake a sharper receipt photo", "Set YOLO_CONFIDENCE=0.1", "Retry analysis"],
        )

    return ToolResult.success(
        summary=f"Detected {len(detections)} receipt fields",
        data={
            "cropped_bytes": cropped_bytes,
            "image_bytes": image_bytes,
            "detections": detections,
            "confidence": metadata.get("confidence", 0.95),
            "detector_metadata": metadata,
        },
        next_actions=["Run OCR on detected fields"],
    )


def warm_up_detector() -> dict[str, Any]:
    """Load YOLO weights once so the first receipt request avoids model init."""
    cfg = get_settings()
    model_path = _resolve_model_path(
        cfg.yolo_model_path,
        cfg.yolo_model_repo,
        cfg.yolo_model_filename,
        cfg.yolo_model_revision,
        cfg.hf_token,
    )
    if not model_path:
        raise NotImplementedError("YOLO model is not configured")
    _load_yolo(model_path)
    return {"model_path": model_path}


def _run_model(image_bytes: bytes) -> tuple[list[dict], bytes, dict[str, Any]]:
    cfg = get_settings()
    model_path = _resolve_model_path(
        cfg.yolo_model_path,
        cfg.yolo_model_repo,
        cfg.yolo_model_filename,
        cfg.yolo_model_revision,
        cfg.hf_token,
    )
    if not model_path:
        raise NotImplementedError

    try:
        from PIL import Image
    except Exception as exc:
        raise RuntimeError("Pillow is required to decode receipt images") from exc

    model = _load_yolo(model_path)
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    candidates = _candidate_images(image)
    confidence = min(cfg.yolo_confidence, 0.3)
    detections, cropped_image, source = _best_prediction(model, candidates, confidence)
    if not detections and confidence > 0.1:
        confidence = 0.1
        detections, cropped_image, source = _best_prediction(model, candidates, confidence)

    cropped_bytes = _image_to_bytes(cropped_image)

    metadata = {
        "confidence": confidence,
        "cropped": cropped_image.size != image.size,
        "source": source,
        "image_width": image.width,
        "image_height": image.height,
        "crop_width": cropped_image.width,
        "crop_height": cropped_image.height,
        "model_path": model_path,
    }
    return detections, cropped_bytes, metadata


def _best_prediction(model, candidates: list[_ImageCandidate], confidence: float) -> tuple[list[dict], Any, str]:
    best_name = candidates[0].name
    best_image = candidates[0].image
    best_detections: list[dict] = []
    best_score = -1

    for candidate in candidates:
        detections = _predict_fields(model, candidate.image, confidence)
        score = _detection_score(detections)
        if score > best_score:
            best_name = candidate.name
            best_image = candidate.image
            best_detections = detections
            best_score = score
        if _is_good_enough_candidate(detections):
            break

    return best_detections, best_image, best_name


def _predict_fields(model, image, confidence: float) -> list[dict]:
    result = model.predict(image, conf=confidence, imgsz=1280, verbose=False)[0]
    names = result.names
    detections: list[dict] = []

    for box in result.boxes:
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
        width = x2 - x1
        height = y2 - y1
        class_id = int(box.cls[0].item())
        class_name = _normalize_class_name(str(names.get(class_id, class_id)))
        detections.append(
            {
                "id": str(uuid.uuid4()),
                "x": x1 + width / 2,
                "y": y1 + height / 2,
                "width": width,
                "height": height,
                "confidence": float(box.conf[0].item()),
                "class_name": class_name,
                "class_id": class_id,
            }
        )
    return sorted(detections, key=lambda item: (float(item["y"]), float(item["x"])))


def _candidate_images(image) -> list[_ImageCandidate]:
    cropped = _crop_likely_receipt_region(image)
    candidates = [_ImageCandidate("full", image)]
    if cropped.size != image.size:
        candidates.insert(0, _ImageCandidate("receipt_crop", cropped))
    return candidates


def _detection_score(detections: list[dict]) -> int:
    classes = {str(detection.get("class_name", "")) for detection in detections}
    useful = sum(1 for detection in detections if detection.get("class_name") in {"item", "price", "quantity"})
    return useful * 10 + len(classes)


def _is_good_enough_candidate(detections: list[dict]) -> bool:
    counts = _class_counts(detections)
    item_count = counts.get("item", 0)
    price_count = counts.get("price", 0)
    useful_count = item_count + price_count + counts.get("quantity", 0)
    return item_count >= 2 and price_count >= 2 and useful_count >= 4


def _normalize_class_name(class_name: str) -> str:
    normalized = class_name.strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in {"item", "items", "name", "product", "product_name"}:
        return "item"
    if normalized in {"store_name", "store", "merchant"}:
        return "store_name"
    if normalized in {"price", "amount", "total", "line_total"}:
        return "price"
    if normalized in {"quantity", "qty", "sl", "so_luong"}:
        return "quantity"
    return normalized


def _crop_likely_receipt_region(image):
    try:
        import cv2
        import numpy as np
    except Exception:
        return image

    arr = np.array(image)
    brightness = arr.mean(axis=2)
    color_spread = arr.max(axis=2) - arr.min(axis=2)
    mask = ((brightness > 145) & (color_spread < 90)).astype("uint8") * 255
    kernel = np.ones((11, 11), dtype="uint8")
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if count <= 1:
        return image

    image_area = image.width * image.height
    candidates: list[tuple[int, int, int, int, int]] = []
    for label in range(1, count):
        x, y, width, height, area = [int(value) for value in stats[label]]
        if area < image_area * 0.04 or width < image.width * 0.18 or height < image.height * 0.22:
            continue
        if area > image_area * 0.96:
            continue
        candidates.append((area, x, y, width, height))

    if not candidates:
        return image

    _, x, y, width, height = max(candidates, key=lambda item: item[0])
    padding = 16
    left = max(0, x - padding)
    top = max(0, y - padding)
    right = min(image.width, x + width + padding)
    bottom = min(image.height, y + height + padding)
    return image.crop((left, top, right, bottom))


def _image_to_bytes(image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _class_counts(detections: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for detection in detections:
        class_name = str(detection.get("class_name", "unknown"))
        counts[class_name] = counts.get(class_name, 0) + 1
    return counts


def _resolve_model_path(
    local_path: str,
    repo_id: str,
    filename: str,
    revision: str,
    token: str,
) -> str:
    candidates: list[Path] = []
    if local_path:
        path = Path(local_path).expanduser()
        candidates.append(path)
        if not path.is_absolute():
            candidates.append(Path.cwd() / path)

    if filename:
        candidates.append(Path.cwd() / "src" / "models" / "yolo" / filename)
        candidates.append(Path.cwd() / "src" / "models" / filename)

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return str(candidate.resolve())

    if not repo_id or not filename:
        raise NotImplementedError

    try:
        from huggingface_hub import hf_hub_download
    except Exception as exc:
        raise RuntimeError("huggingface-hub is required to download YOLO weights") from exc

    return hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        revision=revision or "main",
        token=token or None,
    )


@lru_cache
def _load_yolo(model_path: str):
    try:
        from ultralytics import YOLO
    except Exception as exc:
        raise RuntimeError("ultralytics is required to load YOLOv11 weights") from exc
    return YOLO(model_path)

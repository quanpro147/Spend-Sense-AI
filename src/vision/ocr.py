"""
OCR extractor — VietOCR (vgg_transformer) for both field-level and full-image paths.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from io import BytesIO
from typing import Any

from src.core.tool_result import ToolResult
from src.models.expense import Receipt, ReceiptItem
from src.vision.reconstructor import reconstruct_receipt


@dataclass(frozen=True)
class _OCRLine:
    text: str
    top: int
    bottom: int


_MONEY_RE = re.compile(r"(?<![\d.,])(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})(?![\d.,])")


def extract_receipt(image_bytes: bytes, detections: list[dict[str, Any]] | None = None) -> ToolResult:
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

    if detections:
        fields = _ocr_detected_fields(image_bytes, detections)
        receipt, draft_items = reconstruct_receipt(fields)
        result = ToolResult.warning(
            summary=f"OCR produced {len(fields)} detected fields",
            data=receipt,
            next_actions=["Embed receipt text", "Let user review reconstructed fields"],
            error_hint="VietOCR may be unavailable; empty fields can be corrected in the frontend.",
        )
        return result.model_copy(
            update={
                "artifacts": {"receipt_id": str(receipt.id)},
                "data": {"receipt": receipt, "fields": fields, "draft_items": draft_items},
            }
        )

    try:
        receipt, fields, draft_items = _extract_full_image_receipt(image_bytes)
    except Exception as exc:
        return ToolResult.error(
            summary="OCR extraction failed",
            error_hint=f"{type(exc).__name__}: {exc}",
            next_actions=["Check image quality", "Verify VietOCR is installed", "Retry with enhanced contrast"],
        )

    result = ToolResult.success(
        summary=f"Extracted {len(receipt.items)} items from {receipt.merchant}",
        data={"receipt": receipt, "fields": fields, "draft_items": draft_items},
        next_actions=["Embed receipt canonical text", "Let user review reconstructed fields"],
        artifacts={"receipt_id": str(receipt.id)},
    )
    return result


def _extract_full_image_receipt(image_bytes: bytes) -> tuple[Receipt, list[dict[str, Any]], list[dict[str, Any]]]:
    lines, image_width = _run_ocr(image_bytes)
    raw_text = "\n".join(line.text for line in lines)
    merchant = _merchant_from_lines(lines)
    purchase_date = date.today()
    total_amount = _parse_total([line.text for line in lines])
    fields, draft_items, items = _fields_and_items_from_lines(lines, image_width)

    if not items:
        fallback_item = ReceiptItem(name="Unassigned receipt item", quantity=1, unit_price=0, total_price=0)
        items = [fallback_item]
        draft_items = [
            {
                "id": str(uuid.uuid4()),
                "name": fallback_item.name,
                "quantity": fallback_item.quantity,
                "unit_price": fallback_item.unit_price,
                "discount": fallback_item.discount,
                "total_price": fallback_item.total_price,
                "category": fallback_item.category,
                "source_token_ids": {"name": None, "quantity": None, "unit_price": None, "discount": None},
            }
        ]

    item_total = sum(item.total_price for item in items)
    if total_amount <= 0:
        total_amount = item_total

    receipt = Receipt(
        merchant=merchant,
        purchase_date=purchase_date,
        items=items,
        total_amount=total_amount,
        raw_text=raw_text,
    )
    return receipt, fields, draft_items


def _run_ocr(image_bytes: bytes) -> tuple[list[_OCRLine], int]:
    """
    Full-image OCR using VietOCR.

    Splits the receipt into horizontal text bands via pixel projection,
    runs VietOCR on each band, then parses merchant and total from the lines.
    """
    import numpy as np
    from PIL import Image

    predictor = _vietocr_predictor()
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    image = _crop_likely_receipt_region(image)

    bands = _find_text_bands(np.array(image.convert("L")), image.height)

    lines: list[_OCRLine] = []
    for top, bottom in bands:
        crop = _prepare_line_crop(image.crop((0, top, image.width, bottom)))
        try:
            text = str(predictor.predict(crop)).strip()
            if text:
                lines.append(_OCRLine(text=" ".join(text.split()), top=top, bottom=bottom))
        except Exception:
            pass

    if not lines:
        raise RuntimeError("VietOCR returned no text from receipt image")

    return lines, image.width


def _crop_likely_receipt_region(image: Any) -> Any:
    try:
        import cv2
        import numpy as np
    except Exception:
        return image

    arr = np.array(image)
    brightness = arr.mean(axis=2)
    color_spread = arr.max(axis=2) - arr.min(axis=2)
    mask = ((brightness > 145) & (color_spread < 85)).astype("uint8") * 255
    kernel = np.ones((9, 9), dtype="uint8")
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if count <= 1:
        return image

    image_area = image.width * image.height
    candidates: list[tuple[int, int, int, int, int]] = []
    for label in range(1, count):
        x, y, width, height, area = [int(value) for value in stats[label]]
        if area < image_area * 0.04 or width < image.width * 0.2 or height < image.height * 0.25:
            continue
        if area > image_area * 0.95:
            continue
        candidates.append((area, x, y, width, height))

    if not candidates:
        return image

    _, x, y, width, height = max(candidates, key=lambda item: item[0])
    padding = 12
    left = max(0, x - padding)
    top = max(0, y - padding)
    right = min(image.width, x + width + padding)
    bottom = min(image.height, y + height + padding)
    return image.crop((left, top, right, bottom))


def _prepare_line_crop(image: Any) -> Any:
    from PIL import ImageOps

    image = ImageOps.autocontrast(image.convert("L")).convert("RGB")
    if image.height < 32:
        ratio = 32 / max(image.height, 1)
        image = image.resize((max(1, int(image.width * ratio)), 32))
    return image


def _find_text_bands(gray: "np.ndarray", height: int) -> list[tuple[int, int]]:
    """Return (top, bottom) pixel ranges for each horizontal text band."""
    row_min = gray.min(axis=1)
    text_rows = row_min < 200

    bands: list[tuple[int, int]] = []
    in_band = False
    start = 0
    padding = 3

    for i, has_text in enumerate(text_rows):
        if has_text and not in_band:
            start = max(0, i - padding)
            in_band = True
        elif not has_text and in_band:
            end = min(height, i + padding)
            if end - start > 5:
                bands.append((start, end))
            in_band = False

    if in_band:
        bands.append((start, height))

    return bands


def _parse_total(lines: list[str]) -> float:
    """Return the explicit grand total when OCR finds one."""
    for line in reversed(lines):
        if not _is_grand_total_line(line):
            continue
        values = [_parse_money(match.group(0)) for match in _MONEY_RE.finditer(line)]
        values = [value for value in values if value > 0]
        if values:
            return values[-1]
    return 0.0


def _parse_money(text: str) -> float:
    cleaned = re.sub(r"[^\d]", "", text)
    return float(cleaned) if cleaned else 0.0


def _merchant_from_lines(lines: list[_OCRLine]) -> str:
    for line in lines[:6]:
        text = line.text.strip()
        if text and not _is_noise_or_header_line(text):
            return text
    return lines[0].text.strip() if lines else "Unknown Merchant"


def _fields_and_items_from_lines(
    lines: list[_OCRLine],
    image_width: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[ReceiptItem]]:
    fields: list[dict[str, Any]] = []
    draft_items: list[dict[str, Any]] = []
    receipt_items: list[ReceiptItem] = []
    pending_name: str | None = None
    pending_field: dict[str, Any] | None = None

    for line in lines:
        text = line.text.strip()
        if not text:
            continue
        if _is_total_line(text) or _is_noise_or_header_line(text) or _is_footer_line(text):
            pending_name = None
            pending_field = None
            continue

        money_matches = list(_MONEY_RE.finditer(text))
        if not money_matches:
            if _looks_like_item_name(text):
                pending_name = text
                pending_field = _make_field("item", text, line, image_width, x_ratio=0.35, width_ratio=0.65)
                fields.append(pending_field)
            continue

        amount_match = money_matches[-1]
        amount_text = amount_match.group(0)
        line_amount = _parse_money(amount_text)
        if line_amount <= 0:
            continue

        prefix = text[: money_matches[0].start()].strip(" :-|")
        name = _clean_item_name(prefix)
        item_field = None
        if not _looks_like_item_name(name):
            name = pending_name or ""
            item_field = pending_field

        if not _looks_like_item_name(name):
            pending_name = None
            pending_field = None
            continue

        if item_field is None:
            item_field = _make_field("item", name, line, image_width, x_ratio=0.35, width_ratio=0.65)
            fields.append(item_field)

        price_field = _make_field("price", amount_text, line, image_width, x_ratio=0.82, width_ratio=0.28)
        fields.append(price_field)

        receipt_item = ReceiptItem(name=name, quantity=1.0, unit_price=line_amount, discount=0.0, total_price=line_amount)
        draft_item = {
            "id": str(uuid.uuid4()),
            "name": name,
            "quantity": 1.0,
            "unit_price": line_amount,
            "discount": 0.0,
            "total_price": line_amount,
            "category": "khac",
            "source_token_ids": {
                "name": item_field["id"],
                "quantity": None,
                "unit_price": price_field["id"],
                "discount": None,
            },
        }
        receipt_items.append(receipt_item)
        draft_items.append(draft_item)
        pending_name = None
        pending_field = None

    return fields, draft_items, receipt_items


def _make_field(
    class_name: str,
    text: str,
    line: _OCRLine,
    image_width: int,
    *,
    x_ratio: float,
    width_ratio: float,
) -> dict[str, Any]:
    height = max(8, line.bottom - line.top)
    return {
        "id": str(uuid.uuid4()),
        "class_name": class_name,
        "text": text,
        "confidence": 0.55,
        "x": float(image_width * x_ratio),
        "y": float((line.top + line.bottom) / 2),
        "width": float(max(1, image_width * width_ratio)),
        "height": float(height),
    }


def _clean_item_name(text: str) -> str:
    text = re.sub(r"\b\d+(?:[.,]\d+)?\s*$", "", text).strip(" :-|")
    text = re.sub(r"\s+", " ", text)
    return text


def _looks_like_item_name(text: str) -> bool:
    normalized = _normalize_text(text)
    if len(normalized) < 2:
        return False
    if _is_total_line(text) or _is_noise_or_header_line(text) or _is_footer_line(text):
        return False
    return any(char.isalpha() for char in normalized)


def _is_noise_or_header_line(text: str) -> bool:
    normalized = _normalize_text(text)
    keywords = (
        "hoa don", "phieu thanh toan", "ngay", "nhan vien", "khach hang", "ma gd",
        "gia ban", "don gia", "d gia", "thanh tien", "t tien", "sl", "so luong",
        "website", "www", "dien thoai", "dia chi", "cam on", "quy khach",
        "hotline", "tong dai", "lien he",
    )
    return any(keyword in normalized for keyword in keywords)


def _is_total_line(text: str) -> bool:
    normalized = _normalize_text(text)
    keywords = (
        "tong", "tong tien", "thanh toan", "tien mat", "khach tra", "tra lai",
        "vat", "giam gia", "chiet khau", "da lam tron",
    )
    return any(keyword in normalized for keyword in keywords)


def _is_grand_total_line(text: str) -> bool:
    normalized = _normalize_text(text)
    if _is_footer_line(text):
        return False
    keywords = (
        "tong tien", "tong cong", "tong thanh toan", "can thanh toan",
        "thanh toan", "phai thanh toan",
    )
    return any(keyword in normalized for keyword in keywords)


def _is_footer_line(text: str) -> bool:
    normalized = _normalize_text(text)
    keywords = ("hotline", "tong dai", "lien he", "www", "website", "dien thoai")
    return any(keyword in normalized for keyword in keywords)


def _normalize_text(text: str) -> str:
    without_accents = "".join(
        char for char in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(char) != "Mn"
    )
    return " ".join(without_accents.replace("đ", "d").split())


def _has_useful_fields(fields: list[dict[str, Any]]) -> bool:
    return any(str(field.get("text", "")).strip() for field in fields)


def _ocr_detected_fields(image_bytes: bytes, detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    from PIL import Image

    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    predictor = _vietocr_predictor()
    fields: list[dict[str, Any]] = []
    for detection in detections:
        class_name = _normalize_class_name(str(detection.get("class_name", "field")))
        if _is_store_name(class_name):
            continue
        text = _read_box_text(predictor, image, detection)
        fields.append(
            {
                "id": str(detection.get("id") or detection.get("detection_id") or ""),
                "class_name": class_name,
                "text": text,
                "confidence": float(detection.get("confidence", 0)),
                "x": float(detection.get("x", 0)),
                "y": float(detection.get("y", 0)),
                "width": float(detection.get("width", 0)),
                "height": float(detection.get("height", 0)),
            }
        )
    return fields


def _is_store_name(class_name: str) -> bool:
    return _normalize_class_name(class_name) == "store_name"


def _read_box_text(predictor: Any, image: Any, detection: dict[str, Any]) -> str:
    try:
        crop = _crop_detection(image, detection)
        return str(predictor.predict(crop)).strip()
    except Exception:
        return _fallback_text(str(detection.get("class_name", "")))


def _crop_detection(image: Any, detection: dict[str, Any]):
    padding = 4
    x = float(detection.get("x", 0))
    y = float(detection.get("y", 0))
    width = float(detection.get("width", 0))
    height = float(detection.get("height", 0))
    left = max(0, int(x - width / 2 - padding))
    top = max(0, int(y - height / 2 - padding))
    right = min(image.width, int(x + width / 2 + padding))
    bottom = min(image.height, int(y + height / 2 + padding))
    return image.crop((left, top, right, bottom))


@lru_cache
def _vietocr_predictor():
    import PIL.Image

    # VietOCR uses Image.ANTIALIAS which was removed in Pillow 10; patch it.
    if not hasattr(PIL.Image, "ANTIALIAS"):
        PIL.Image.ANTIALIAS = PIL.Image.LANCZOS  # type: ignore[attr-defined]

    from vietocr.tool.config import Cfg
    from vietocr.tool.predictor import Predictor

    config = Cfg.load_config_from_name("vgg_transformer")
    config["device"] = "cpu"
    return Predictor(config)


def warm_up_ocr() -> None:
    """Load VietOCR weights once so the first OCR request avoids model init."""
    _vietocr_predictor()


def _fallback_text(class_name: str) -> str:
    normalized = _normalize_class_name(class_name)
    if _is_store_name(normalized):
        return "Unknown Merchant"
    if normalized == "quantity":
        return "1"
    if normalized == "price":
        return "0"
    if normalized == "item":
        return "Unnamed item"
    return ""


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

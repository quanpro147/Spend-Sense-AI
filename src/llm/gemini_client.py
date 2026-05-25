"""Gemini/Gemma client helpers used by the receipt pipeline."""

from __future__ import annotations

import uuid
import time
import unicodedata
from typing import Any

from src.core.config import get_settings
from src.core.tool_result import ToolResult
from src.models.expense import Insight, InsightSource, Receipt

RECEIPT_CATEGORIES = (
    {"value": "an-uong", "label": "Ăn uống"},
    {"value": "di-chuyen", "label": "Di chuyển"},
    {"value": "mua-sam", "label": "Mua sắm"},
    {"value": "nha-o", "label": "Nhà ở"},
    {"value": "suc-khoe", "label": "Sức khỏe"},
    {"value": "giai-tri", "label": "Giải trí"},
    {"value": "giao-duc", "label": "Giáo dục"},
    {"value": "dau-tu", "label": "Đầu tư"},
    {"value": "luong", "label": "Lương"},
    {"value": "thuong", "label": "Thưởng"},
    {"value": "khac", "label": "Khác"},
)

_CATEGORY_VALUES = {category["value"] for category in RECEIPT_CATEGORIES}
_GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

_PROMPT_TEMPLATE = """Analyze this receipt and respond in JSON only.

Receipt:
{receipt_text}

Respond with exactly this JSON structure:
{{
  "summary": "<one sentence describing the spending>",
  "category": "<single category: Food, Transport, Shopping, Health, Entertainment, Other>",
  "tips": ["<tip 1>", "<tip 2>"]
}}"""

_ITEM_CATEGORY_PROMPT_TEMPLATE = """Phân loại từng món hàng trong hóa đơn vào đúng một danh mục.

Danh mục hợp lệ:
{categories}

Món hàng:
{items}

Chỉ trả JSON hợp lệ theo cấu trúc:
{{
  "items": [
    {{"id": "<id món hàng>", "category": "<một value trong danh mục hợp lệ>"}}
  ]
}}

Không thêm giải thích. Nếu không chắc, dùng "khac"."""


def generate_insight(receipt: Receipt) -> ToolResult:
    """
    Call Gemini to generate a financial insight for a receipt.

    Args:
        receipt: parsed Receipt model

    Returns:
        ToolResult.data = Insight
    """
    prompt = _PROMPT_TEMPLATE.format(receipt_text=receipt.canonical_text)

    try:
        raw_json = _call_gemini(prompt, response_schema=_insight_response_schema())
    except NotImplementedError:
        insight = _stub_insight(receipt)
        return ToolResult.warning(
            summary="Gemini not configured — returning stub insight",
            data=insight,
            next_actions=["Store stub insight in cache", "Set GEMINI_API_KEY to enable real generation"],
            error_hint="GEMINI_API_KEY not set.",
        )
    except Exception as exc:
        return ToolResult.error(
            summary="Gemini API call failed",
            error_hint=f"{type(exc).__name__}: {exc}. Check GEMINI_API_KEY and quota.",
            next_actions=["Retry after backoff", "Check API quota in Google Cloud console"],
        )

    try:
        parsed = _parse_response(raw_json)
    except Exception as exc:
        return ToolResult.error(
            summary="Failed to parse Gemini response",
            error_hint=f"JSON parse error: {exc}. Raw response: {raw_json[:200]}",
            next_actions=["Retry with same prompt", "Check prompt template format"],
        )

    insight = Insight(
        receipt_id=receipt.id,
        summary=parsed["summary"],
        category=parsed["category"],
        tips=parsed.get("tips", []),
        source=InsightSource.LLM,
    )
    return ToolResult.success(
        summary=f"Insight generated: {insight.category}",
        data=insight,
        next_actions=["Store insight vector in cache"],
        artifacts={"insight_id": str(insight.id)},
    )


def classify_receipt_items(items: list[dict[str, Any]]) -> ToolResult:
    """
    Classify all detected item names in one Gemma request.

    ToolResult.data is a mapping of draft item id -> category value.
    """
    item_payload = [
        {"id": str(item.get("id", "")), "name": str(item.get("name", "")).strip()}
        for item in items
        if str(item.get("id", "")).strip() and str(item.get("name", "")).strip()
    ]
    if not item_payload:
        return ToolResult.success("No receipt items to classify", data={})

    import json

    prompt = _ITEM_CATEGORY_PROMPT_TEMPLATE.format(
        categories=json.dumps(RECEIPT_CATEGORIES, ensure_ascii=False),
        items=json.dumps(item_payload, ensure_ascii=False),
    )

    cfg = get_settings()
    try:
        raw_json = _call_gemini(
            prompt,
            model_name=cfg.gemma_model,
            response_schema=_item_category_response_schema(),
            timeout=cfg.gemma_timeout_seconds,
            retries=0,
        )
        parsed = _parse_response(raw_json)
        categories = _extract_item_categories(parsed)
    except NotImplementedError:
        return _fallback_classification_result(
            item_payload,
            summary="Gemma not configured — using local item category fallback",
            error_hint="GEMINI_API_KEY not set.",
        )
    except Exception as exc:
        return _fallback_classification_result(
            item_payload,
            summary="Gemma item categorization failed — using local item category fallback",
            error_hint=f"{type(exc).__name__}: {exc}",
        )

    for item in item_payload:
        categories.setdefault(item["id"], "khac")

    return ToolResult.success(
        summary=f"Classified {len(categories)} receipt items",
        data=categories,
        next_actions=["Let user review item categories"],
    )


def _call_gemini(
    prompt: str,
    *,
    model_name: str | None = None,
    response_schema: dict[str, Any] | None = None,
    timeout: float = 60,
    retries: int = 2,
) -> str:
    cfg = get_settings()
    if not cfg.gemini_api_key:
        raise NotImplementedError

    import httpx

    model = model_name or cfg.gemini_model
    payload: dict[str, Any] = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "responseMimeType": "application/json",
        },
    }
    if response_schema:
        payload["generationConfig"]["responseSchema"] = response_schema

    response = _post_gemini_with_retry(model, cfg.gemini_api_key, payload, timeout=timeout, retries=retries)
    if response.status_code == 400 and response_schema:
        # Some model variants accept JSON mode but reject responseSchema. Retry
        # once so categorization still works instead of silently becoming khac.
        payload["generationConfig"].pop("responseSchema", None)
        response = _post_gemini_with_retry(model, cfg.gemini_api_key, payload, timeout=timeout, retries=retries)
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = _extract_google_error(response)
        raise RuntimeError(f"Gemini API {response.status_code}: {detail}") from exc

    payload = response.json()
    text = _extract_response_text(payload)
    if text:
        return text

    finish_reason = _extract_finish_reason(payload)
    if finish_reason:
        raise RuntimeError(f"Gemini returned an empty response. finishReason={finish_reason}")

    raise RuntimeError("Gemini returned an empty response")


def _post_gemini_with_retry(model: str, api_key: str, payload: dict[str, Any], *, timeout: float, retries: int) -> Any:
    response = None
    for attempt in range(retries + 1):
        response = _post_gemini(model, api_key, payload, timeout=timeout)
        if response.status_code < 500:
            return response
        if attempt < retries:
            time.sleep(0.6 * (attempt + 1))
    return response


def _post_gemini(model: str, api_key: str, payload: dict[str, Any], *, timeout: float) -> Any:
    import httpx

    return httpx.post(
        _GEMINI_API_URL.format(model=model),
        params={"key": api_key},
        json=payload,
        timeout=timeout,
    )


def _parse_response(raw_json: str) -> dict:
    import json
    # strip markdown code fences if present
    text = raw_json.strip()
    if not text:
        raise ValueError("Empty Gemini response")
    if text.startswith("```"):
        chunks = text.split("```")
        text = chunks[1] if len(chunks) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise
        parsed = json.loads(text[start:end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("Gemini response JSON must be an object")
    return parsed


def _extract_response_text(payload: dict[str, Any]) -> str:
    texts: list[str] = []
    for candidate in payload.get("candidates", []) or []:
        content = candidate.get("content") or {}
        for part in content.get("parts", []) or []:
            text = part.get("text")
            if isinstance(text, str):
                texts.append(text)
    return "".join(texts).strip()


def _extract_finish_reason(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates", []) or []
    if not candidates:
        prompt_feedback = payload.get("promptFeedback") or {}
        block_reason = prompt_feedback.get("blockReason")
        return f"NO_CANDIDATES blockReason={block_reason}" if block_reason else "NO_CANDIDATES"
    finish_reason = candidates[0].get("finishReason")
    return str(finish_reason or "")


def _extract_google_error(response: Any) -> str:
    try:
        payload = response.json()
    except Exception:
        return response.text[:500]
    error = payload.get("error", payload)
    if isinstance(error, dict):
        message = error.get("message") or error.get("status") or str(error)
        return str(message)[:500]
    return str(error)[:500]


def _insight_response_schema() -> dict[str, Any]:
    return {
        "type": "OBJECT",
        "properties": {
            "summary": {"type": "STRING"},
            "category": {"type": "STRING"},
            "tips": {
                "type": "ARRAY",
                "items": {"type": "STRING"},
            },
        },
        "required": ["summary", "category", "tips"],
    }


def _item_category_response_schema() -> dict[str, Any]:
    return {
        "type": "OBJECT",
        "properties": {
            "items": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "STRING"},
                        "category": {"type": "STRING", "enum": sorted(_CATEGORY_VALUES)},
                    },
                    "required": ["id", "category"],
                },
            },
        },
        "required": ["items"],
    }


def _fallback_item_categories(items: list[dict[str, str]]) -> dict[str, str]:
    return {item["id"]: _guess_category(item["name"]) for item in items}


def _fallback_classification_result(items: list[dict[str, str]], *, summary: str, error_hint: str) -> ToolResult:
    return ToolResult.warning(
        summary=summary,
        data=_fallback_item_categories(items),
        next_actions=["Review item categories in the receipt UI"],
        error_hint=error_hint,
    )


def _guess_category(name: str) -> str:
    normalized = _normalize_text(name)
    category_terms = {
        "an-uong": (
            "banh", "bia", "bun", "ca", "cafe", "cai", "cam", "canh", "carot", "chanh", "che",
            "chay", "com", "ga", "gio", "hu tieu", "kem", "mi", "my", "nuoc", "pepsi", "pho",
            "rau", "suon", "sua", "thit", "tom", "tra", "trung", "xoi",
        ),
        "di-chuyen": ("bus", "grab", "taxi", "xang", "xe", "ve xe"),
        "suc-khoe": ("duoc", "kham", "thuoc", "vien", "vitamin"),
        "giai-tri": ("game", "karaoke", "netflix", "phim", "rap"),
        "giao-duc": ("but", "hoc", "sach", "vo"),
        "nha-o": ("dien", "gas", "nuoc sinh hoat", "wifi"),
    }
    for category, terms in category_terms.items():
        if any(term in normalized for term in terms):
            return category
    return "khac"


def _normalize_text(text: str) -> str:
    without_accents = "".join(
        char for char in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(char) != "Mn"
    )
    return " ".join(without_accents.replace("đ", "d").split())


def _extract_item_categories(parsed: dict) -> dict[str, str]:
    rows = parsed.get("items", [])
    if not isinstance(rows, list):
        return {}

    categories: dict[str, str] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        item_id = str(row.get("id", "")).strip()
        category = str(row.get("category", "")).strip()
        if item_id and category in _CATEGORY_VALUES:
            categories[item_id] = category
    return categories


def _stub_insight(receipt: Receipt) -> Insight:
    return Insight(
        id=uuid.uuid4(),
        receipt_id=receipt.id,
        summary=f"Spent {receipt.total_amount:,.0f} {receipt.currency} at {receipt.merchant}.",
        category="Other",
        tips=["Track your spending regularly.", "Compare prices before purchasing."],
        source=InsightSource.LLM,
    )

"""
Pipeline orchestrator — chains all tools in order.

Flow:
  detect → ocr → embed → cache_lookup
                              ├── HIT  → return cached insight
                              └── MISS → generate → cache_store → return insight

Each step returns ToolResult. The orchestrator stops on status=error and
propagates error_hint so the API layer can surface a meaningful message.
"""

from __future__ import annotations

import structlog

from src.cache.vector_store import cache_lookup, cache_store
from src.core.config import get_settings
from src.core.tool_result import ToolResult, ToolStatus
from src.embedding.embedder import embed_text
from src.llm.gemini_client import classify_receipt_items, generate_insight
from src.models.expense import Insight, Receipt
from src.vision.detector import detect_receipt
from src.vision.ocr import extract_receipt

log = structlog.get_logger()


class PipelineError(Exception):
    def __init__(self, step: str, result: ToolResult) -> None:
        self.step = step
        self.result = result
        super().__init__(f"[{step}] {result.summary}")


def analyze_receipt(image_bytes: bytes) -> Insight:
    return analyze_receipt_details(image_bytes)["insight"]


def analyze_receipt_details(image_bytes: bytes) -> dict:
    """
    Full pipeline: image bytes → receipt draft + fields + Insight.

    Raises:
        PipelineError if any step returns status=error.
    """
    # 1. Detect receipt region
    log.info("pipeline.detect.start")
    detect_result = detect_receipt(image_bytes)
    _require_ok(detect_result, "detect")

    cropped: bytes = detect_result.data["cropped_bytes"]
    detections: list[dict] = [
        detection
        for detection in detect_result.data.get("detections", [])
        if str(detection.get("class_name", "")).strip().lower().replace("-", "_").replace(" ", "_") != "store_name"
    ]

    # 2. OCR extraction
    log.info("pipeline.ocr.start")
    ocr_result = extract_receipt(cropped, detections)
    _require_ok(ocr_result, "ocr")

    ocr_payload = ocr_result.data
    if isinstance(ocr_payload, dict):
        receipt: Receipt = ocr_payload["receipt"]
        fields: list[dict] = ocr_payload.get("fields", [])
        draft_items: list[dict] = ocr_payload.get("draft_items", [])
    else:
        receipt = ocr_payload
        fields = []
        draft_items = [
            {
                "id": str(item.name),
                "name": item.name,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "total_price": item.total_price,
                "category": item.category,
                "source_token_ids": {},
            }
            for item in receipt.items
        ]
    log.info("pipeline.ocr.done", merchant=receipt.merchant, items=len(receipt.items))

    # 3. Classify every detected item name in a single Gemma request. This is
    # non-fatal because users can still correct categories in the review UI.
    log.info("pipeline.classify_items.start", items=len(draft_items))
    classify_result = classify_receipt_items(draft_items)
    if classify_result.status == ToolStatus.ERROR:
        log.warning("pipeline.classify_items.error", hint=classify_result.error_hint)
    elif classify_result.status == ToolStatus.WARNING:
        log.warning("pipeline.classify_items.warning", hint=classify_result.error_hint)
    _apply_item_categories(receipt, draft_items, classify_result.data if isinstance(classify_result.data, dict) else {})

    # 4. Embed canonical text
    log.info("pipeline.embed.start")
    embed_result = embed_text(receipt.canonical_text)
    _require_ok(embed_result, "embed")

    vector: list[float] = embed_result.data

    cfg = get_settings()
    if not cfg.semantic_cache_enabled:
        log.info("pipeline.cache.skipped")
        insight = _generate_and_store(receipt, vector, skip_store=True)
        return _details_payload(receipt, insight, fields, draft_items)

    # 5. Cache lookup
    log.info("pipeline.cache.lookup")
    lookup_result = cache_lookup(vector, str(receipt.id))

    if lookup_result.status == ToolStatus.ERROR:
        # Cache unreachable — degrade gracefully, call LLM directly
        log.warning("pipeline.cache.unreachable", hint=lookup_result.error_hint)
        insight = _generate_and_store(receipt, vector, skip_store=True)
        return _details_payload(receipt, insight, fields, draft_items)

    if lookup_result.ok:
        log.info("pipeline.cache.hit", similarity=lookup_result.data.similarity_score)
        return _details_payload(receipt, lookup_result.data, fields, draft_items)

    # 6. Cache miss → generate insight
    log.info("pipeline.cache.miss")
    insight = _generate_and_store(receipt, vector)
    return _details_payload(receipt, insight, fields, draft_items)


def _details_payload(receipt: Receipt, insight: Insight, fields: list[dict], draft_items: list[dict]) -> dict:
    return {
        "receipt": receipt,
        "insight": insight,
        "fields": fields,
        "draft_items": draft_items,
    }


def _apply_item_categories(receipt: Receipt, draft_items: list[dict], categories: dict[str, str]) -> None:
    draft_category_by_name: dict[str, str] = {}
    for draft_item in draft_items:
        category = categories.get(str(draft_item.get("id", ""))) or str(draft_item.get("category", "khac") or "khac")
        draft_item["category"] = category
        name = str(draft_item.get("name", "")).strip()
        if name:
            draft_category_by_name[name] = category

    for item in receipt.items:
        item.category = draft_category_by_name.get(item.name, item.category or "khac")


def _generate_and_store(receipt: Receipt, vector: list[float], *, skip_store: bool = False) -> Insight:
    gen_result = generate_insight(receipt)
    _require_ok(gen_result, "generate")

    insight: Insight = gen_result.data

    if not skip_store:
        store_result = cache_store(vector, insight)
        if store_result.failed:
            # Non-fatal: log and continue — user still gets the insight
            log.warning("pipeline.cache.store_failed", hint=store_result.error_hint)
        else:
            log.info("pipeline.cache.stored", vector_id=store_result.artifacts.get("vector_id"))

    return insight


def _require_ok(result: ToolResult, step: str) -> None:
    """Raise PipelineError if the tool returned status=error."""
    if result.status == ToolStatus.ERROR:
        log.error("pipeline.step_failed", step=step, hint=result.error_hint)
        raise PipelineError(step, result)

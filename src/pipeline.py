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
from src.core.tool_result import ToolResult, ToolStatus
from src.embedding.embedder import embed_text
from src.llm.gemini_client import generate_insight
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
    """
    Full pipeline: image bytes → Insight.

    Raises:
        PipelineError if any step returns status=error.
    """
    # 1. Detect receipt region
    log.info("pipeline.detect.start")
    detect_result = detect_receipt(image_bytes)
    _require_ok(detect_result, "detect")

    cropped: bytes = detect_result.data["cropped_bytes"]

    # 2. OCR extraction
    log.info("pipeline.ocr.start")
    ocr_result = extract_receipt(cropped)
    _require_ok(ocr_result, "ocr")

    receipt: Receipt = ocr_result.data
    log.info("pipeline.ocr.done", merchant=receipt.merchant, items=len(receipt.items))

    # 3. Embed canonical text
    log.info("pipeline.embed.start")
    embed_result = embed_text(receipt.canonical_text)
    _require_ok(embed_result, "embed")

    vector: list[float] = embed_result.data

    # 4. Cache lookup
    log.info("pipeline.cache.lookup")
    lookup_result = cache_lookup(vector, str(receipt.id))

    if lookup_result.status == ToolStatus.ERROR:
        # Cache unreachable — degrade gracefully, call LLM directly
        log.warning("pipeline.cache.unreachable", hint=lookup_result.error_hint)
        return _generate_and_store(receipt, vector, skip_store=True)

    if lookup_result.ok:
        log.info("pipeline.cache.hit", similarity=lookup_result.data.similarity_score)
        return lookup_result.data  # type: ignore[return-value]

    # 5. Cache miss → generate insight
    log.info("pipeline.cache.miss")
    return _generate_and_store(receipt, vector)


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

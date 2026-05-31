"""Unit tests for the pipeline orchestrator (all stages mocked)."""
from datetime import date
from types import SimpleNamespace

import pytest

from src import pipeline
from src.core.tool_result import ToolResult
from src.models.expense import Insight, InsightSource, Receipt, ReceiptItem


def _receipt() -> Receipt:
    return Receipt(
        merchant="Quan ABC",
        purchase_date=date(2026, 5, 8),
        items=[ReceiptItem(name="Com tam", quantity=1, unit_price=35000, total_price=35000)],
        total_amount=35000,
        raw_text="Com tam 35000",
    )


def _insight(receipt: Receipt) -> Insight:
    return Insight(
        receipt_id=receipt.id,
        summary="Chi tiêu hợp lý",
        category="an-uong",
        tips=["Nấu tại nhà"],
        source=InsightSource.LLM,
    )


@pytest.fixture
def patched(monkeypatch):
    receipt = _receipt()
    detections = [{"class_name": "item"}, {"class_name": "price"}]
    monkeypatch.setattr(pipeline, "detect_receipt", lambda b: ToolResult.success("ok", data={"cropped_bytes": b"x", "detections": detections}))
    monkeypatch.setattr(pipeline, "extract_receipt", lambda b, d: ToolResult.success("ok", data={"receipt": receipt, "fields": [], "draft_items": []}))
    monkeypatch.setattr(pipeline, "classify_receipt_items", lambda items: ToolResult.success("ok", data={}))
    monkeypatch.setattr(pipeline, "embed_text", lambda text: ToolResult.success("ok", data=[0.1] * 384))
    monkeypatch.setattr(pipeline, "generate_insight", lambda r: ToolResult.success("ok", data=_insight(r)))
    monkeypatch.setattr(pipeline, "get_settings", lambda: SimpleNamespace(semantic_cache_enabled=False))
    return receipt


def test_pipeline_cache_disabled_returns_insight(patched):
    result = pipeline.analyze_receipt_details(b"imgbytes")
    assert result["insight"].category == "an-uong"
    assert result["receipt"].merchant == "Quan ABC"


def test_analyze_receipt_wrapper(patched):
    insight = pipeline.analyze_receipt(b"imgbytes")
    assert insight.summary == "Chi tiêu hợp lý"


def test_pipeline_raises_when_detect_errors(monkeypatch):
    monkeypatch.setattr(pipeline, "detect_receipt", lambda b: ToolResult.error("fail", error_hint="no model"))
    with pytest.raises(pipeline.PipelineError) as exc:
        pipeline.analyze_receipt_details(b"x")
    assert exc.value.step == "detect"


def test_pipeline_raises_when_no_usable_detections(monkeypatch):
    monkeypatch.setattr(
        pipeline, "detect_receipt",
        lambda b: ToolResult.success("ok", data={"cropped_bytes": b"x", "detections": [{"class_name": "store_name"}]}),
    )
    with pytest.raises(pipeline.PipelineError):
        pipeline.analyze_receipt_details(b"x")


def test_pipeline_cache_hit(monkeypatch, patched):
    cached = _insight(patched)
    monkeypatch.setattr(pipeline, "get_settings", lambda: SimpleNamespace(semantic_cache_enabled=True))
    monkeypatch.setattr(pipeline, "cache_lookup", lambda v, rid: ToolResult.success("hit", data=cached))
    result = pipeline.analyze_receipt_details(b"x")
    assert result["insight"] is cached


def test_pipeline_cache_miss_generates_and_stores(monkeypatch, patched):
    monkeypatch.setattr(pipeline, "get_settings", lambda: SimpleNamespace(semantic_cache_enabled=True))
    monkeypatch.setattr(pipeline, "cache_lookup", lambda v, rid: ToolResult.warning("miss", data=None))
    stored = {}

    def _store(vector, insight):
        stored["insight"] = insight
        return ToolResult.success("stored", artifacts={"vector_id": "vec-1"})

    monkeypatch.setattr(pipeline, "cache_store", _store)
    result = pipeline.analyze_receipt_details(b"x")
    assert result["insight"].category == "an-uong"
    assert "insight" in stored

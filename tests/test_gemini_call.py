"""Tests for Gemini call path and insight generation (httpx mocked)."""
from datetime import date
from types import SimpleNamespace

from src.core.tool_result import ToolStatus
from src.llm import gemini_client as gc
from src.models.expense import Receipt, ReceiptItem


def _receipt() -> Receipt:
    return Receipt(
        merchant="Quan ABC",
        purchase_date=date(2026, 5, 8),
        items=[ReceiptItem(name="Com tam", quantity=1, unit_price=35000, total_price=35000)],
        total_amount=35000,
        raw_text="Com tam 35000",
    )


class _FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self):
        return None


def test_extract_response_text_joins_parts():
    payload = {"candidates": [{"content": {"parts": [{"text": "hello "}, {"text": "world"}]}}]}
    assert gc._extract_response_text(payload) == "hello world"


def test_extract_finish_reason_no_candidates():
    assert "NO_CANDIDATES" in gc._extract_finish_reason({"candidates": []})


def test_generate_insight_success(monkeypatch):
    monkeypatch.setattr(gc, "_call_gemini", lambda *a, **k: '{"summary": "Chi tiêu hợp lý", "category": "an-uong", "tips": ["t"]}')
    result = gc.generate_insight(_receipt())
    assert result.status == ToolStatus.SUCCESS
    assert result.data.category == "an-uong"


def test_generate_insight_stub_when_no_key(monkeypatch):
    def _raise(*a, **k):
        raise NotImplementedError

    monkeypatch.setattr(gc, "_call_gemini", _raise)
    result = gc.generate_insight(_receipt())
    assert result.status == ToolStatus.WARNING
    assert result.data.category == "Other"


def test_generate_insight_parse_error(monkeypatch):
    monkeypatch.setattr(gc, "_call_gemini", lambda *a, **k: "not json at all")
    result = gc.generate_insight(_receipt())
    assert result.status == ToolStatus.ERROR


def test_call_gemini_posts_and_extracts(monkeypatch):
    monkeypatch.setattr(gc, "get_settings", lambda: SimpleNamespace(
        gemini_api_key="key", gemini_model="gemini-2.5-flash", gemma_model="gemma", gemma_timeout_seconds=3.0,
    ))
    payload = {"candidates": [{"content": {"parts": [{"text": '{"summary":"s","category":"khac","tips":[]}'}]}}]}
    monkeypatch.setattr(gc, "_post_gemini", lambda *a, **k: _FakeResponse(payload))
    text = gc._call_gemini("prompt")
    assert "summary" in text


def test_call_gemini_without_key_raises(monkeypatch):
    monkeypatch.setattr(gc, "get_settings", lambda: SimpleNamespace(
        gemini_api_key="", gemini_model="m", gemma_model="g", gemma_timeout_seconds=3.0,
    ))
    try:
        gc._call_gemini("prompt")
        assert False, "expected NotImplementedError"
    except NotImplementedError:
        pass

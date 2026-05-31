"""Unit tests for Gemini client parsing and local fallbacks (no network)."""
import pytest

from src.core.tool_result import ToolStatus
from src.llm import gemini_client as gc


def test_parse_response_plain_json():
    parsed = gc._parse_response('{"summary": "x", "category": "an-uong", "tips": []}')
    assert parsed["category"] == "an-uong"


def test_parse_response_strips_markdown_fence():
    raw = "```json\n{\"summary\": \"y\", \"category\": \"khac\", \"tips\": [\"t\"]}\n```"
    parsed = gc._parse_response(raw)
    assert parsed["summary"] == "y"
    assert parsed["tips"] == ["t"]


def test_parse_response_extracts_embedded_object():
    parsed = gc._parse_response('prefix noise {"a": 1} trailing')
    assert parsed["a"] == 1


def test_parse_response_empty_raises():
    with pytest.raises(ValueError):
        gc._parse_response("   ")


def test_guess_category_food_keywords():
    assert gc._guess_category("Cà phê sữa") == "an-uong"
    assert gc._guess_category("Phở bò") == "an-uong"


def test_guess_category_transport_and_default():
    assert gc._guess_category("Grab bike") == "di-chuyen"
    assert gc._guess_category("Sản phẩm lạ") == "khac"


def test_extract_item_categories_filters_invalid():
    parsed = {"items": [
        {"id": "1", "category": "an-uong"},
        {"id": "2", "category": "not-a-real-cat"},
        {"id": "3", "category": "di-chuyen"},
    ]}
    result = gc._extract_item_categories(parsed)
    assert result == {"1": "an-uong", "3": "di-chuyen"}


def test_classify_receipt_items_empty_returns_success():
    result = gc.classify_receipt_items([])
    assert result.status == ToolStatus.SUCCESS
    assert result.data == {}


def test_classify_receipt_items_falls_back_without_api_key(monkeypatch):
    # Force the "no API key" path → NotImplementedError inside _call_gemini
    def _raise(*args, **kwargs):
        raise NotImplementedError

    monkeypatch.setattr(gc, "_call_gemini", _raise)
    items = [{"id": "a", "name": "Cà phê"}, {"id": "b", "name": "Grab"}]
    result = gc.classify_receipt_items(items)
    assert result.status == ToolStatus.WARNING
    assert result.data["a"] == "an-uong"
    assert result.data["b"] == "di-chuyen"

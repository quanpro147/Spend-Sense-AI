"""Tests for OCR extract_receipt branches (VietOCR predictor mocked)."""
from src.core.tool_result import ToolStatus
from src.vision import ocr
from src.vision.ocr import _OCRLine


def test_extract_receipt_empty_image():
    result = ocr.extract_receipt(b"")
    assert result.status == ToolStatus.ERROR


def test_extract_receipt_with_detections(monkeypatch):
    fields = [
        {"id": "i1", "class_name": "item", "text": "Com tam", "confidence": 0.9, "x": 60, "y": 50, "width": 80, "height": 20},
        {"id": "p1", "class_name": "price", "text": "35.000", "confidence": 0.9, "x": 320, "y": 50, "width": 60, "height": 20},
    ]
    monkeypatch.setattr(ocr, "_ocr_detected_fields", lambda img, dets: fields)
    detections = [{"id": "d1", "class_name": "item"}]
    result = ocr.extract_receipt(b"imgbytes", detections)
    assert result.status == ToolStatus.WARNING
    assert "receipt" in result.data
    assert result.data["receipt"].items[0].name == "Com tam"


def test_extract_receipt_full_image_success(monkeypatch):
    lines = [
        _OCRLine("Quan An ABC", 0, 20),
        _OCRLine("Com tam 35.000", 30, 50),
        _OCRLine("Tong cong 35.000", 60, 80),
    ]
    monkeypatch.setattr(ocr, "_run_ocr", lambda b: (lines, 400))
    result = ocr.extract_receipt(b"imgbytes")
    assert result.status == ToolStatus.SUCCESS
    assert result.data["receipt"].total_amount == 35000.0


def test_extract_receipt_full_image_failure(monkeypatch):
    def _raise(b):
        raise RuntimeError("VietOCR returned no text")

    monkeypatch.setattr(ocr, "_run_ocr", _raise)
    result = ocr.extract_receipt(b"imgbytes")
    assert result.status == ToolStatus.ERROR


def test_fallback_text_by_class():
    assert ocr._fallback_text("store_name") == "Unknown Merchant"
    assert ocr._fallback_text("quantity") == "1"
    assert ocr._fallback_text("price") == "0"
    assert ocr._fallback_text("item") == "Unnamed item"
    assert ocr._fallback_text("other") == ""


def test_grand_total_and_footer_helpers():
    assert ocr._is_grand_total_line("Tong cong 100000") is True
    assert ocr._is_footer_line("Hotline 1900") is True
    assert ocr._is_grand_total_line("Hotline 1900") is False


def test_clean_item_name_and_looks_like_item():
    assert ocr._looks_like_item_name("Com tam") is True
    assert ocr._looks_like_item_name("12345") is False
    assert ocr._clean_item_name("Com tam 35") == "Com tam"

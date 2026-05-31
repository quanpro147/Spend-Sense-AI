"""Unit tests for OCR text-parsing helpers (no VietOCR model needed)."""
from src.vision import ocr
from src.vision.ocr import _OCRLine


def _line(text: str, top: int = 0, bottom: int = 20) -> _OCRLine:
    return _OCRLine(text=text, top=top, bottom=bottom)


def test_parse_money_strips_separators():
    assert ocr._parse_money("125.000") == 125000.0
    assert ocr._parse_money("1,200,000") == 1200000.0
    assert ocr._parse_money("abc") == 0.0


def test_parse_total_reads_grand_total_line():
    lines = ["Pho bo 50.000", "Tong cong 50.000"]
    assert ocr._parse_total(lines) == 50000.0


def test_parse_total_returns_zero_without_total_line():
    assert ocr._parse_total(["Pho bo 50.000"]) == 0.0


def test_merchant_from_lines_skips_header_noise():
    lines = [_line("HOA DON THANH TOAN"), _line("Quan Pho 24"), _line("Pho bo 50000")]
    assert ocr._merchant_from_lines(lines) == "Quan Pho 24"


def test_normalize_text_removes_accents():
    assert ocr._normalize_text("Cà Phê Đá") == "ca phe da"


def test_is_total_line_detects_keywords():
    assert ocr._is_total_line("Tong tien: 100000") is True
    assert ocr._is_total_line("Ca phe sua") is False


def test_fields_and_items_from_lines_extracts_item_and_price():
    lines = [
        _line("Quan An ABC", 0, 20),
        _line("Com tam 35.000", 30, 50),
        _line("Tong cong 35.000", 60, 80),
    ]
    fields, draft_items, items = ocr._fields_and_items_from_lines(lines, image_width=400)
    assert len(items) == 1
    assert items[0].name.lower().startswith("com tam")
    assert items[0].total_price == 35000.0
    assert any(f["class_name"] == "price" for f in fields)
    assert draft_items[0]["unit_price"] == 35000.0

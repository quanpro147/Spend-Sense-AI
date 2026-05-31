"""Additional OCR helper tests (image/band/field helpers, predictor faked)."""
import numpy as np
from PIL import Image

from src.vision import ocr
from src.vision.ocr import _OCRLine


def test_find_text_bands_detects_dark_row():
    gray = np.full((40, 50), 255, dtype="uint8")
    gray[18:22, :] = 0  # a dark band
    bands = ocr._find_text_bands(gray, height=40)
    assert any(top <= 18 <= bottom for top, bottom in bands)


def test_make_field_shape():
    line = _OCRLine("Com tam", 30, 50)
    field = ocr._make_field("item", "Com tam", line, image_width=400, x_ratio=0.35, width_ratio=0.65)
    assert field["class_name"] == "item"
    assert field["text"] == "Com tam"
    assert field["width"] > 0


def test_noise_total_footer_classifiers():
    assert ocr._is_noise_or_header_line("Nhan vien: An") is True
    assert ocr._is_total_line("Tien mat 50000") is True
    assert ocr._is_footer_line("www.shop.vn") is True


def test_normalize_and_store_name():
    assert ocr._normalize_class_name("Store") == "store_name"
    assert ocr._is_store_name("merchant") is True


def test_crop_detection_within_bounds():
    img = Image.new("RGB", (200, 100), (255, 255, 255))
    detection = {"x": 100, "y": 50, "width": 40, "height": 20}
    crop = ocr._crop_detection(img, detection)
    assert crop.size[0] > 0 and crop.size[1] > 0


class _FakePredictor:
    def predict(self, image):
        return "Com tam"


def test_read_box_text_uses_predictor():
    img = Image.new("RGB", (200, 100), (255, 255, 255))
    detection = {"x": 100, "y": 50, "width": 40, "height": 20, "class_name": "item"}
    text = ocr._read_box_text(_FakePredictor(), img, detection)
    assert text == "Com tam"


def test_ocr_detected_fields_with_fake_predictor(monkeypatch):
    monkeypatch.setattr(ocr, "_vietocr_predictor", lambda: _FakePredictor())
    img_bytes = _png_bytes()
    detections = [
        {"id": "d1", "class_name": "item", "x": 60, "y": 50, "width": 80, "height": 20, "confidence": 0.9},
        {"id": "d2", "class_name": "store_name", "x": 100, "y": 5, "width": 120, "height": 20, "confidence": 0.9},
    ]
    fields = ocr._ocr_detected_fields(img_bytes, detections)
    # store_name fields are skipped
    assert all(f["class_name"] != "store_name" for f in fields)
    assert fields[0]["text"] == "Com tam"


def _png_bytes() -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    Image.new("RGB", (300, 200), (255, 255, 255)).save(buffer, format="PNG")
    return buffer.getvalue()

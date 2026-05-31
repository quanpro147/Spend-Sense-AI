"""Unit tests for the YOLO detector helpers and detect_receipt branches."""
import pytest
from PIL import Image

from src.core.tool_result import ToolStatus
from src.vision import detector


def test_detect_receipt_empty_bytes():
    result = detector.detect_receipt(b"")
    assert result.status == ToolStatus.ERROR


def test_normalize_class_name_variants():
    assert detector._normalize_class_name("Product Name") == "item"
    assert detector._normalize_class_name("store") == "store_name"
    assert detector._normalize_class_name("amount") == "price"
    assert detector._normalize_class_name("SL") == "quantity"
    assert detector._normalize_class_name("weird") == "weird"


def test_class_counts_and_scores():
    detections = [{"class_name": "item"}, {"class_name": "item"}, {"class_name": "price"}]
    counts = detector._class_counts(detections)
    assert counts == {"item": 2, "price": 1}
    assert detector._detection_score(detections) > 0
    assert detector._is_good_enough_candidate(detections) is False


def test_is_good_enough_candidate_true():
    detections = [
        {"class_name": "item"}, {"class_name": "item"},
        {"class_name": "price"}, {"class_name": "price"},
    ]
    assert detector._is_good_enough_candidate(detections) is True


def test_image_to_bytes_roundtrip():
    img = Image.new("RGB", (10, 10), (255, 255, 255))
    data = detector._image_to_bytes(img)
    assert isinstance(data, bytes) and len(data) > 0


def test_detect_receipt_success(monkeypatch):
    detections = [{"class_name": "item", "id": "1"}, {"class_name": "price", "id": "2"}]
    monkeypatch.setattr(
        detector, "_run_model",
        lambda b: (detections, b"cropped", {"confidence": 0.5, "cropped": True}),
    )
    result = detector.detect_receipt(b"imgbytes")
    assert result.status == ToolStatus.SUCCESS
    assert result.data["detections"] == detections


def test_detect_receipt_not_configured(monkeypatch):
    def _raise(b):
        raise NotImplementedError

    monkeypatch.setattr(detector, "_run_model", _raise)
    result = detector.detect_receipt(b"x")
    assert result.status == ToolStatus.ERROR
    assert "not configured" in result.summary


def test_detect_receipt_inference_error(monkeypatch):
    def _raise(b):
        raise RuntimeError("boom")

    monkeypatch.setattr(detector, "_run_model", _raise)
    result = detector.detect_receipt(b"x")
    assert result.status == ToolStatus.ERROR


def test_detect_receipt_no_detections(monkeypatch):
    monkeypatch.setattr(detector, "_run_model", lambda b: ([], b"cropped", {"confidence": 0.1}))
    result = detector.detect_receipt(b"x")
    assert result.status == ToolStatus.ERROR
    assert "no receipt fields" in result.summary


def test_resolve_model_path_unconfigured(tmp_path):
    with pytest.raises(NotImplementedError):
        detector._resolve_model_path(str(tmp_path / "missing.pt"), "", "", "", "")

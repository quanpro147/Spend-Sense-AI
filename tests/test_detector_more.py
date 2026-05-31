"""Additional detector tests for prediction/cropping helpers (model faked)."""
from PIL import Image

from src.vision import detector
from src.vision.detector import _ImageCandidate


class _Scalar:
    def __init__(self, v):
        self._v = v

    def item(self):
        return self._v


class _Arr:
    def __init__(self, v):
        self._v = v

    def tolist(self):
        return self._v


class _Box:
    def __init__(self, xyxy, cls, conf):
        self.xyxy = [_Arr(xyxy)]
        self.cls = [_Scalar(cls)]
        self.conf = [_Scalar(conf)]


class _Result:
    def __init__(self, boxes, names):
        self.boxes = boxes
        self.names = names


class _FakeModel:
    def predict(self, image, conf, imgsz, verbose):
        boxes = [
            _Box([10, 10, 50, 30], 0, 0.9),
            _Box([200, 10, 260, 30], 1, 0.8),
        ]
        return [_Result(boxes, {0: "item", 1: "price"})]


def test_predict_fields_parses_boxes():
    img = Image.new("RGB", (300, 100), (255, 255, 255))
    detections = detector._predict_fields(_FakeModel(), img, 0.3)
    assert len(detections) == 2
    classes = {d["class_name"] for d in detections}
    assert classes == {"item", "price"}


def test_best_prediction_picks_candidate():
    img = Image.new("RGB", (300, 100), (255, 255, 255))
    candidates = [_ImageCandidate("full", img)]
    detections, image, name = detector._best_prediction(_FakeModel(), candidates, 0.3)
    assert name == "full"
    assert len(detections) == 2


def test_candidate_images_returns_full_when_no_crop():
    img = Image.new("RGB", (300, 100), (255, 255, 255))
    candidates = detector._candidate_images(img)
    assert any(c.name == "full" for c in candidates)


def test_crop_likely_receipt_region_returns_image():
    img = Image.new("RGB", (300, 100), (255, 255, 255))
    out = detector._crop_likely_receipt_region(img)
    assert out.size == img.size  # no bright receipt blob → unchanged

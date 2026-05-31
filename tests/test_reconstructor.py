"""Unit tests for the YOLO-field → receipt reconstructor."""
from src.vision.reconstructor import (
    _parse_money,
    _parse_quantity,
    _quantity_from_field,
    reconstruct_receipt,
)


def _field(class_name, text, x, y, fid, width=60, height=20):  # noqa: ANN001
    return {
        "id": fid,
        "class_name": class_name,
        "text": text,
        "confidence": 0.9,
        "x": float(x),
        "y": float(y),
        "width": float(width),
        "height": float(height),
    }


def test_parse_money_and_quantity_helpers():
    assert _parse_money("35.000") == 35000.0
    assert _parse_quantity("2") == 2.0
    assert _quantity_from_field(None) == 1.0
    assert _quantity_from_field({"text": "3"}) == 3.0


def test_reconstruct_pairs_item_with_price_on_same_row():
    fields = [
        _field("store_name", "Quan ABC", 100, 5, "s1"),
        _field("item", "Com tam", 60, 50, "i1"),
        _field("price", "35.000", 320, 50, "p1"),
    ]
    receipt, drafts = reconstruct_receipt(fields)
    assert receipt.merchant == "Quan ABC"
    assert len(receipt.items) == 1
    assert receipt.items[0].name == "Com tam"
    assert receipt.items[0].unit_price == 35000.0
    assert drafts[0]["source_token_ids"]["name"] == "i1"


def test_reconstruct_without_items_yields_placeholder():
    receipt, _ = reconstruct_receipt([])
    assert len(receipt.items) == 1
    assert receipt.items[0].name == "Unassigned receipt item"

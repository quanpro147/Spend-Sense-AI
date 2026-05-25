from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Any

from src.models.expense import Receipt, ReceiptItem


def reconstruct_receipt(fields: list[dict[str, Any]]) -> tuple[Receipt, list[dict[str, Any]]]:
    """
    Build a receipt draft from OCR fields detected by YOLO.

    The model detects semantic boxes, but receipt layouts vary. The safest
    automatic pass uses item-name boxes as anchors and attaches the nearest
    price box as the line amount. Many Vietnamese receipts print quantity and
    final line amount, not unit price, so quantity is kept as 1 for saving.
    """
    merchant = _merchant_from_fields(fields)
    item_fields = sorted(_by_class(fields, "item"), key=_field_position_key)
    quantity_fields = sorted(_by_class(fields, "quantity"), key=_field_position_key)
    price_fields = sorted(_by_class(fields, "price"), key=_field_position_key)

    used_quantities: set[str] = set()
    used_prices: set[str] = set()
    row_entries: list[tuple[float, ReceiptItem, dict[str, Any]]] = []

    for index, item_field in enumerate(item_fields):
        next_item_y = item_fields[index + 1]["y"] if index + 1 < len(item_fields) else None
        quantity = _best_match(item_field, quantity_fields, used_quantities, next_item_y)
        price = _best_match(item_field, price_fields, used_prices, next_item_y)

        if quantity:
            used_quantities.add(quantity["id"])
        if price:
            used_prices.add(price["id"])

        name = item_field.get("text") or "Unnamed item"
        line_amount = _parse_money(price.get("text", "") if price else "") or 0.0

        receipt_item = ReceiptItem(
            name=name,
            quantity=1.0,
            unit_price=line_amount,
            total_price=line_amount,
        )
        draft_item = (
            {
                "id": str(uuid.uuid4()),
                "name": name,
                "quantity": 1.0,
                "unit_price": line_amount,
                "total_price": line_amount,
                "category": "khac",
                "source_token_ids": {
                    "name": item_field["id"],
                    "unit_price": price["id"] if price else None,
                },
            }
        )
        row_entries.append((float(item_field["y"]), receipt_item, draft_item))

    orphan_rows = _orphan_value_rows(quantity_fields, price_fields, used_quantities, used_prices)
    for row in orphan_rows:
        line_amount = _parse_money(row["price"].get("text", "") if row.get("price") else "") or 0.0
        name = "Món chưa nhận diện"
        sort_y = _row_sort_y(row)
        receipt_item = ReceiptItem(
            name=name,
            quantity=1.0,
            unit_price=line_amount,
            total_price=line_amount,
        )
        draft_item = (
            {
                "id": str(uuid.uuid4()),
                "name": name,
                "quantity": 1.0,
                "unit_price": line_amount,
                "total_price": line_amount,
                "category": "khac",
                "source_token_ids": {
                    "name": None,
                    "unit_price": row["price"]["id"] if row.get("price") else None,
                },
            }
        )
        row_entries.append((sort_y, receipt_item, draft_item))

    row_entries = sorted(row_entries, key=lambda entry: entry[0])
    receipt_items = [entry[1] for entry in row_entries]
    draft_items = [entry[2] for entry in row_entries]
    if not receipt_items:
        receipt_items = [ReceiptItem(name="Unassigned receipt item", quantity=1, unit_price=0, total_price=0)]

    total_amount = sum(item.total_price for item in receipt_items)
    raw_text = "\n".join(field.get("text", "") for field in fields if field.get("text"))
    receipt = Receipt(
        merchant=merchant,
        purchase_date=date.today(),
        items=receipt_items,
        total_amount=total_amount,
        raw_text=raw_text,
    )
    return receipt, draft_items


def _by_class(fields: list[dict[str, Any]], class_name: str) -> list[dict[str, Any]]:
    return [field for field in fields if field.get("class_name", "").lower() == class_name.lower()]


def _field_position_key(field: dict[str, Any]) -> tuple[float, float]:
    return (float(field.get("y", 0)), float(field.get("x", 0)))


def _row_sort_y(row: dict[str, dict[str, Any] | None]) -> float:
    anchor = row.get("quantity") or row.get("price")
    return float(anchor.get("y", 0)) if anchor else 0.0


def _merchant_from_fields(fields: list[dict[str, Any]]) -> str:
    store_fields = sorted(
        _by_class(fields, "store_name"),
        key=lambda f: (-float(f.get("confidence", 0)), float(f.get("y", 0))),
    )
    if store_fields and store_fields[0].get("text"):
        return str(store_fields[0]["text"])
    return "Unknown Merchant"


def _best_match(
    item: dict[str, Any],
    candidates: list[dict[str, Any]],
    used: set[str],
    next_item_y: float | None,
) -> dict[str, Any] | None:
    valid: list[tuple[float, dict[str, Any]]] = []
    item_y = float(item["y"])
    item_height = float(item.get("height", 24))
    threshold = max(item_height * 1.7, 34)
    same_line_tolerance = max(6.0, item_height * 0.35)
    # Receipt layouts in this dataset put quantity/price on the same row as
    # the item name or below it. Do not attach values that are visibly above
    # the item name; they usually belong to the previous row.
    lower_bound = item_y - same_line_tolerance
    upper_bound = (next_item_y - max(6, item_height * 0.25)) if next_item_y else item_y + threshold * 2.4

    for candidate in candidates:
        if candidate["id"] in used:
            continue
        candidate_y = float(candidate["y"])
        same_band = lower_bound <= candidate_y <= upper_bound
        if not same_band:
            continue

        y_distance = abs(candidate_y - item_y)
        x_penalty = 0 if float(candidate.get("x", 0)) > float(item.get("x", 0)) else 25
        valid.append((y_distance + x_penalty, candidate))

    if not valid:
        return None
    return min(valid, key=lambda pair: pair[0])[1]


def _orphan_value_rows(
    quantity_fields: list[dict[str, Any]],
    price_fields: list[dict[str, Any]],
    used_quantities: set[str],
    used_prices: set[str],
) -> list[dict[str, dict[str, Any] | None]]:
    """
    Recover approximate rows when YOLO misses an item-name box.

    Quantity and price are still useful signals. Pair each unused quantity with
    the nearest unused price at the same y or below the quantity, then let the
    frontend user drag an item-name token in or edit the row inline.
    """
    unused_quantities = [q for q in quantity_fields if q["id"] not in used_quantities]
    unused_prices = [p for p in price_fields if p["id"] not in used_prices]
    paired_price_ids: set[str] = set()
    rows: list[dict[str, dict[str, Any] | None]] = []

    for quantity in unused_quantities:
        quantity_y = float(quantity["y"])
        tolerance = max(10.0, float(quantity.get("height", 20)) * 1.4)
        candidates = [
            price for price in unused_prices
            if price["id"] not in paired_price_ids
            and quantity_y - tolerance <= float(price["y"]) <= quantity_y + tolerance
        ]
        price = min(candidates, key=lambda p: abs(float(p["y"]) - quantity_y)) if candidates else None
        if price:
            paired_price_ids.add(price["id"])
        rows.append({"quantity": quantity, "price": price})

    for price in unused_prices:
        if price["id"] not in paired_price_ids:
            rows.append({"quantity": None, "price": price})

    return sorted(rows, key=lambda row: float((row.get("quantity") or row.get("price") or {"y": 0})["y"]))


def _parse_money(text: str) -> float:
    cleaned = re.sub(r"[^\d]", "", text)
    return float(cleaned) if cleaned else 0.0


def _parse_quantity(text: str) -> float:
    cleaned = re.sub(r"[^0-9,.]", "", text).replace(",", ".")
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0

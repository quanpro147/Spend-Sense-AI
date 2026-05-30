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
    automatic pass uses item-name boxes as anchors and attaches nearby quantity
    and price boxes on the same receipt row. Quantity may appear before or
    after the item text; prices are usually to the right.
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
        quantity = _best_match(item_field, quantity_fields, used_quantities, next_item_y, allow_left=True)
        quantity_value = _quantity_from_field(quantity)
        price, line_total = _best_price_matches(item_field, price_fields, used_prices, next_item_y)
        discount = _best_match(item_field, price_fields, used_prices, next_item_y, want_discount=True)

        if quantity:
            used_quantities.add(quantity["id"])
        if price:
            used_prices.add(price["id"])
        if line_total:
            used_prices.add(line_total["id"])
        if discount:
            used_prices.add(discount["id"])

        name = item_field.get("text") or "Unnamed item"
        unit_price = _parse_money(price.get("text", "") if price else "") or 0.0
        gross_total = _parse_money(line_total.get("text", "") if line_total else "") or (quantity_value * unit_price)
        discount_amount = _parse_money(discount.get("text", "") if discount else "") or 0.0
        total_amount = max(gross_total - discount_amount, 0.0)

        receipt_item = ReceiptItem(
            name=name,
            quantity=quantity_value,
            unit_price=unit_price,
            discount=discount_amount,
            total_price=total_amount,
        )
        draft_item = (
            {
                "id": str(uuid.uuid4()),
                "name": name,
                "quantity": quantity_value,
                "unit_price": unit_price,
                "discount": discount_amount,
                "total_price": total_amount,
                "category": "khac",
                "source_token_ids": {
                    "name": item_field["id"],
                    "quantity": quantity["id"] if quantity else None,
                    "unit_price": price["id"] if price else None,
                    "discount": discount["id"] if discount else None,
                },
            }
        )
        row_entries.append((float(item_field["y"]), receipt_item, draft_item))

    orphan_rows = _orphan_value_rows(quantity_fields, price_fields, used_quantities, used_prices)
    for row in orphan_rows:
        quantity_value = _quantity_from_field(row.get("quantity"))
        unit_price = _parse_money(row["price"].get("text", "") if row.get("price") else "") or 0.0
        total_amount = quantity_value * unit_price
        name = "Món chưa nhận diện"
        sort_y = _row_sort_y(row)
        receipt_item = ReceiptItem(
            name=name,
            quantity=quantity_value,
            unit_price=unit_price,
            discount=0.0,
            total_price=total_amount,
        )
        draft_item = (
            {
                "id": str(uuid.uuid4()),
                "name": name,
                "quantity": quantity_value,
                "unit_price": unit_price,
                "discount": 0.0,
                "total_price": total_amount,
                "category": "khac",
                "source_token_ids": {
                    "name": None,
                    "quantity": row["quantity"]["id"] if row.get("quantity") else None,
                    "unit_price": row["price"]["id"] if row.get("price") else None,
                    "discount": None,
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
    normalized = _normalize_class_name(class_name)
    return [field for field in fields if _normalize_class_name(str(field.get("class_name", ""))) == normalized]


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
    *,
    want_discount: bool | None = None,
    allow_left: bool = False,
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
        if want_discount is not None and _is_discount_field(candidate) != want_discount:
            continue
        candidate_y = float(candidate["y"])
        same_band = lower_bound <= candidate_y <= upper_bound
        if not same_band:
            continue

        y_distance = abs(candidate_y - item_y)
        x_penalty = 0 if allow_left or float(candidate.get("x", 0)) > float(item.get("x", 0)) else 25
        discount_penalty = 0 if want_discount and candidate_y >= item_y else 12
        valid.append((y_distance + x_penalty + discount_penalty, candidate))

    if not valid:
        return None
    return min(valid, key=lambda pair: pair[0])[1]


def _best_price_matches(
    item: dict[str, Any],
    price_fields: list[dict[str, Any]],
    used: set[str],
    next_item_y: float | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    row_prices = [
        price
        for price in price_fields
        if price["id"] not in used
        and not _is_discount_field(price)
        and _is_same_item_band(item, price, next_item_y)
        and float(price.get("x", 0)) > float(item.get("x", 0))
    ]
    if not row_prices:
        return None, None

    row_prices = sorted(row_prices, key=lambda field: (float(field.get("x", 0)), float(field.get("y", 0))))
    unit_price = row_prices[0]
    line_total = row_prices[-1] if row_prices[-1]["id"] != unit_price["id"] else None
    return unit_price, line_total


def _is_same_item_band(item: dict[str, Any], candidate: dict[str, Any], next_item_y: float | None) -> bool:
    item_y = float(item["y"])
    item_height = float(item.get("height", 24))
    threshold = max(item_height * 1.7, 34)
    same_line_tolerance = max(6.0, item_height * 0.35)
    lower_bound = item_y - same_line_tolerance
    upper_bound = (next_item_y - max(6, item_height * 0.25)) if next_item_y else item_y + threshold * 2.4
    candidate_y = float(candidate["y"])
    return lower_bound <= candidate_y <= upper_bound


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
    unused_prices = [p for p in price_fields if p["id"] not in used_prices and not _is_discount_field(p)]
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


def _is_discount_field(field: dict[str, Any]) -> bool:
    return _parse_signed_money(str(field.get("text", ""))) < 0


def _parse_signed_money(text: str) -> float:
    sign = -1.0 if re.search(r"(^|[\s(:])[-−–]\s*\d", text) else 1.0
    return sign * _parse_money(text)


def _parse_quantity(text: str) -> float:
    cleaned = re.sub(r"[^0-9,.]", "", text).replace(",", ".")
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def _quantity_from_field(field: dict[str, Any] | None) -> float:
    if not field:
        return 1.0
    quantity = _parse_quantity(str(field.get("text", "")))
    return quantity if quantity > 0 else 1.0


def _normalize_class_name(class_name: str) -> str:
    normalized = class_name.strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in {"item", "items", "name", "product", "product_name"}:
        return "item"
    if normalized in {"store_name", "store", "merchant"}:
        return "store_name"
    if normalized in {"price", "amount", "total", "line_total"}:
        return "price"
    if normalized in {"quantity", "qty", "sl", "so_luong"}:
        return "quantity"
    return normalized

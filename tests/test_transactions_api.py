"""Integration tests for /transactions."""


def test_transactions_require_auth(client):
    assert client.get("/transactions").status_code in (401, 403)


def test_create_and_list_transaction(client, auth):
    payload = {
        "type": "expense",
        "amount": 125000,
        "currency": "VND",
        "category": "an-uong",
        "description": "Com trua",
        "merchant": "Quan ABC",
        "transaction_date": "2026-05-08",
    }
    created = client.post("/transactions", json=payload, headers=auth["headers"])
    assert created.status_code == 201
    assert created.json()["amount"] == 125000

    listed = client.get("/transactions", headers=auth["headers"])
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] == 1
    assert body["items"][0]["category"] == "an-uong"


def test_create_transaction_with_receipt_items(client, auth):
    payload = {
        "type": "expense",
        "amount": 50000,
        "category": "an-uong",
        "merchant": "Pho 24",
        "transaction_date": "2026-05-09",
        "receipt_items": [
            {"name": "Pho bo", "quantity": 1, "unit_price": 50000, "category": "an-uong"}
        ],
    }
    resp = client.post("/transactions", json=payload, headers=auth["headers"])
    assert resp.status_code == 201
    assert resp.json()["receipt_id"] is not None

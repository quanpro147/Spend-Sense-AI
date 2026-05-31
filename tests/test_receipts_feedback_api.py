"""Integration tests for /receipts/analyze and /feedback (services mocked)."""
from datetime import date

from src.core.tool_result import ToolResult
from src.models.expense import Insight, InsightSource, Receipt, ReceiptItem
from src.pipeline import PipelineError


def _details():
    receipt = Receipt(
        merchant="Quan ABC",
        purchase_date=date(2026, 5, 8),
        items=[ReceiptItem(name="Com tam", quantity=1, unit_price=35000, total_price=35000)],
        total_amount=35000,
        raw_text="Com tam 35000",
    )
    insight = Insight(
        receipt_id=receipt.id, summary="ok", category="an-uong", tips=["t"],
        source=InsightSource.LLM, vector_id="vec-1",
    )
    draft_items = [{
        "id": "1", "name": "Com tam", "quantity": 1, "unit_price": 35000,
        "discount": 0.0, "total_price": 35000, "category": "an-uong", "source_token_ids": {},
    }]
    return {"receipt": receipt, "insight": insight, "draft_items": draft_items, "fields": []}


def test_analyze_rejects_non_image(client):
    resp = client.post("/receipts/analyze", files={"file": ("x.txt", b"hello", "text/plain")})
    assert resp.status_code == 415


def test_analyze_rejects_empty_file(client, monkeypatch):
    resp = client.post("/receipts/analyze", files={"file": ("x.jpg", b"", "image/jpeg")})
    assert resp.status_code == 400


def test_analyze_success(client, monkeypatch):
    monkeypatch.setattr("src.api.routes.receipts.analyze_receipt_details", lambda b: _details())
    resp = client.post("/receipts/analyze", files={"file": ("r.jpg", b"imgbytes", "image/jpeg")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["insight"]["category"] == "an-uong"
    assert body["suggested_transaction"]["amount"] == 35000


def test_analyze_pipeline_error(client, monkeypatch):
    def _raise(b):
        raise PipelineError("detect", ToolResult.error("no model", error_hint="configure"))

    monkeypatch.setattr("src.api.routes.receipts.analyze_receipt_details", _raise)
    resp = client.post("/receipts/analyze", files={"file": ("r.jpg", b"imgbytes", "image/jpeg")})
    assert resp.status_code == 422


def test_feedback_confirm(client, auth):
    resp = client.post("/feedback/some-id", json={"action": "confirm", "vector_id": "v1"}, headers=auth["headers"])
    assert resp.status_code == 200
    assert "confirmed" in resp.json()["message"].lower()


def test_feedback_reject(client, auth, monkeypatch):
    monkeypatch.setattr("src.api.routes.feedback.cache_delete", lambda vid: ToolResult.success("deleted"))
    resp = client.post("/feedback/some-id", json={"action": "reject", "vector_id": "v1"}, headers=auth["headers"])
    assert resp.status_code == 200

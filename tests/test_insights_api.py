"""Integration tests for /insights (semantic cache layer mocked)."""
import uuid

from src.core.tool_result import ToolResult
from src.models.expense import Insight, InsightSource


def _make_insight() -> Insight:
    return Insight(
        id=uuid.uuid4(),
        receipt_id=uuid.uuid4(),
        summary="Chi tiêu ăn uống ổn định",
        category="an-uong",
        tips=["Nấu ăn tại nhà"],
        source=InsightSource.LLM,
    )


def test_insights_require_auth(client):
    assert client.get("/insights").status_code in (401, 403)


def test_list_insights(client, auth, monkeypatch):
    insight = _make_insight()
    monkeypatch.setattr(
        "src.api.routes.insights.list_insights",
        lambda **kwargs: ToolResult.success("ok", data=[insight]),
    )
    resp = client.get("/insights", headers=auth["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["category"] == "an-uong"


def test_get_insight_not_found(client, auth, monkeypatch):
    monkeypatch.setattr(
        "src.api.routes.insights.get_insight",
        lambda **kwargs: ToolResult.success("ok", data=None),
    )
    resp = client.get(f"/insights/{uuid.uuid4()}", headers=auth["headers"])
    assert resp.status_code == 404

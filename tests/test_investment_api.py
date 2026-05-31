"""Integration tests for /investment (market data + stress tester mocked)."""
import pytest


@pytest.fixture(autouse=True)
def _mock_market(monkeypatch):
    monkeypatch.setattr(
        "src.api.routes.investment.get_market_prices",
        lambda symbols: {s: 120000.0 for s in symbols},
    )


def test_get_profile_creates_default(client, auth):
    resp = client.get("/investment/profile", headers=auth["headers"])
    assert resp.status_code == 200
    assert resp.json()["risk_appetite"] == "moderate"


def test_update_profile(client, auth):
    resp = client.post(
        "/investment/profile",
        json={"risk_appetite": "aggressive", "capital": 50000000, "goal": "Mua nhà"},
        headers=auth["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["risk_appetite"] == "aggressive"
    assert resp.json()["capital"] == 50000000


def test_portfolio_add_get_delete(client, auth):
    assert client.get("/investment/portfolio", headers=auth["headers"]).json() == []

    add = client.post(
        "/investment/portfolio",
        json={"symbol": "fpt", "name": "FPT", "type": "stock", "quantity": 100, "purchase_price": 100000},
        headers=auth["headers"],
    )
    assert add.status_code == 200
    asset = add.json()
    assert asset["symbol"] == "FPT"
    assert asset["current_price"] == 120000.0
    assert asset["value"] == 100 * 120000.0

    listed = client.get("/investment/portfolio", headers=auth["headers"]).json()
    assert len(listed) == 1

    deleted = client.delete(f"/investment/portfolio/{asset['id']}", headers=auth["headers"])
    assert deleted.status_code == 204


def test_delete_missing_asset_404(client, auth):
    import uuid

    resp = client.delete(f"/investment/portfolio/{uuid.uuid4()}", headers=auth["headers"])
    assert resp.status_code == 404


def test_stress_test(client, auth, monkeypatch):
    def _fake_stress(profile, assets, prices):
        return {
            "portfolio_value": 1000.0,
            "total_capital": 2000.0,
            "idle_cash": 1000.0,
            "vulnerability_score": 10.0,
            "diversification_score": 50.0,
            "worst_scenario": "Suy thoái",
            "worst_loss_percent": 12.0,
            "scenarios": [],
            "assets": [],
            "overall_analysis": "An toàn",
            "hedging_strategies": [],
        }

    monkeypatch.setattr("src.api.routes.investment.run_portfolio_stress_test", _fake_stress)
    resp = client.get("/investment/stress-test", headers=auth["headers"])
    assert resp.status_code == 200
    assert resp.json()["overall_analysis"] == "An toàn"

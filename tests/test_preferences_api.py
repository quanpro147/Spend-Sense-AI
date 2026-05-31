"""Integration tests for /preferences."""


def test_preferences_require_auth(client):
    assert client.get("/preferences").status_code in (401, 403)


def test_get_preferences_creates_defaults(client, auth):
    resp = client.get("/preferences", headers=auth["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["weekly_report"] is True
    assert body["rebalance_suggestions"] is False


def test_update_preferences_partial(client, auth):
    client.get("/preferences", headers=auth["headers"])  # ensure created
    resp = client.put(
        "/preferences", json={"rebalance_suggestions": True}, headers=auth["headers"]
    )
    assert resp.status_code == 200
    assert resp.json()["rebalance_suggestions"] is True
    # other flags unchanged
    assert resp.json()["weekly_report"] is True

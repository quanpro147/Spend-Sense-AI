"""Integration tests for /goals CRUD (auth-scoped)."""


def test_goals_require_auth(client):
    assert client.get("/goals").status_code in (401, 403)


def test_create_and_list_goal(client, auth):
    payload = {"title": "Quỹ khẩn cấp", "target_amount": 100, "current_amount": 80, "emoji": "🛡️"}
    created = client.post("/goals", json=payload, headers=auth["headers"])
    assert created.status_code == 201
    body = created.json()
    assert body["status"] == "on-track"  # 80% progress
    assert body["progress_percent"] == 80.0

    listed = client.get("/goals", headers=auth["headers"])
    assert listed.status_code == 200
    assert listed.json()["total"] == 1


def test_create_goal_at_risk_status(client, auth):
    resp = client.post(
        "/goals",
        json={"title": "Du lịch", "target_amount": 100, "current_amount": 10},
        headers=auth["headers"],
    )
    assert resp.json()["status"] == "at-risk"


def test_update_goal(client, auth):
    created = client.post(
        "/goals", json={"title": "Xe", "target_amount": 100, "current_amount": 0}, headers=auth["headers"]
    ).json()
    resp = client.patch(
        f"/goals/{created['id']}", json={"current_amount": 100}, headers=auth["headers"]
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "achieved"


def test_delete_goal(client, auth):
    created = client.post(
        "/goals", json={"title": "Tạm", "target_amount": 50}, headers=auth["headers"]
    ).json()
    resp = client.delete(f"/goals/{created['id']}", headers=auth["headers"])
    assert resp.status_code == 204
    assert client.get("/goals", headers=auth["headers"]).json()["total"] == 0


def test_update_missing_goal_returns_404(client, auth):
    import uuid

    resp = client.patch(f"/goals/{uuid.uuid4()}", json={"title": "x"}, headers=auth["headers"])
    assert resp.status_code == 404

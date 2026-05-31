"""Integration tests for the auth endpoints (SQLite-backed)."""
import pytest


@pytest.fixture(autouse=True)
def _skip_ensure_database(monkeypatch):
    async def _noop():
        return None

    monkeypatch.setattr("src.api.routes.auth.ensure_database", _noop)


def test_register_returns_token(client):
    resp = client.post("/auth/register", json={"email": "a@b.com", "password": "secret123"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["access_token"]
    assert body["user"]["email"] == "a@b.com"


def test_register_duplicate_conflicts(client):
    client.post("/auth/register", json={"email": "dup@b.com", "password": "secret123"})
    resp = client.post("/auth/register", json={"email": "dup@b.com", "password": "secret123"})
    assert resp.status_code == 409


def test_login_with_wrong_password_rejected(client):
    client.post("/auth/register", json={"email": "c@b.com", "password": "secret123"})
    resp = client.post("/auth/login", json={"email": "c@b.com", "password": "wrongpass"})
    assert resp.status_code == 401


def test_login_success_returns_token(client):
    client.post("/auth/register", json={"email": "d@b.com", "password": "secret123"})
    resp = client.post("/auth/login", json={"email": "d@b.com", "password": "secret123"})
    assert resp.status_code == 200
    assert resp.json()["access_token"]


def test_me_requires_auth(client):
    assert client.get("/auth/me").status_code in (401, 403)

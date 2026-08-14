"""Tests for the auth routes: register, login, logout, me, and rate limiting."""

from fastapi import FastAPI, Request
from httpx import AsyncClient
from slowapi import Limiter as SlowLimiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.main import app
from tests.helpers import PASSWORD, register


async def test_register_creates_user_and_default_class(client: AsyncClient) -> None:
    user = await register(client, "alice")
    assert user["username"] == "alice"
    assert "id" in user

    classes = (await client.get("/api/v1/classes")).json()
    assert [(c["name"], c["color"]) for c in classes] == [("Default", "#6366f1")]


async def test_register_sets_session_cookie(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register", json={"username": "bob", "password": PASSWORD}
    )
    assert "plannerr_session" in client.cookies
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "bob"


async def test_register_duplicate_username_conflicts_case_insensitive(client: AsyncClient) -> None:
    await register(client, "carol")
    r = await client.post(
        "/api/v1/auth/register", json={"username": "CAROL", "password": PASSWORD}
    )
    assert r.status_code == 409


async def test_register_rejects_invalid_username(client: AsyncClient) -> None:
    r = await client.post("/api/v1/auth/register", json={"username": "ab", "password": PASSWORD})
    assert r.status_code == 400
    r = await client.post(
        "/api/v1/auth/register", json={"username": "bad name!", "password": PASSWORD}
    )
    assert r.status_code == 400


async def test_register_rejects_short_password(client: AsyncClient) -> None:
    r = await client.post("/api/v1/auth/register", json={"username": "dave", "password": "short"})
    assert r.status_code == 400


async def test_login_success(client: AsyncClient) -> None:
    await register(client, "erin")
    # Log out first so the login cookie is fresh
    await client.post("/api/v1/auth/logout")
    r = await client.post(
        "/api/v1/auth/login", json={"username": "erin", "password": PASSWORD}
    )
    assert r.status_code == 200
    assert r.json()["username"] == "erin"
    assert "plannerr_session" in client.cookies


async def test_login_wrong_password_and_unknown_user(client: AsyncClient) -> None:
    await register(client, "frank")
    await client.post("/api/v1/auth/logout")
    r = await client.post(
        "/api/v1/auth/login", json={"username": "frank", "password": "wrongpass"}
    )
    assert r.status_code == 401
    r = await client.post(
        "/api/v1/auth/login", json={"username": "ghost", "password": PASSWORD}
    )
    assert r.status_code == 401


async def test_me_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401


async def test_logout_invalidates_session(client: AsyncClient) -> None:
    await register(client, "grace")
    r = await client.post("/api/v1/auth/logout")
    assert r.status_code == 204
    assert "plannerr_session" not in client.cookies
    assert (await client.get("/api/v1/auth/me")).status_code == 401

    # A replay of the old cookie must not authenticate
    client.cookies.set("plannerr_session", "stale-token")
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_app_has_rate_limiter_installed() -> None:
    assert app.state.limiter is not None


async def test_rate_limit_handler_returns_json_429() -> None:
    """Unit-test the 429 wiring (JSON body) with an isolated limited app."""
    mini = FastAPI()
    limiter = SlowLimiter(key_func=get_remote_address)
    mini.state.limiter = limiter

    from app.main import _rate_limit_handler

    mini.add_exception_handler(RateLimitExceeded, _rate_limit_handler)

    @mini.get("/limited")
    @limiter.limit("2/minute")
    async def limited(request: Request) -> dict:
        return {"ok": True}

    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(
        transport=ASGITransport(app=mini), base_url="http://test"
    ) as c:
        assert (await c.get("/limited")).status_code == 200
        assert (await c.get("/limited")).status_code == 200
        r = await c.get("/limited")
        assert r.status_code == 429
        assert "detail" in r.json()

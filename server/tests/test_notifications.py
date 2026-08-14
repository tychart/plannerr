"""Tests for notification routes: VAPID key, subscribe/unsubscribe, test send,
plus the summary service (fallback + LLM path)."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import quote

import httpx
from httpx import AsyncClient
from pywebpush import WebPushException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.services import summary
from tests.conftest import TEST_DATABASE_URL
from tests.helpers import register

ENDPOINT = "https://push.example.com/device-1"
KEYS = {"p256dh": "p256dh-key", "auth": "auth-key"}


def _subscribe_payload(endpoint: str = ENDPOINT) -> dict:
    return {"endpoint": endpoint, "keys": KEYS}


async def _subscription_count() -> int:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.connect() as conn:
        r = await conn.execute(text("SELECT count(*) FROM push_subscriptions"))
        count = r.scalar()
    await engine.dispose()
    return count


async def test_vapid_public_key_is_public(client: AsyncClient) -> None:
    r = await client.get("/api/v1/notifications/vapid-public-key")
    assert r.status_code == 200
    assert r.json() == {"public_key": "test-vapid-public"}


async def test_subscribe_requires_auth(client: AsyncClient) -> None:
    r = await client.post("/api/v1/notifications/subscribe", json=_subscribe_payload())
    assert r.status_code == 401


async def test_subscribe_upserts_same_endpoint(client: AsyncClient) -> None:
    await register(client)
    r1 = await client.post("/api/v1/notifications/subscribe", json=_subscribe_payload())
    assert r1.status_code == 201
    r2 = await client.post(
        "/api/v1/notifications/subscribe",
        json=_subscribe_payload() | {"keys": {"p256dh": "new-key", "auth": "auth-key"}},
    )
    assert r2.status_code == 201
    assert await _subscription_count() == 1


async def test_subscribe_isolates_users(client: AsyncClient) -> None:
    await register(client, "alice")
    await client.post("/api/v1/notifications/subscribe", json=_subscribe_payload())
    # Second user on the same endpoint is a separate subscription; the cookie
    # is simply replaced by bob's session on register.
    await register(client, "bob")
    await client.post("/api/v1/notifications/subscribe", json=_subscribe_payload())
    assert await _subscription_count() == 2


async def test_unsubscribe_removes_and_is_idempotent(client: AsyncClient) -> None:
    await register(client)
    await client.post("/api/v1/notifications/subscribe", json=_subscribe_payload())
    url = f"/api/v1/notifications/subscribe?endpoint={quote(ENDPOINT, safe='')}"
    r = await client.delete(url)
    assert r.status_code == 204
    assert await _subscription_count() == 0
    r2 = await client.delete(url)
    assert r2.status_code == 204


async def test_test_without_subscriptions_conflicts(client: AsyncClient) -> None:
    await register(client)
    r = await client.post("/api/v1/notifications/test", json={"timezone": "UTC"})
    assert r.status_code == 409
    assert "No devices" in r.json()["detail"]


async def test_test_requires_auth(client: AsyncClient) -> None:
    r = await client.post("/api/v1/notifications/test", json={"timezone": "UTC"})
    assert r.status_code == 401


async def test_test_sends_fallback_summary_to_devices(
    client: AsyncClient, monkeypatch
) -> None:
    await register(client)
    await client.post("/api/v1/notifications/subscribe", json=_subscribe_payload())

    sent = []

    def fake_webpush(**kwargs) -> None:
        sent.append(kwargs)

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    r = await client.post("/api/v1/notifications/test", json={"timezone": "UTC"})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "fallback"
    assert body["device_count"] == 1
    assert body["summary"]
    assert len(sent) == 1
    assert sent[0]["vapid_private_key"] == "test-vapid-private"


async def test_test_prunes_dead_subscription(client: AsyncClient, monkeypatch) -> None:
    await register(client)
    await client.post("/api/v1/notifications/subscribe", json=_subscribe_payload())

    def fake_webpush(**kwargs) -> None:
        raise WebPushException("gone", response=httpx.Response(410))

    monkeypatch.setattr("pywebpush.webpush", fake_webpush)

    r = await client.post("/api/v1/notifications/test", json={"timezone": "UTC"})
    assert r.status_code == 200
    assert r.json()["device_count"] == 0
    assert await _subscription_count() == 0


async def test_generate_summary_uses_llm_when_configured(monkeypatch) -> None:
    """The LLM is enabled by llm_base_url (keyless OK) and its text is used."""
    fake_response = httpx.Response(
        200,
        json={"choices": [{"message": {"content": "Two things due today."}}]},
        request=httpx.Request("POST", "http://localhost:4000/v1/chat/completions"),
    )
    fake_client = AsyncMock()
    fake_client.__aenter__.return_value = fake_client
    fake_client.post.return_value = fake_response

    class FakeSettings:
        llm_base_url = "http://localhost:4000/v1"
        llm_api_key = ""
        llm_model = "some-model"
        llm_timeout_seconds = 5.0

    monkeypatch.setattr(summary, "get_settings", lambda: FakeSettings())
    monkeypatch.setattr(
        summary, "httpx", SimpleNamespace(AsyncClient=lambda **kw: fake_client)
    )

    text_body, source = await summary.generate_summary([], "Tuesday, January 2")
    assert source == "llm"
    assert text_body == "Two things due today."
    fake_client.post.assert_awaited_once_with(
        "http://localhost:4000/v1/chat/completions",
        headers={"Content-Type": "application/json"},
        json={
            "model": "some-model",
            "messages": [
                {"role": "system", "content": summary.SYSTEM_PROMPT},
                {"role": "user", "content": '{"today": "Tuesday, January 2", "assignments": []}'},
            ],
            "max_tokens": summary.MAX_TOKENS,
            "temperature": summary.TEMPERATURE,
        },
    )


async def test_generate_summary_falls_back_when_llm_fails(monkeypatch) -> None:
    async def _boom(*args, **kwargs):
        raise httpx.ConnectError("refused", request=httpx.Request("POST", "http://x"))

    fake_client = AsyncMock()
    fake_client.__aenter__.return_value = fake_client
    fake_client.post = _boom

    class FakeSettings:
        llm_base_url = "http://localhost:4000/v1"
        llm_api_key = "sekret"
        llm_model = "some-model"
        llm_timeout_seconds = 5.0

    monkeypatch.setattr(summary, "get_settings", lambda: FakeSettings())
    monkeypatch.setattr(
        summary, "httpx", SimpleNamespace(AsyncClient=lambda **kw: fake_client)
    )

    text_body, source = await summary.generate_summary([], "Tuesday, January 2")
    assert source == "fallback"
    assert "Nothing is due today" in text_body

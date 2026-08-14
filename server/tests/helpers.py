"""Shared helpers for API tests."""

from datetime import datetime

from httpx import AsyncClient

PASSWORD = "hunter22"


async def register(client: AsyncClient, username: str = "tester") -> dict:
    """Register a fresh user; returns the user object."""
    r = await client.post(
        "/api/v1/auth/register", json={"username": username, "password": PASSWORD}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def create_class(client: AsyncClient, name: str = "Math", color: str = "#ff0000") -> dict:
    r = await client.post("/api/v1/classes", json={"name": name, "color": color})
    assert r.status_code == 201, r.text
    return r.json()


async def create_assignment(
    client: AsyncClient,
    class_id: str,
    title: str = "Homework",
    due_at: datetime | None = None,
    **overrides,
) -> dict:
    payload = {
        "title": title,
        "class_id": class_id,
        "due_at": (due_at or datetime.now()).isoformat(),
        **overrides,
    }
    r = await client.post("/api/v1/assignments", json=payload)
    assert r.status_code == 201, r.text
    return r.json()

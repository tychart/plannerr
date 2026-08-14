"""Tests for the assignment routes: CRUD, links, progress rules, pagination."""

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient

from tests.helpers import PASSWORD, create_assignment, create_class, register

NOW = datetime.now(timezone.utc)


async def test_assignment_create_with_links_and_nested_class(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client, "Math", "#112233")
    r = await client.post(
        "/api/v1/assignments",
        json={
            "title": "HW1",
            "class_id": cls["id"],
            "notes": "**bold**",
            "due_at": (NOW + timedelta(days=1)).isoformat(),
            "progress": 25,
            "is_priority": True,
            "links": [
                {"url": "https://example.com/canvas", "label": "Canvas"},
                {"url": "https://example.com/txt"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["title"] == "HW1"
    assert a["progress"] == 25
    assert a["is_complete"] is False
    assert a["is_priority"] is True
    assert a["class"] == {"id": cls["id"], "name": "Math", "color": "#112233"}
    assert [(l["label"], l["url"]) for l in a["links"]] == [
        ("Canvas", "https://example.com/canvas"),
        (None, "https://example.com/txt"),
    ]


async def test_assignment_requires_owned_class(client: AsyncClient) -> None:
    await register(client, "owner")
    cls = await create_class(client, "Private")
    await register(client, "other")

    r = await client.post(
        "/api/v1/assignments",
        json={"title": "x", "class_id": cls["id"], "due_at": NOW.isoformat()},
    )
    assert r.status_code == 404


async def test_assignment_rejects_invalid_progress(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    for progress in (7, 103, -5):
        r = await client.post(
            "/api/v1/assignments",
            json={"title": "x", "class_id": cls["id"], "due_at": NOW.isoformat(), "progress": progress},
        )
        assert r.status_code == 422, f"progress={progress}"


async def test_assignment_rejects_bad_link_url(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    r = await client.post(
        "/api/v1/assignments",
        json={
            "title": "x",
            "class_id": cls["id"],
            "due_at": NOW.isoformat(),
            "links": [{"url": "ftp://nope"}],
        },
    )
    assert r.status_code == 422


async def test_assignment_patch_fields_and_completion(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    a = await create_assignment(client, cls["id"], title="Original")

    r = await client.patch(
        f"/api/v1/assignments/{a['id']}",
        json={"title": "Renamed", "notes": "New notes", "progress": 100, "is_priority": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Renamed"
    assert body["notes"] == "New notes"
    assert body["progress"] == 100
    assert body["is_complete"] is True
    assert body["is_priority"] is True


async def test_assignment_patch_replaces_links(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    a = await create_assignment(
        client, cls["id"], title="With links", links=[{"url": "https://example.com/one"}]
    )
    assert len((await client.get(f"/api/v1/assignments/{a['id']}")).json()["links"]) == 1

    r = await client.patch(
        f"/api/v1/assignments/{a['id']}",
        json={"links": [{"url": "https://example.com/two", "label": "Two"}]},
    )
    links = r.json()["links"]
    assert [l["url"] for l in links] == ["https://example.com/two"]
    assert links[0]["label"] == "Two"


async def test_assignment_delete_cascades_links(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    a = await create_assignment(
        client, cls["id"], title="Temp", links=[{"url": "https://example.com/x"}]
    )
    r = await client.delete(f"/api/v1/assignments/{a['id']}")
    assert r.status_code == 204
    assert (await client.get(f"/api/v1/assignments/{a['id']}")).status_code == 404


async def test_assignment_scoped_to_user(client: AsyncClient) -> None:
    await register(client, "owner")
    cls = await create_class(client)
    a = await create_assignment(client, cls["id"], title="Secret")

    await register(client, "intruder")
    assert (await client.get(f"/api/v1/assignments/{a['id']}")).status_code == 404
    assert (await client.patch(f"/api/v1/assignments/{a['id']}", json={"title": "X"})).status_code == 404
    assert (await client.delete(f"/api/v1/assignments/{a['id']}")).status_code == 404


async def test_assignment_list_first_page_horizon_and_order(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    overdue = await create_assignment(client, cls["id"], title="Overdue", due_at=NOW - timedelta(days=2))
    soon = await create_assignment(client, cls["id"], title="Soon", due_at=NOW + timedelta(days=1))
    mid = await create_assignment(client, cls["id"], title="Mid", due_at=NOW + timedelta(days=3))
    far = await create_assignment(client, cls["id"], title="Far", due_at=NOW + timedelta(days=30))

    page1 = (await client.get("/api/v1/assignments")).json()
    assert [i["title"] for i in page1["items"]] == ["Overdue", "Soon", "Mid"]
    assert page1["next_cursor"] is not None

    page2 = (await client.get("/api/v1/assignments", params={"cursor": page1["next_cursor"]})).json()
    assert [i["title"] for i in page2["items"]] == ["Far"]
    assert page2["next_cursor"] is None

    # Overdue assignments remain visible; the far one appears on page 2 only.
    assert overdue["id"] in [i["id"] for i in page1["items"]]
    assert far["id"] not in [i["id"] for i in page1["items"]]


async def test_assignment_list_hides_completed_by_default(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    done = await create_assignment(client, cls["id"], title="Done", due_at=NOW + timedelta(days=1))
    await client.patch(f"/api/v1/assignments/{done['id']}", json={"progress": 100})

    hidden = (await client.get("/api/v1/assignments")).json()
    assert all(i["title"] != "Done" for i in hidden["items"])

    shown = (await client.get("/api/v1/assignments", params={"include_completed": True})).json()
    assert any(i["title"] == "Done" for i in shown["items"])


async def test_assignment_list_cursor_pagination_pages(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    # Two items inside the horizon (returned on page 1) and five beyond it
    # (returned via cursor pages, honoring `limit`).
    near = [
        await create_assignment(client, cls["id"], title=f"N{i}", due_at=NOW + timedelta(days=1 + i))
        for i in range(2)
    ]
    far = [
        await create_assignment(client, cls["id"], title=f"F{i}", due_at=NOW + timedelta(days=10 + i))
        for i in range(5)
    ]

    page1 = (await client.get("/api/v1/assignments")).json()
    assert [i["title"] for i in page1["items"]] == ["N0", "N1"]

    page2 = (await client.get("/api/v1/assignments", params={"limit": 2, "cursor": page1["next_cursor"]})).json()
    assert [i["title"] for i in page2["items"]] == ["F0", "F1"]
    page3 = (await client.get("/api/v1/assignments", params={"limit": 2, "cursor": page2["next_cursor"]})).json()
    assert [i["title"] for i in page3["items"]] == ["F2", "F3"]
    page4 = (await client.get("/api/v1/assignments", params={"limit": 2, "cursor": page3["next_cursor"]})).json()
    assert [i["title"] for i in page4["items"]] == ["F4"]
    assert page4["next_cursor"] is None


async def test_assignment_list_rejects_invalid_cursor(client: AsyncClient) -> None:
    await register(client)
    r = await client.get("/api/v1/assignments", params={"cursor": "!!!not-base64!!!"})
    assert r.status_code == 400


async def test_login_required_for_assignments(client: AsyncClient) -> None:
    r = await client.get("/api/v1/assignments")
    assert r.status_code == 401

"""Tests for the item routes: per-kind CRUD, links, progress rules, and the
shared filterable list endpoint."""

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient

from tests.helpers import (
    create_assignment,
    create_class,
    create_exam,
    create_item,
    create_quiz,
    register,
)

NOW = datetime.now(timezone.utc)


# ── CRUD + validation ────────────────────────────────────────────────────────

async def test_item_create_with_links_kind_and_nested_class(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client, "Math", "#112233")
    r = await client.post(
        "/api/v1/items",
        json={
            "kind": "assignment",
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
    assert a["kind"] == "assignment"
    assert a["title"] == "HW1"
    assert a["progress"] == 25
    assert a["is_complete"] is False
    assert a["is_priority"] is True
    assert a["class"] == {"id": cls["id"], "name": "Math", "color": "#112233"}
    assert [(l["label"], l["url"]) for l in a["links"]] == [
        ("Canvas", "https://example.com/canvas"),
        (None, "https://example.com/txt"),
    ]


async def test_quiz_and_exam_create_default_progress_null(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    for kind in ("quiz", "exam"):
        r = await client.post(
            "/api/v1/items",
            json={"kind": kind, "title": kind.title(), "class_id": cls["id"], "due_at": NOW.isoformat()},
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["kind"] == kind
        assert body["progress"] is None
        assert body["is_complete"] is False


async def test_assignment_without_progress_defaults_to_zero(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    a = await create_assignment(client, cls["id"], title="No progress sent")
    assert a["progress"] == 0
    assert a["is_complete"] is False


async def test_quiz_or_exam_rejects_progress(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    for kind in ("quiz", "exam"):
        r = await client.post(
            "/api/v1/items",
            json={
                "kind": kind,
                "title": "x",
                "class_id": cls["id"],
                "due_at": NOW.isoformat(),
                "progress": 50,
            },
        )
        assert r.status_code == 422, f"kind={kind}"


async def test_item_requires_owned_class(client: AsyncClient) -> None:
    await register(client, "owner")
    cls = await create_class(client, "Private")
    await register(client, "other")

    r = await client.post(
        "/api/v1/items",
        json={"kind": "assignment", "title": "x", "class_id": cls["id"], "due_at": NOW.isoformat()},
    )
    assert r.status_code == 404


async def test_assignment_rejects_invalid_progress(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    for progress in (7, 103, -5):
        r = await client.post(
            "/api/v1/items",
            json={
                "kind": "assignment",
                "title": "x",
                "class_id": cls["id"],
                "due_at": NOW.isoformat(),
                "progress": progress,
            },
        )
        assert r.status_code == 422, f"progress={progress}"


async def test_item_rejects_bad_link_url(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    r = await client.post(
        "/api/v1/items",
        json={
            "kind": "assignment",
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
        f"/api/v1/items/{a['id']}",
        json={"title": "Renamed", "notes": "New notes", "progress": 100, "is_priority": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Renamed"
    assert body["notes"] == "New notes"
    assert body["progress"] == 100
    assert body["is_complete"] is True
    assert body["is_priority"] is True


async def test_patching_progress_on_quiz_or_exam_fails(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    quiz = await create_quiz(client, cls["id"], title="Pop quiz")
    r = await client.patch(f"/api/v1/items/{quiz['id']}", json={"progress": 50})
    assert r.status_code == 422

    exam = await create_exam(client, cls["id"], title="Final")
    r = await client.patch(f"/api/v1/items/{exam['id']}", json={"progress": 0})
    assert r.status_code == 422


async def test_item_patch_replaces_links(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    a = await create_assignment(
        client, cls["id"], title="With links", links=[{"url": "https://example.com/one"}]
    )
    assert len((await client.get(f"/api/v1/items/{a['id']}")).json()["links"]) == 1

    r = await client.patch(
        f"/api/v1/items/{a['id']}",
        json={"links": [{"url": "https://example.com/two", "label": "Two"}]},
    )
    links = r.json()["links"]
    assert [l["url"] for l in links] == ["https://example.com/two"]
    assert links[0]["label"] == "Two"


async def test_item_delete_cascades_links(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    a = await create_assignment(
        client, cls["id"], title="Temp", links=[{"url": "https://example.com/x"}]
    )
    r = await client.delete(f"/api/v1/items/{a['id']}")
    assert r.status_code == 204
    assert (await client.get(f"/api/v1/items/{a['id']}")).status_code == 404


async def test_item_scoped_to_user(client: AsyncClient) -> None:
    await register(client, "owner")
    cls = await create_class(client)
    a = await create_quiz(client, cls["id"], title="Secret")

    await register(client, "intruder")
    assert (await client.get(f"/api/v1/items/{a['id']}")).status_code == 404
    assert (await client.patch(f"/api/v1/items/{a['id']}", json={"title": "X"})).status_code == 404
    assert (await client.delete(f"/api/v1/items/{a['id']}")).status_code == 404


# ── List endpoint: kind + filters ────────────────────────────────────────────

async def test_list_requires_kind(client: AsyncClient) -> None:
    await register(client)
    assert (await client.get("/api/v1/items")).status_code == 422
    assert (await client.get("/api/v1/items", params={"kind": "project"})).status_code == 422


async def test_list_filters_by_kind(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    await create_assignment(client, cls["id"], title="A1")
    await create_quiz(client, cls["id"], title="Q1")
    await create_exam(client, cls["id"], title="E1")

    for kind, expected in (("assignment", ["A1"]), ("quiz", ["Q1"]), ("exam", ["E1"])):
        items = (await client.get("/api/v1/items", params={"kind": kind})).json()["items"]
        assert [i["title"] for i in items] == expected, f"kind={kind}"


async def test_list_orders_asc_and_desc(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    await create_assignment(client, cls["id"], title="Oldest", due_at=NOW - timedelta(days=2))
    await create_assignment(client, cls["id"], title="Middle", due_at=NOW + timedelta(days=1))
    await create_assignment(client, cls["id"], title="Newest", due_at=NOW + timedelta(days=3))

    asc = (await client.get("/api/v1/items", params={"kind": "assignment"})).json()["items"]
    assert [i["title"] for i in asc] == ["Oldest", "Middle", "Newest"]

    desc = (
        await client.get("/api/v1/items", params={"kind": "assignment", "order": "desc"})
    ).json()["items"]
    assert [i["title"] for i in desc] == ["Newest", "Middle", "Oldest"]


async def test_list_status_filters_completion(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    active = await create_assignment(client, cls["id"], title="Active", due_at=NOW + timedelta(days=1))
    done = await create_assignment(client, cls["id"], title="Done", due_at=NOW + timedelta(days=1))
    await client.patch(f"/api/v1/items/{done['id']}", json={"progress": 100})

    active_only = (await client.get("/api/v1/items", params={"kind": "assignment"})).json()["items"]
    assert [i["title"] for i in active_only] == ["Active"]

    completed = (
        await client.get("/api/v1/items", params={"kind": "assignment", "status": "completed"})
    ).json()["items"]
    assert [i["title"] for i in completed] == ["Done"]

    everything = (
        await client.get("/api/v1/items", params={"kind": "assignment", "status": "all"})
    ).json()["items"]
    assert sorted(i["title"] for i in everything) == ["Active", "Done"]


async def test_list_active_never_hides_quizzes(client: AsyncClient) -> None:
    """NULL progress must never be treated as 'completed'."""
    await register(client)
    cls = await create_class(client)
    await create_quiz(client, cls["id"], title="Quiz stays", due_at=NOW + timedelta(days=1))
    items = (await client.get("/api/v1/items", params={"kind": "quiz"})).json()["items"]
    assert [i["title"] for i in items] == ["Quiz stays"]


async def test_list_windows_upcoming_and_past(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    past = await create_quiz(client, cls["id"], title="Past quiz", due_at=NOW - timedelta(days=2))
    future = await create_quiz(client, cls["id"], title="Next quiz", due_at=NOW + timedelta(days=2))

    upcoming = (
        await client.get(
            "/api/v1/items", params={"kind": "quiz", "window": "upcoming", "tz": "UTC"}
        )
    ).json()["items"]
    assert [i["title"] for i in upcoming] == ["Next quiz"]

    past_items = (
        await client.get(
            "/api/v1/items", params={"kind": "quiz", "window": "past", "tz": "UTC"}
        )
    ).json()["items"]
    assert [i["title"] for i in past_items] == ["Past quiz"]

    all_items = (
        await client.get("/api/v1/items", params={"kind": "quiz", "window": "all"})
    ).json()["items"]
    assert sorted(i["id"] for i in all_items) == sorted([past["id"], future["id"]])


async def test_list_horizon_includes_overdue_but_not_far_future(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    overdue = await create_assignment(client, cls["id"], title="Overdue", due_at=NOW - timedelta(days=2))
    soon = await create_assignment(client, cls["id"], title="Soon", due_at=NOW + timedelta(days=1))
    far = await create_assignment(client, cls["id"], title="Far", due_at=NOW + timedelta(days=30))

    items = (
        await client.get("/api/v1/items", params={"kind": "assignment", "window": "horizon"})
    ).json()["items"]
    assert [i["title"] for i in items] == ["Overdue", "Soon"]
    assert far["id"] not in [i["id"] for i in items]
    assert overdue["id"] in [i["id"] for i in items]


async def test_list_searches_title_and_notes(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    await create_assignment(client, cls["id"], title="Integral calc", notes="review derivatives")
    await create_assignment(client, cls["id"], title="Essay", notes="about derivatives")
    await create_assignment(client, cls["id"], title="Art project", notes="paint")

    by_title = (
        await client.get("/api/v1/items", params={"kind": "assignment", "q": "integral"})
    ).json()["items"]
    assert [i["title"] for i in by_title] == ["Integral calc"]

    by_notes = (
        await client.get("/api/v1/items", params={"kind": "assignment", "q": "derivatives"})
    ).json()["items"]
    assert sorted(i["title"] for i in by_notes) == ["Essay", "Integral calc"]

    wildcard = (
        await client.get("/api/v1/items", params={"kind": "assignment", "q": "%"})
    ).json()["items"]
    assert wildcard == []  # '%' is matched literally, not as a wildcard


async def test_list_filters_by_class(client: AsyncClient) -> None:
    await register(client)
    math = await create_class(client, "Math")
    art = await create_class(client, "Art")
    await create_assignment(client, math["id"], title="In math")
    await create_assignment(client, art["id"], title="In art")

    items = (
        await client.get("/api/v1/items", params={"kind": "assignment", "class_id": math["id"]})
    ).json()["items"]
    assert [i["title"] for i in items] == ["In math"]


async def test_list_unknown_window_rejected(client: AsyncClient) -> None:
    await register(client)
    r = await client.get("/api/v1/items", params={"kind": "assignment", "window": "bogus"})
    assert r.status_code == 400


# ── Pagination ───────────────────────────────────────────────────────────────

async def test_list_cursor_pagination_pages(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client)
    for i in range(7):
        await create_assignment(client, cls["id"], title=f"Item{i}", due_at=NOW + timedelta(days=i))

    # Explicit `limit` pages over the whole window.
    page1 = (await client.get("/api/v1/items", params={"kind": "assignment", "limit": 2})).json()
    assert [i["title"] for i in page1["items"]] == ["Item0", "Item1"]
    assert page1["next_cursor"] is not None

    page2 = (
        await client.get(
            "/api/v1/items", params={"kind": "assignment", "limit": 2, "cursor": page1["next_cursor"]}
        )
    ).json()
    assert [i["title"] for i in page2["items"]] == ["Item2", "Item3"]

    page3 = (
        await client.get(
            "/api/v1/items", params={"kind": "assignment", "limit": 2, "cursor": page2["next_cursor"]}
        )
    ).json()
    assert [i["title"] for i in page3["items"]] == ["Item4", "Item5"]

    page4 = (
        await client.get(
            "/api/v1/items", params={"kind": "assignment", "limit": 2, "cursor": page3["next_cursor"]}
        )
    ).json()
    assert [i["title"] for i in page4["items"]] == ["Item6"]
    assert page4["next_cursor"] is None


async def test_list_sidecar_limit_stops_at_cap(client: AsyncClient) -> None:
    """Small `limit` calls (the sidebar) return at most that many items."""
    await register(client)
    cls = await create_class(client)
    for i in range(3):
        await create_quiz(client, cls["id"], title=f"Q{i}", due_at=NOW + timedelta(days=1 + i))

    items = (
        await client.get("/api/v1/items", params={"kind": "quiz", "window": "upcoming", "limit": 2})
    ).json()["items"]
    assert [i["title"] for i in items] == ["Q0", "Q1"]


async def test_list_rejects_invalid_cursor(client: AsyncClient) -> None:
    await register(client)
    r = await client.get("/api/v1/items", params={"kind": "assignment", "cursor": "!!!not-base64!!!"})
    assert r.status_code == 400


async def test_login_required_for_items(client: AsyncClient) -> None:
    r = await client.get("/api/v1/items", params={"kind": "assignment"})
    assert r.status_code == 401

"""Tests for the classes routes: CRUD, validation, scoping, delete flows."""

from httpx import AsyncClient

from tests.helpers import PASSWORD, create_assignment, create_class, register


async def test_class_lifecycle(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client, "  Physics   101  ", "#00ff00")
    assert cls["name"] == "Physics 101"  # normalized
    assert cls["color"] == "#00ff00"
    assert cls["assignment_count"] == 0

    updated = (await client.patch(f"/api/v1/classes/{cls['id']}", json={"name": "Physics"})).json()
    assert updated["name"] == "Physics"
    assert updated["color"] == "#00ff00"

    r = await client.delete(f"/api/v1/classes/{cls['id']}")
    assert r.status_code == 204
    # Only the auto-created Default class remains.
    names = [c["name"] for c in (await client.get("/api/v1/classes")).json()]
    assert names == ["Default"]


async def test_class_name_duplicate_conflicts_case_insensitive(client: AsyncClient) -> None:
    await register(client)
    await create_class(client, "History")
    r = await client.post("/api/v1/classes", json={"name": "history", "color": "#000000"})
    assert r.status_code == 409

    # Renaming to a conflicting name also conflicts
    other = await create_class(client, "Geography")
    r = await client.patch(f"/api/v1/classes/{other['id']}", json={"name": "HISTORY"})
    assert r.status_code == 409


async def test_class_rejects_invalid_color_and_empty_name(client: AsyncClient) -> None:
    await register(client)
    r = await client.post("/api/v1/classes", json={"name": "Art", "color": "red"})
    assert r.status_code == 422
    r = await client.post("/api/v1/classes", json={"name": "   ", "color": "#ffffff"})
    assert r.status_code == 400


async def test_class_list_includes_assignment_counts(client: AsyncClient) -> None:
    await register(client)
    math = await create_class(client, "Math")
    await create_assignment(client, math["id"], title="A1")
    await create_assignment(client, math["id"], title="A2")
    await create_class(client, "Empty")

    classes = {c["name"]: c["assignment_count"] for c in (await client.get("/api/v1/classes")).json()}
    assert classes["Math"] == 2
    assert classes["Empty"] == 0


async def test_class_operations_scoped_to_user(client: AsyncClient) -> None:
    await register(client, "owner")
    cls = await create_class(client, "Private")

    # A second user cannot see or touch the first user's class.
    await register(client, "intruder")
    assert all(c["name"] != "Private" for c in (await client.get("/api/v1/classes")).json())
    assert (await client.patch(f"/api/v1/classes/{cls['id']}", json={"name": "Hacked"})).status_code == 404
    assert (await client.get(f"/api/v1/classes/{cls['id']}/delete-preview")).status_code == 404
    assert (await client.delete(f"/api/v1/classes/{cls['id']}")).status_code == 404


async def test_delete_preview_lists_assignments(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client, "Bio")
    for i in range(3):
        await create_assignment(client, cls["id"], title=f"Lab{i}")

    preview = (await client.get(f"/api/v1/classes/{cls['id']}/delete-preview")).json()
    assert preview["assignment_count"] == 3
    assert [a["title"] for a in preview["assignments"]] == ["Lab0", "Lab1", "Lab2"]


async def test_delete_with_transfer_moves_assignments(client: AsyncClient) -> None:
    await register(client)
    source = await create_class(client, "Source")
    target = await create_class(client, "Target")
    a1 = await create_assignment(client, source["id"], title="Move me")

    r = await client.delete(
        f"/api/v1/classes/{source['id']}", params={"transfer_to_class_id": target["id"]}
    )
    assert r.status_code == 204

    fetched = (await client.get(f"/api/v1/assignments/{a1['id']}")).json()
    assert fetched["class"]["name"] == "Target"


async def test_delete_without_transfer_cascades(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client, "Doomed")
    a = await create_assignment(client, cls["id"], title="Gone")

    r = await client.delete(f"/api/v1/classes/{cls['id']}")
    assert r.status_code == 204
    assert (await client.get(f"/api/v1/assignments/{a['id']}")).status_code == 404


async def test_delete_rejects_self_transfer(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client, "Solo")
    r = await client.delete(f"/api/v1/classes/{cls['id']}", params={"transfer_to_class_id": cls["id"]})
    assert r.status_code == 400


async def test_delete_rejects_foreign_transfer_target(client: AsyncClient) -> None:
    await register(client, "owner")
    cls = await create_class(client, "Mine")
    await register(client, "other")
    other_cls = await create_class(client, "Theirs")

    # Switch back to owner: use a fresh cookie by re-logging in
    await client.post("/api/v1/auth/login", json={"username": "owner", "password": PASSWORD})
    r = await client.delete(
        f"/api/v1/classes/{cls['id']}", params={"transfer_to_class_id": other_cls["id"]}
    )
    assert r.status_code == 404

"""Tests for the classes routes: CRUD, validation, scoping, delete flows."""

from httpx import AsyncClient

from tests.helpers import PASSWORD, create_assignment, create_class, create_exam, create_quiz, register


async def test_class_lifecycle(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client, "  Physics   101  ", "#00ff00")
    assert cls["name"] == "Physics 101"  # normalized
    assert cls["color"] == "#00ff00"
    assert cls["counts"] == {"assignment": 0, "quiz": 0, "exam": 0}

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


async def test_class_list_reports_per_kind_counts(client: AsyncClient) -> None:
    await register(client)
    math = await create_class(client, "Math")
    await create_assignment(client, math["id"], title="A1")
    await create_assignment(client, math["id"], title="A2")
    await create_quiz(client, math["id"], title="Q1")
    await create_exam(client, math["id"], title="E1")
    await create_class(client, "Empty")

    by_name = {c["name"]: c["counts"] for c in (await client.get("/api/v1/classes")).json()}
    assert by_name["Math"] == {"assignment": 2, "quiz": 1, "exam": 1}
    assert by_name["Empty"] == {"assignment": 0, "quiz": 0, "exam": 0}


async def test_class_operations_scoped_to_user(client: AsyncClient) -> None:
    await register(client, "owner")
    cls = await create_class(client, "Private")

    # A second user cannot see or touch the first user's class.
    await register(client, "intruder")
    assert all(c["name"] != "Private" for c in (await client.get("/api/v1/classes")).json())
    assert (await client.patch(f"/api/v1/classes/{cls['id']}", json={"name": "Hacked"})).status_code == 404
    assert (await client.get(f"/api/v1/classes/{cls['id']}/delete-preview")).status_code == 404
    assert (await client.delete(f"/api/v1/classes/{cls['id']}")).status_code == 404


async def test_delete_preview_lists_all_kinds_with_counts(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client, "Bio")
    await create_assignment(client, cls["id"], title="Lab1")
    await create_assignment(client, cls["id"], title="Lab2")
    await create_quiz(client, cls["id"], title="Pop quiz")
    await create_exam(client, cls["id"], title="Final")

    preview = (await client.get(f"/api/v1/classes/{cls['id']}/delete-preview")).json()
    assert preview["counts"] == {"assignment": 2, "quiz": 1, "exam": 1}
    assert preview["total"] == 4
    assert [(i["kind"], i["title"]) for i in preview["items"]] == [
        ("assignment", "Lab1"),
        ("assignment", "Lab2"),
        ("quiz", "Pop quiz"),
        ("exam", "Final"),
    ]


async def test_delete_preview_empty_class(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client, "Empty")
    preview = (await client.get(f"/api/v1/classes/{cls['id']}/delete-preview")).json()
    assert preview["counts"] == {"assignment": 0, "quiz": 0, "exam": 0}
    assert preview["total"] == 0
    assert preview["items"] == []


async def test_delete_with_transfer_moves_all_kinds(client: AsyncClient) -> None:
    await register(client)
    source = await create_class(client, "Source")
    target = await create_class(client, "Target")
    a1 = await create_assignment(client, source["id"], title="Move me")
    q1 = await create_quiz(client, source["id"], title="Quiz too")

    r = await client.delete(
        f"/api/v1/classes/{source['id']}", params={"transfer_to_class_id": target["id"]}
    )
    assert r.status_code == 204

    assert (await client.get(f"/api/v1/items/{a1['id']}")).json()["class"]["name"] == "Target"
    assert (await client.get(f"/api/v1/items/{q1['id']}")).json()["class"]["name"] == "Target"


async def test_delete_without_transfer_cascades_all_kinds(client: AsyncClient) -> None:
    await register(client)
    cls = await create_class(client, "Doomed")
    a = await create_assignment(client, cls["id"], title="Gone")
    q = await create_quiz(client, cls["id"], title="Quiz gone")

    r = await client.delete(f"/api/v1/classes/{cls['id']}")
    assert r.status_code == 204
    assert (await client.get(f"/api/v1/items/{a['id']}")).status_code == 404
    assert (await client.get(f"/api/v1/items/{q['id']}")).status_code == 404


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

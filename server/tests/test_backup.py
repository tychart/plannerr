"""Tests for data export/import (backup & transfer)."""

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from httpx import AsyncClient

from app.constants import DEFAULT_CLASS_COLOR
from tests.helpers import create_assignment, create_class, create_exam, create_quiz, register

FIXED1 = datetime(2026, 9, 15, 9, 0, tzinfo=timezone.utc)
FIXED2 = datetime(2026, 9, 20, 23, 59, 59, tzinfo=timezone.utc)
FIXED3 = datetime(2026, 10, 1, 14, 30, tzinfo=timezone.utc)


def _content_set(export: dict) -> tuple[frozenset, frozenset]:
    """(classes, items) as comparable frozensets, ignoring ids/order/timestamps."""
    classes = frozenset((c["name"], c["color"]) for c in export["classes"])
    items = frozenset(
        (
            i["kind"],
            i["title"],
            i["notes"],
            i["due_at"],
            i["progress"],
            i["is_priority"],
            i["class"],
            tuple((l["url"], l["label"]) for l in i["links"]),
        )
        for i in export["items"]
    )
    return classes, items


async def _import(client: AsyncClient, payload: dict, tz: str = "UTC") -> dict:
    r = await client.post("/api/v1/data/import", params={"tz": tz}, json=payload)
    assert r.status_code == 200, r.text
    return r.json()


async def _seed_alice(client: AsyncClient) -> dict:
    """Alice: 3 classes (one empty), mixed items incl. completed & past ones."""
    await register(client, "alice")
    math = await create_class(client, "Math", "#ff0000")
    art = await create_class(client, "Art", "#00ff00")
    await create_class(client, "Empty", "#112233")
    await create_assignment(
        client, math["id"], title="PSet 3", due_at=FIXED1, notes="**calc**",
        is_priority=True, progress=35,
        links=[{"url": "https://example.com/canvas", "label": "Canvas"}],
    )
    done = await create_assignment(client, math["id"], title="Done reading", due_at=FIXED2)
    await client.patch(f"/api/v1/items/{done['id']}", json={"progress": 100})
    await create_quiz(client, math["id"], title="Ch 4 quiz", due_at=FIXED2,
                      links=[{"url": "https://example.com/q"}])
    await create_exam(client, art["id"], title="Midterm", due_at=FIXED3, is_priority=True)
    await create_quiz(client, art["id"], title="Old pop quiz", due_at=datetime(2026, 7, 1, tzinfo=timezone.utc))
    export = (await client.get("/api/v1/data/export")).json()
    return export


# ── Auth & envelope ──────────────────────────────────────────────────────────

async def test_export_and_import_require_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/data/export")).status_code == 401
    r = await client.post("/api/v1/data/import", json={"items": []})
    assert r.status_code == 401


async def test_export_envelope_and_ordering(client: AsyncClient) -> None:
    export = await _seed_alice(client)
    assert export["format"] == "plannerr-backup"
    assert export["version"] == 1
    assert "exported_at" in export
    assert [c["name"] for c in export["classes"]] == ["Art", "Default", "Empty", "Math"]  # by name
    # Items sorted by due_at, and the export includes completed + past items.
    assert len(export["items"]) == 5
    kinds = {i["title"]: i["kind"] for i in export["items"]}
    assert kinds["Old pop quiz"] == "quiz"
    assert kinds["PSet 3"] == "assignment"
    pset = next(i for i in export["items"] if i["title"] == "PSet 3")
    assert pset["progress"] == 35
    assert pset["links"] == [{"url": "https://example.com/canvas", "label": "Canvas"}]
    done = next(i for i in export["items"] if i["title"] == "Done reading")
    assert done["progress"] == 100


# ── Round trip & merge semantics ─────────────────────────────────────────────

async def test_export_import_round_trip_restores_everything(client: AsyncClient) -> None:
    alice_export = await _seed_alice(client)

    await register(client, "bob")
    report = await _import(client, alice_export)
    assert report["invalid"] == []
    assert report["imported"] == 5
    assert report["duplicates"] == 0
    assert set(report["classes_created"]) == {"Art", "Empty", "Math"}

    bob_export = (await client.get("/api/v1/data/export")).json()
    assert _content_set(bob_export) == _content_set(alice_export)


async def test_reimport_into_same_account_skips_duplicates(client: AsyncClient) -> None:
    """Importing your own export back into the same account is a no-op:
    every row matches an existing (kind, class, title, due date)."""
    alice_export = await _seed_alice(client)
    report = await _import(client, alice_export)
    assert report["imported"] == 0
    assert report["duplicates"] == 5
    assert report["classes_created"] == []
    assert report["invalid"] == []

    export = (await client.get("/api/v1/data/export")).json()
    assert len(export["items"]) == 5  # nothing duplicated


async def test_merge_adds_new_rows_and_keeps_existing(client: AsyncClient) -> None:
    await _seed_alice(client)
    # A weekly-schedule style file with one new assignment for an existing
    # class and a brand-new class.
    payload = {
        "items": [
            {"kind": "assignment", "title": "New week PSet", "class": "Math", "due_at": "2026-11-02"},
            {"kind": "quiz", "title": "Vocab quiz", "class": "Spanish", "due_at": "2026-11-03T09:00"},
        ]
    }
    report = await _import(client, payload)
    assert report["imported"] == 2
    assert report["classes_created"] == ["Spanish"]

    export = (await client.get("/api/v1/data/export")).json()
    assert len(export["items"]) == 7  # 5 + 2, existing untouched


async def test_duplicate_detection_key_ignores_notes(client: AsyncClient) -> None:
    """The duplicate identity is (kind, class, title, due date) — notes,
    links, priority, and progress edits do NOT make a re-imported row new.
    This is what makes re-importing a weekly file (or your own export) safe."""
    await register(client)
    math = await create_class(client, "Math")
    await create_assignment(client, math["id"], title="PSet", due_at=FIXED1, notes="v1")

    payload = {
        "items": [
            {"kind": "assignment", "title": "PSet", "class": "Math",
             "due_at": FIXED1.isoformat(), "notes": "v2"},
        ]
    }
    report = await _import(client, payload)
    assert report["imported"] == 0
    assert report["duplicates"] == 1  # same identity → skipped

    # …whereas a genuinely different task (new title) imports fine.
    payload["items"][0]["title"] = "PSet revised"
    report = await _import(client, payload)
    assert report["imported"] == 1
    assert report["duplicates"] == 0


async def test_identical_rows_within_one_file_import_once(client: AsyncClient) -> None:
    await register(client)
    payload = {
        "items": [
            {"kind": "quiz", "title": "Spelling", "class": "English", "due_at": "2026-12-01"},
            {"kind": "quiz", "title": "Spelling", "class": "English", "due_at": "2026-12-01"},
        ]
    }
    report = await _import(client, payload)
    assert report["imported"] == 1
    assert report["duplicates"] == 1


# ── Class handling ───────────────────────────────────────────────────────────

async def test_import_matches_classes_by_name_case_insensitively(client: AsyncClient) -> None:
    await register(client)
    await create_class(client, "Physics", "#0000ff")

    payload = {
        "classes": [{"name": "physics", "color": "#ff0000"}],
        "items": [{"kind": "assignment", "title": "Lab", "class": "PHYSICS ", "due_at": "2026-11-01"}],
    }
    report = await _import(client, payload)
    assert report["classes_created"] == []  # matched the existing class

    classes = (await client.get("/api/v1/classes")).json()
    assert len(classes) == 2  # Default + Physics (not duplicated)
    physics = next(c for c in classes if c["name"] == "Physics")
    assert physics["color"] == "#0000ff"  # existing color untouched
    assert physics["counts"]["assignment"] == 1


async def test_import_creates_declared_class_with_color(client: AsyncClient) -> None:
    await register(client)
    payload = {
        "classes": [{"name": "Chemistry", "color": "#abcdef"}],
        "items": [{"kind": "quiz", "title": "Stoichiometry", "class": "Chemistry", "due_at": "2026-11-05"}],
    }
    report = await _import(client, payload)
    assert report["classes_created"] == ["Chemistry"]
    classes = {c["name"]: c for c in (await client.get("/api/v1/classes")).json()}
    assert classes["Chemistry"]["color"] == "#abcdef"


async def test_import_classes_are_user_scoped(client: AsyncClient) -> None:
    alice_export = await _seed_alice(client)
    await register(client, "bob")
    await _import(client, alice_export)
    # Bob's import cannot see or touch Alice's classes; Bob ends up with his
    # own copies plus the Default class every account starts with.
    bob_classes = (await client.get("/api/v1/classes")).json()
    assert {c["name"] for c in bob_classes} == {"Art", "Default", "Empty", "Math"}
    counts = {c["name"]: c["counts"] for c in bob_classes}
    assert counts["Math"] == {"assignment": 2, "quiz": 1, "exam": 0}
    assert counts["Art"] == {"assignment": 0, "quiz": 1, "exam": 1}
    assert counts["Empty"] == {"assignment": 0, "quiz": 0, "exam": 0}
    assert counts["Default"] == {"assignment": 0, "quiz": 0, "exam": 0}


# ── Lenient hand-written parsing ─────────────────────────────────────────────

async def test_hand_written_file_lenient_parsing(client: AsyncClient) -> None:
    await register(client)
    payload = {
        # no format/version, unknown extra keys, class without color
        "classes": [{"name": "Physics", "color": "not-a-color"}],
        "items": [
            {"kind": "Assignment", "title": "Lab 1", "class": "Physics",
             "due_at": "2026-09-15", "priority": "yes"},  # date-only + alias
            {"kind": "quiz", "title": "Ch 1 quiz", "class": "physics",
             "due_at": "2026-09-20T10:30"},  # naive time, lowercase class
            {"kind": "assignment", "title": "Reading", "class": "Brand new",
             "due_at": "2026-09-10", "progress": "25", "notes": "", "foo": "ignored"},
            {"kind": "exam", "title": "Final", "class": "Physics",
             "due_at": "2026-12-15"},
        ],
    }
    report = await _import(client, payload, tz="America/Denver")
    assert report["invalid"] == []
    assert report["imported"] == 4
    assert report["classes_created"] == ["Physics", "Brand new"]

    classes = {c["name"]: c for c in (await client.get("/api/v1/classes")).json()}
    assert classes["Physics"]["color"] == DEFAULT_CLASS_COLOR  # bad color → default

    items = (await client.get("/api/v1/items", params={"kind": "assignment", "status": "all"})).json()["items"]
    lab = next(i for i in items if i["title"] == "Lab 1")
    assert lab["progress"] == 0  # default
    assert lab["is_priority"] is True  # parsed from "yes"
    # date-only 2026-09-15 in Denver → 23:59:59 MDT = 05:59:59Z next day
    denver = datetime.combine(date(2026, 9, 15), time(23, 59, 59), tzinfo=ZoneInfo("America/Denver"))
    assert datetime.fromisoformat(lab["due_at"]) == denver.astimezone(timezone.utc)

    reading = next(i for i in items if i["title"] == "Reading")
    assert reading["progress"] == 25  # string coerced
    assert reading["class"]["name"] == "Brand new"

    exams = (await client.get("/api/v1/items", params={"kind": "exam", "status": "all"})).json()["items"]
    final = next(i for i in exams if i["title"] == "Final")
    # naive "2026-12-15T10:30" → wait: used bare "2026-12-15"; assert all-day
    assert final["progress"] is None
    assert final["class"]["name"] == "Physics"


async def test_malformed_rows_are_reported_and_skipped(client: AsyncClient) -> None:
    await register(client)
    payload = {
        "items": [
            {"kind": "assignment", "title": "Good row", "class": "Math", "due_at": "2026-11-01"},
            {"kind": "project", "title": "Bad kind", "class": "Math", "due_at": "2026-11-01"},
            {"kind": "assignment", "title": "  ", "class": "Math", "due_at": "2026-11-01"},
            {"kind": "assignment", "title": "No class", "due_at": "2026-11-01"},
            {"kind": "quiz", "title": "Bad date", "class": "Math", "due_at": "tomorrow"},
            {"kind": "assignment", "title": "Bad progress", "class": "Math",
             "due_at": "2026-11-01", "progress": 13},
            {"kind": "assignment", "title": "Bad links", "class": "Math",
             "due_at": "2026-11-01", "links": "nope"},
            "not an object",
            {"kind": "exam", "title": "Also good", "class": "Math", "due_at": "2026-12-01"},
        ],
    }
    report = await _import(client, payload)
    assert report["imported"] == 2
    assert {i["row"] for i in report["invalid"]} == {1, 2, 3, 4, 5, 6, 7}
    reasons = " | ".join(i["reason"] for i in report["invalid"])
    assert "kind" in reasons
    assert "title" in reasons
    assert "class" in reasons
    assert "date" in reasons
    assert "progress" in reasons
    assert "links" in reasons
    assert "object" in reasons


async def test_import_drops_bad_links_but_keeps_row(client: AsyncClient) -> None:
    await register(client)
    links = [{"url": f"https://example.com/{i}", "label": None} for i in range(7)]
    links.append({"url": "not-a-url"})
    payload = {
        "items": [
            {"kind": "assignment", "title": "Linked", "class": "Math",
             "due_at": "2026-11-01", "links": links},
        ]
    }
    report = await _import(client, payload)
    assert report["imported"] == 1
    items = (await client.get("/api/v1/items", params={"kind": "assignment"})).json()["items"]
    assert len(items[0]["links"]) == 5  # capped at MAX_LINKS, invalid one dropped


async def test_import_due_date_formats(client: AsyncClient) -> None:
    await register(client)
    payload = {
        "items": [
            {"kind": "assignment", "title": "Aware", "class": "Math",
             "due_at": "2026-11-01T14:00:00Z"},
            {"kind": "assignment", "title": "Offset", "class": "Math",
             "due_at": "2026-11-01T09:00:00-04:00"},
            {"kind": "assignment", "title": "Naive-local", "class": "Math",
             "due_at": "2026-11-01T09:00:00"},
        ]
    }
    report = await _import(client, payload, tz="America/Denver")
    assert report["imported"] == 3
    items = (await client.get("/api/v1/items", params={"kind": "assignment"})).json()["items"]
    due = {i["title"]: datetime.fromisoformat(i["due_at"]) for i in items}
    assert due["Aware"] == datetime(2026, 11, 1, 14, 0, tzinfo=timezone.utc)
    assert due["Offset"] == datetime(2026, 11, 1, 13, 0, tzinfo=timezone.utc)
    # naive 09:00 interpreted as Denver local → 16:00Z (MST, UTC-7 in November)
    denver_tz = datetime(2026, 11, 1, 9, 0, tzinfo=ZoneInfo("America/Denver"))
    assert due["Naive-local"] == denver_tz.astimezone(timezone.utc)


# ── Envelope validation ──────────────────────────────────────────────────────

async def test_import_rejects_unknown_format(client: AsyncClient) -> None:
    await register(client)
    r = await client.post("/api/v1/data/import", json={"format": "something-else", "items": []})
    assert r.status_code == 422
    assert "format" in r.json()["detail"]


async def test_import_rejects_future_version(client: AsyncClient) -> None:
    await register(client)
    r = await client.post("/api/v1/data/import", json={"version": 99, "items": []})
    assert r.status_code == 422
    assert "newer version" in r.json()["detail"]


async def test_import_rejects_non_list_items_and_huge_files(client: AsyncClient) -> None:
    await register(client)
    r = await client.post("/api/v1/data/import", json={"items": "nope"})
    assert r.status_code == 422

    from app.services.backup import MAX_IMPORT_ITEMS

    payload = {"items": [{"kind": "quiz"}] * (MAX_IMPORT_ITEMS + 1)}
    r = await client.post("/api/v1/data/import", json=payload)
    assert r.status_code == 422
    assert "Too many items" in r.json()["detail"]


async def test_import_empty_file_is_a_noop(client: AsyncClient) -> None:
    await register(client)
    report = await _import(client, {"items": []})
    assert report == {"imported": 0, "duplicates": 0, "classes_created": [], "invalid": []}

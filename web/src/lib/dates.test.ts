import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDayLabel, formatDueTime, groupItems, isDateOnly } from "./dates";
import type { Item, ItemKind } from "./types";

function item(kind: ItemKind, id: string, dueAt: string): Item {
  const isAssignment = kind === "assignment";
  return {
    id,
    kind,
    title: `I-${id}`,
    notes: "",
    due_at: dueAt,
    progress: isAssignment ? 0 : null,
    is_priority: false,
    is_complete: false,
    created_at: dueAt,
    updated_at: dueAt,
    class: { id: "c1", name: "Math", color: "#6366f1" },
    links: [],
  };
}

describe("isDateOnly / formatDueTime", () => {
  it("treats 23:59:59 as all-day", () => {
    expect(isDateOnly("2026-08-14T23:59:59")).toBe(true);
    expect(formatDueTime("2026-08-14T23:59:59")).toBe("All day");
  });

  it("renders real times as clock time", () => {
    expect(isDateOnly("2026-08-14T14:30:00")).toBe(false);
    expect(formatDueTime("2026-08-14T14:30:00")).toBe("2:30 PM");
  });
});

describe("groupItems (assignments: overdue group)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:00:00")); // Friday, Aug 14 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups into Overdue, Today, Tomorrow, and later days in order", () => {
    const groups = groupItems([
      item("assignment", "far", "2026-08-17T10:00:00"),
      item("assignment", "overdue1", "2026-08-12T10:00:00"),
      item("assignment", "today", "2026-08-14T09:00:00"),
      item("assignment", "overdue2", "2026-08-13T15:00:00"),
      item("assignment", "tomorrow", "2026-08-15T10:00:00"),
    ]);

    expect(groups.map((g) => g.label)).toEqual(["Overdue", "Today", "Tomorrow", "Monday, Aug 17"]);
    expect(groups[0].isOverdue).toBe(true);
  });

  it("sorts the Overdue group most-recently-due first", () => {
    const groups = groupItems([
      item("assignment", "old", "2026-08-10T10:00:00"),
      item("assignment", "yesterday", "2026-08-13T15:00:00"),
      item("assignment", "older", "2026-08-12T10:00:00"),
    ]);
    expect(groups[0].items.map((a) => a.id)).toEqual(["yesterday", "older", "old"]);
  });

  it("keeps completed assignments in their day position", () => {
    const done: Item = {
      ...item("assignment", "done", "2026-08-14T23:59:59"),
      progress: 100,
      is_complete: true,
    };
    const groups = groupItems([done, item("assignment", "later", "2026-08-14T10:00:00")]);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].items.map((a) => a.id)).toEqual(["later", "done"]);
  });

  it("returns an empty list for no items", () => {
    expect(groupItems([])).toEqual([]);
  });
});

describe("groupItems (quizzes/exams: no overdue group)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels past quiz days by date instead of an Overdue group", () => {
    const groups = groupItems(
      [
        item("quiz", "yesterday", "2026-08-13T09:00:00"),
        item("exam", "last-week", "2026-08-10T09:00:00"),
        item("quiz", "today", "2026-08-14T14:00:00"),
      ],
      { overdueGroup: false },
    );

    expect(groups.map((g) => g.label)).toEqual(["Monday, Aug 10", "Yesterday", "Today"]);
    expect(groups.every((g) => !g.isOverdue)).toBe(true);
  });

  it("sorts items chronologically within a past day", () => {
    const groups = groupItems(
      [item("exam", "pm", "2026-08-13T15:00:00"), item("exam", "am", "2026-08-13T09:00:00")],
      { overdueGroup: false },
    );
    expect(groups[0].items.map((a) => a.id)).toEqual(["am", "pm"]);
  });
});

describe("formatDayLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels today and tomorrow specially", () => {
    expect(formatDayLabel(new Date("2026-08-14T00:00:00"))).toBe("Today");
    expect(formatDayLabel(new Date("2026-08-15T00:00:00"))).toBe("Tomorrow");
  });

  it("formats later days", () => {
    expect(formatDayLabel(new Date("2026-08-17T00:00:00"))).toBe("Monday, Aug 17");
  });
});

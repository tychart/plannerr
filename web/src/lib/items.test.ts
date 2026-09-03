import { describe, expect, it } from "vitest";
import {
  dueAtFromParts,
  formatItemCounts,
  itemsQueryString,
  partsFromDueAt,
  valuesToInput,
} from "./items";

describe("dueAtFromParts / partsFromDueAt round-trip", () => {
  it("round-trips a dated item as all-day (no time)", () => {
    const dueAt = dueAtFromParts("2026-08-20", "");
    expect(partsFromDueAt(dueAt)).toEqual({ date: "2026-08-20", time: "" });
  });

  it("round-trips a dated item with a time", () => {
    const dueAt = dueAtFromParts("2026-08-20", "14:30");
    expect(partsFromDueAt(dueAt)).toEqual({ date: "2026-08-20", time: "14:30" });
  });

  it("produces a UTC ISO string the server can parse", () => {
    const dueAt = dueAtFromParts("2026-08-20", "14:30");
    expect(new Date(dueAt).toISOString()).toBe(dueAt);
  });
});

describe("valuesToInput", () => {
  const base = {
    kind: "assignment" as const,
    title: "  Problem set  ",
    class_id: "c1",
    due_date: "2026-08-20",
    due_time: "",
    progress: 35,
    is_priority: true,
    notes: "notes",
    links: [{ url: "https://example.com/x", label: "" }],
  };

  it("sends progress for assignments and trims/filters fields", () => {
    const input = valuesToInput(base);
    expect(input.kind).toBe("assignment");
    expect(input.title).toBe("Problem set");
    expect(input.progress).toBe(35);
    expect(input.is_priority).toBe(true);
    expect(input.links).toEqual([{ url: "https://example.com/x", label: null }]);
    expect(input.due_at).toBeDefined();
  });

  it("never sends progress for quizzes/exams", () => {
    for (const kind of ["quiz", "exam"] as const) {
      const input = valuesToInput({ ...base, kind });
      expect(input).not.toHaveProperty("progress");
      expect(input.kind).toBe(kind);
    }
  });

  it("drops empty link rows", () => {
    const input = valuesToInput({ ...base, links: [{ url: "  ", label: "" }] });
    expect(input.links).toEqual([]);
  });
});

describe("itemsQueryString", () => {
  it("always sends kind and omits defaults", () => {
    expect(itemsQueryString({ kind: "assignment" })).toBe("kind=assignment");
    expect(itemsQueryString({ kind: "quiz", status: "active", window: "all", order: "asc" })).toBe(
      "kind=quiz",
    );
  });

  it("sends non-default filters and the tz", () => {
    const qs = itemsQueryString({
      kind: "exam",
      q: "  midterm  ",
      class_id: "c1",
      status: "completed",
      window: "upcoming",
      order: "desc",
      limit: 10,
      tz: "America/Denver",
    });
    expect(qs).toContain("kind=exam");
    expect(qs).toContain("q=midterm");
    expect(qs).toContain("class_id=c1");
    expect(qs).toContain("status=completed");
    expect(qs).toContain("window=upcoming");
    expect(qs).toContain("order=desc");
    expect(qs).toContain("limit=10");
    expect(qs).toContain("tz=America%2FDenver");
  });
});

describe("formatItemCounts", () => {
  it("formats per-kind counts with singular/plural nouns", () => {
    expect(formatItemCounts({ assignment: 3, quiz: 1, exam: 2 })).toBe(
      "3 assignments · 1 quiz · 2 exams",
    );
    expect(formatItemCounts({ assignment: 0, quiz: 2, exam: 0 })).toBe("2 quizzes");
    expect(formatItemCounts({ assignment: 0, quiz: 0, exam: 0 })).toBe("0 items");
  });
});

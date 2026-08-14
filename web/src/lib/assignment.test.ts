import { describe, expect, it } from "vitest";
import { dueAtFromParts, partsFromDueAt } from "./assignment";

describe("dueAtFromParts / partsFromDueAt round-trip", () => {
  it("round-trips a dated assignment as all-day (no time)", () => {
    const dueAt = dueAtFromParts("2026-08-20", "");
    expect(partsFromDueAt(dueAt)).toEqual({ date: "2026-08-20", time: "" });
  });

  it("round-trips a dated assignment with a time", () => {
    const dueAt = dueAtFromParts("2026-08-20", "14:30");
    expect(partsFromDueAt(dueAt)).toEqual({ date: "2026-08-20", time: "14:30" });
  });

  it("produces a UTC ISO string the server can parse", () => {
    const dueAt = dueAtFromParts("2026-08-20", "14:30");
    expect(new Date(dueAt).toISOString()).toBe(dueAt);
  });
});

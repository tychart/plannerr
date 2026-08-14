import { describe, expect, it } from "vitest";
import { PROGRESS_STEP, snapProgress } from "./progress";

describe("snapProgress", () => {
  it("snaps to the nearest multiple of 5", () => {
    expect(snapProgress(23)).toBe(25);
    expect(snapProgress(22)).toBe(20);
    expect(snapProgress(57)).toBe(55);
    expect(snapProgress(100)).toBe(100);
  });

  it("clamps to [0, 100]", () => {
    expect(snapProgress(-10)).toBe(0);
    expect(snapProgress(2)).toBe(0);
    expect(snapProgress(98)).toBe(100);
    expect(snapProgress(104)).toBe(100);
  });

  it("matches the server's step constant", () => {
    expect(PROGRESS_STEP).toBe(5);
  });
});

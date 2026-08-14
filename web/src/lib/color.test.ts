import { describe, expect, it } from "vitest";
import { contrastTextColor, parseHex, relativeLuminance } from "./color";

describe("parseHex", () => {
  it("parses #RRGGBB", () => {
    expect(parseHex("#ff0000")).toEqual([255, 0, 0]);
    expect(parseHex("#00ff00")).toEqual([0, 255, 0]);
    expect(parseHex("#0000ff")).toEqual([0, 0, 255]);
  });

  it("accepts a bare RRGGBB", () => {
    expect(parseHex("ffffff")).toEqual([255, 255, 255]);
  });

  it("returns null for invalid input", () => {
    expect(parseHex("red")).toBeNull();
    expect(parseHex("#fff")).toBeNull();
    expect(parseHex("")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("contrastTextColor", () => {
  it("uses white text on dark backgrounds", () => {
    expect(contrastTextColor("#000000")).toBe("#ffffff");
    expect(contrastTextColor("#6366f1")).toBe("#ffffff"); // indigo
    expect(contrastTextColor("#22c55e")).toBe("#000000"); // green-500 is light
  });

  it("uses black text on light backgrounds", () => {
    expect(contrastTextColor("#ffffff")).toBe("#000000");
    expect(contrastTextColor("#f59e0b")).toBe("#000000"); // amber
    expect(contrastTextColor("#fbbf24")).toBe("#000000");
  });
});

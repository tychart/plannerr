import { describe, expect, it } from "vitest";
import { backupFileName, parseBackupText, summarizeReport } from "./backup";
import type { BackupFile, ImportReport } from "./types";

const VALID: BackupFile = {
  format: "plannerr-backup",
  version: 1,
  exported_at: "2026-09-02T12:00:00.000Z",
  classes: [{ name: "Math", color: "#ff0000" }],
  items: [
    {
      kind: "assignment",
      title: "PSet 3",
      notes: "",
      due_at: "2026-09-15T23:59:59.000Z",
      progress: 0,
      is_priority: false,
      class: "Math",
      links: [],
    },
  ],
};

describe("backupFileName", () => {
  it("uses the local date and a stable prefix", () => {
    expect(backupFileName(new Date(2026, 8, 2))).toBe("plannerr-backup-2026-09-02.json");
    expect(backupFileName()).toMatch(/^plannerr-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe("parseBackupText", () => {
  it("parses a valid envelope", () => {
    expect(parseBackupText(JSON.stringify(VALID)).items).toHaveLength(1);
  });

  it("rejects non-JSON text with a friendly error", () => {
    expect(() => parseBackupText("{nope")).toThrow(/isn't valid JSON/);
  });

  it("rejects JSON without an items list", () => {
    expect(() => parseBackupText('{"classes": []}')).toThrow(/items.*list/);
    expect(() => parseBackupText('"just a string"')).toThrow(/items.*list/);
  });
});

describe("summarizeReport", () => {
  it("reports an empty no-op import", () => {
    const empty: ImportReport = { imported: 0, duplicates: 0, classes_created: [], invalid: [] };
    expect(summarizeReport(empty).headline).toMatch(/Nothing to import/);
    expect(summarizeReport(empty).details).toEqual([]);
  });

  it("mentions created classes and duplicate skips", () => {
    const report: ImportReport = {
      imported: 5,
      duplicates: 3,
      classes_created: ["Math", "Art"],
      invalid: [],
    };
    const { headline, details } = summarizeReport(report);
    expect(headline).toBe("5 items imported.");
    expect(details).toContain("Created classes: Math, Art");
    expect(details).toContain("3 items already existed and were left unchanged.");
  });

  it("uses singular nouns and lists skipped rows with 1-based line numbers", () => {
    const report: ImportReport = {
      imported: 1,
      duplicates: 0,
      classes_created: [],
      invalid: [
        { row: 0, reason: "kind must be one of: assignment, quiz, exam" },
        { row: 2, reason: "unrecognized date" },
      ],
    };
    const { headline, details } = summarizeReport(report);
    expect(headline).toBe("1 item imported.");
    expect(details).toContain("2 rows skipped (line numbers start at 1 in your file):");
    expect(details).toContain("Line 1: kind must be one of: assignment, quiz, exam");
    expect(details).toContain("Line 3: unrecognized date");
  });
});

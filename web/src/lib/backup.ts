/** Backup & transfer helpers: file download, parsing, and report summaries. */

import { format } from "date-fns";
import type { BackupFile, ImportReport } from "./types";

/** "plannerr-backup-2026-09-02.json" (local date). */
export function backupFileName(date: Date = new Date()): string {
  return `plannerr-backup-${format(date, "yyyy-MM-dd")}.json`;
}

/** Download a backup file as a pretty-printed JSON file. */
export function downloadBackup(data: BackupFile, fileName: string = backupFileName()): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Parse a picked file's text into a backup envelope. Only a light structural
 *  check happens here — the server validates every row and reports problems. */
export function parseBackupText(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON — check it and try again.");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as BackupFile).items)
  ) {
    throw new Error('Not a Plannerr backup file — expected a JSON object with an "items" list.');
  }
  return parsed as BackupFile;
}

function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : pluralNoun}`;
}

/** Human-readable summary of an import report, for the Settings UI. */
export function summarizeReport(report: ImportReport): { headline: string; details: string[] } {
  const details: string[] = [];

  if (report.classes_created.length > 0) {
    details.push(
      `Created class${report.classes_created.length === 1 ? "" : "es"}: ${report.classes_created.join(", ")}`,
    );
  }

  if (report.duplicates > 0) {
    details.push(`${plural(report.duplicates, "item")} already existed and were left unchanged.`);
  }

  if (report.invalid.length > 0) {
    const shown = report.invalid.slice(0, 10);
    details.push(
      `${plural(report.invalid.length, "row")} skipped (line numbers start at 1 in your file):`,
    );
    for (const err of shown) {
      details.push(`Line ${err.row + 1}: ${err.reason}`);
    }
    if (report.invalid.length > shown.length) {
      details.push(`…and ${report.invalid.length - shown.length} more.`);
    }
  }

  const headline =
    report.imported === 0 && details.length === 0
      ? "Nothing to import — the file is empty."
      : `${plural(report.imported, "item")} imported.`;
  return { headline, details };
}

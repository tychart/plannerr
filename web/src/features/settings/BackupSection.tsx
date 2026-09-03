import { useRef, useState } from "react";
import { CheckCircle2, Database, Download, Upload } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { api } from "../../lib/api";
import { backupFileName, downloadBackup, parseBackupText, summarizeReport } from "../../lib/backup";
import { localTimezone } from "../../lib/items";
import type { BackupFile, ImportReport } from "../../lib/types";

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong — please try again.";
}

/** Settings section: export everything as a JSON file, or import one back
 *  (local backup, transfer to another account, or hand-written bulk add). */
export function BackupSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportedName, setExportedName] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    setExportedName(null);
    try {
      const data = await api.get<BackupFile>("/data/export");
      const name = backupFileName();
      downloadBackup(data, name);
      setExportedName(name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  async function handleFile(file: File) {
    setImporting(true);
    setError(null);
    setReport(null);
    try {
      const text = await file.text();
      const payload = parseBackupText(text);
      const tz = localTimezone();
      const result = await api.post<ImportReport>(
        `/data/import?tz=${encodeURIComponent(tz)}`,
        payload,
      );
      setReport(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setImporting(false);
      // Allow picking the same file again for another import.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const summary = report ? summarizeReport(report) : null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Database className="h-4 w-4 text-primary" />
        Backup &amp; restore
      </h2>
      <p className="mt-1 text-sm text-muted">
        Download everything you have — classes, assignments, quizzes, and exams — as a JSON file.
        Use it as a local backup, move it to another account, or write your own file to bulk-add
        items (each row needs a kind, title, class name, and a date; everything else is optional).
        Importing adds new items and never deletes anything: rows you already have (same kind,
        class, name, and date) are skipped.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleExport()}
          disabled={exporting}
        >
          {exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          Download backup
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
          {importing ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          Import from file
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {exportedName && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          Downloaded {exportedName}
        </p>
      )}

      {summary && report && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
          <p className="font-medium text-foreground">{summary.headline}</p>
          {summary.details.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-muted">
              {summary.details.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

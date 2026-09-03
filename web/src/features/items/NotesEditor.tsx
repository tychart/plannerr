import { cn } from "../../lib/cn";

interface NotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function NotesEditor({ value, onChange, className }: NotesEditorProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Notes (markdown supported: **bold**, *italic*, - lists, [links](https://…))"
        className="min-h-24 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

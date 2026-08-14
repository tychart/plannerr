import { ClipboardList, Plus } from "lucide-react";
import { Button } from "./ui/Button";

interface EmptyStateProps {
  onAdd: () => void;
}

/** Friendly guided empty state shown when a user has no assignments. */
export function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
      <ClipboardList className="h-10 w-10 text-muted" />
      <div>
        <p className="font-medium text-foreground">No assignments yet</p>
        <p className="mt-1 text-sm text-muted">
          Add your first assignment — pick a class, set a due date, and you’re off.
        </p>
      </div>
      <Button onClick={onAdd} className="mt-2">
        <Plus className="h-4 w-4" /> New assignment
      </Button>
    </div>
  );
}

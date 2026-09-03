import { ClipboardList, Plus, SearchX } from "lucide-react";
import type { ItemKind } from "../lib/types";
import { KIND_PLURAL_LABELS } from "../lib/items";
import { Button } from "./ui/Button";

interface EmptyStateProps {
  kind: ItemKind;
  onAdd: () => void;
  /** When set, filters produced no results — offer to clear them. */
  filterActive?: boolean;
  onClearFilters?: () => void;
}

const COPY: Record<ItemKind, { title: string; body: string; action: string }> = {
  assignment: {
    title: "No assignments yet",
    body: "Add your first assignment — pick a class, set a due date, and you’re off.",
    action: "New assignment",
  },
  quiz: {
    title: "No quizzes yet",
    body: "Quizzes are dated events for a class — add one and it appears in Upcoming.",
    action: "New quiz",
  },
  exam: {
    title: "No exams yet",
    body: "Exams are dated events for a class — add one and it appears in Upcoming.",
    action: "New exam",
  },
};

/** Friendly guided empty state — used by every library page and Home. */
export function EmptyState({ kind, onAdd, filterActive = false, onClearFilters }: EmptyStateProps) {
  const copy = COPY[kind];

  if (filterActive) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
        <SearchX className="h-10 w-10 text-muted" />
        <div>
          <p className="font-medium text-foreground">
            No {KIND_PLURAL_LABELS[kind].toLowerCase()} match
          </p>
          <p className="mt-1 text-sm text-muted">Try a different search or loosen the filters.</p>
        </div>
        {onClearFilters && (
          <Button variant="secondary" onClick={onClearFilters} className="mt-2">
            Clear filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
      <ClipboardList className="h-10 w-10 text-muted" />
      <div>
        <p className="font-medium text-foreground">{copy.title}</p>
        <p className="mt-1 text-sm text-muted">{copy.body}</p>
      </div>
      <Button onClick={onAdd} className="mt-2">
        <Plus className="h-4 w-4" /> {copy.action}
      </Button>
    </div>
  );
}

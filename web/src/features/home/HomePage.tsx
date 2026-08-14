import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/ui/Spinner";
import { Switch } from "../../components/ui/Switch";
import { cn } from "../../lib/cn";
import { groupAssignments } from "../../lib/dates";
import type { Assignment } from "../../lib/types";
import { AssignmentCard } from "../assignments/AssignmentCard";
import { AssignmentDialog } from "../assignments/AssignmentDialog";
import { useAssignments } from "../assignments/useAssignments";

export function HomePage() {
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [defaults, setDefaults] = useState<{ classId?: string }>({});

  const query = useAssignments(includeCompleted);
  const assignments = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const groups = useMemo(() => groupAssignments(assignments), [assignments]);

  // Infinite scroll: load the next page when the sentinel becomes visible.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function openNew() {
    setEditing(null);
    setDefaults({});
    setDialogOpen(true);
  }

  function openEdit(assignment: Assignment) {
    setEditing(assignment);
    setDefaults({});
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Assignments</h1>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted">
        <Switch
          checked={includeCompleted}
          onCheckedChange={setIncludeCompleted}
          aria-label="Show completed"
        />
        Show completed
      </label>

      {query.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState onAdd={openNew} />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className="mb-2 flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-sm font-semibold uppercase tracking-wide",
                    group.isOverdue ? "text-danger" : "text-muted",
                  )}
                >
                  {group.label}
                </span>
                <span className="text-xs text-muted">{group.items.length}</span>
              </h2>
              <ul className="space-y-2">
                {group.items.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    onOpen={() => openEdit(assignment)}
                  />
                ))}
              </ul>
            </section>
          ))}

          <div
            ref={sentinelRef}
            className="flex h-10 items-center justify-center text-xs text-muted"
          >
            {isFetchingNextPage ? (
              <Spinner />
            ) : hasNextPage ? (
              "Scroll for more…"
            ) : (
              "You’re all caught up 🎉"
            )}
          </div>
        </div>
      )}

      <AssignmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        defaults={defaults}
      />
    </div>
  );
}

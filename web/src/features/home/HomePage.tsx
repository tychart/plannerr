import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/ui/Spinner";
import { cn } from "../../lib/cn";
import { groupItems } from "../../lib/dates";
import type { Item } from "../../lib/types";
import { AssignmentCard } from "../items/AssignmentCard";
import { ItemDialog } from "../items/ItemDialog";
import { LazyItemViewDialog } from "../items/LazyItemViewDialog";
import { useItems } from "../items/useItems";
import { UpcomingSection } from "./UpcomingSection";

/** Home dashboard: the week's active assignments take the bulk of the space;
 *  a sidebar shows upcoming quizzes and exams in their own sections. */
export function HomePage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<Item | null>(null);

  // Overdue + the next 7 days of ACTIVE assignments (window "horizon"), as one
  // page. Completed and older items live on the Assignments page.
  const query = useItems({ kind: "assignment", window: "horizon" });
  const assignments = useMemo(() => query.data?.pages[0]?.items ?? [], [query.data]);
  const groups = useMemo(() => groupItems(assignments), [assignments]);

  function openNew() {
    setDialogOpen(true);
  }

  function openView(item: Item) {
    setViewing(item);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Home</h1>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4" /> New assignment
        </Button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6">
        {/* Main column: the week's assignments (bulk of the space). */}
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Assignments
            </h2>
            <Link
              to="/assignments"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {query.isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : groups.length === 0 ? (
            <EmptyState kind="assignment" onAdd={openNew} />
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <h3 className="mb-2 flex items-baseline gap-2">
                    <span
                      className={cn(
                        "text-sm font-semibold uppercase tracking-wide",
                        group.isOverdue ? "text-danger" : "text-muted",
                      )}
                    >
                      {group.label}
                    </span>
                    <span className="text-xs text-muted">{group.items.length}</span>
                  </h3>
                  <ul className="space-y-2">
                    {group.items.map((item) => (
                      <AssignmentCard key={item.id} item={item} onOpen={() => openView(item)} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: upcoming quizzes and exams (above the list on mobile). */}
        <aside className="order-first space-y-6 lg:order-none lg:sticky lg:top-20">
          <UpcomingSection kind="quiz" />
          <UpcomingSection kind="exam" />
        </aside>
      </div>

      <ItemDialog open={dialogOpen} onOpenChange={setDialogOpen} kind="assignment" />
      <LazyItemViewDialog
        item={viewing}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CalendarDays, CheckCircle2, Clock, ExternalLink, Flag } from "lucide-react";
import { ClassBadge } from "../../components/ClassBadge";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { KIND_LABELS, itemDueLabel, kindRoute } from "../../lib/items";
import type { Item } from "../../lib/types";
import { LinksView } from "./ItemLinks";
import { NotesView } from "./NotesView";
import { ProgressSlider } from "./ProgressSlider";
import { useUpdateItem } from "./useItems";

interface ItemDetailsProps {
  item: Item;
  onEdit?: () => void;
  showOpenLink?: boolean;
}

/** Read-only item view shared by the view popup and full detail routes. */
export function ItemDetails({ item, onEdit, showOpenLink = false }: ItemDetailsProps) {
  const kindLabel = KIND_LABELS[item.kind];
  const isAssignment = item.kind === "assignment";
  const updateItem = useUpdateItem();
  const [progress, setProgress] = useState(item.progress ?? 0);

  useEffect(() => {
    setProgress(item.progress ?? 0);
  }, [item.progress]);

  function commitProgress(value: number) {
    setProgress(value);
    void updateItem.mutateAsync({ id: item.id, progress: value });
  }

  const complete = progress === 100;

  return (
    <article className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                {kindLabel}
              </span>
              <ClassBadge name={item.class.name} color={item.class.color} />
              {item.is_priority && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-foreground">
                  <Flag className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
                  Priority
                </span>
              )}
            </div>
            <h1 className="text-balance text-2xl font-semibold text-foreground">{item.title}</h1>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {showOpenLink && (
              <Link
                to={`/${kindRoute(item.kind)}/${item.id}`}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-surface-2 px-3 text-sm font-medium text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open
              </Link>
            )}
            {onEdit && (
              <Button size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {isAssignment ? "Due" : "Date"}
            </p>
            <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-foreground">
              {isAssignment ? (
                <Clock className="h-4 w-4 text-muted" aria-hidden />
              ) : (
                <CalendarDays className="h-4 w-4 text-muted" aria-hidden />
              )}
              {itemDueLabel(item)}
            </p>
          </div>

          {isAssignment && (
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Progress</p>
                {complete && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Complete
                  </span>
                )}
              </div>
              <div className="mt-2">
                <ProgressSlider
                  value={progress}
                  onCommit={commitProgress}
                  disabled={updateItem.isPending}
                />
              </div>
              <p className={cn("mt-1 text-xs text-muted", complete && "text-success")}>
                Drag to update progress without opening edit mode.
              </p>
            </div>
          )}
        </div>
      </header>

      <section className="space-y-2 rounded-2xl border border-border bg-surface/60 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Notes</h2>
        <NotesView notes={item.notes} />
      </section>

      {item.links.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-border bg-surface/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Links</h2>
          <LinksView links={item.links} />
        </section>
      )}
    </article>
  );
}

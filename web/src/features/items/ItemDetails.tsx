import { Link } from "react-router";
import { CalendarDays, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { itemDueLabel, kindRoute } from "../../lib/items";
import type { Item } from "../../lib/types";
import { ItemChips } from "./ItemChips";
import { LinksView } from "./ItemLinks";
import { NotesView } from "./NotesView";
import { ProgressSlider } from "./ProgressSlider";
import { useItemProgress } from "./useItemProgress";

interface ItemDetailsProps {
  item: Item;
  onEdit?: () => void;
  showOpenLink?: boolean;
}

/** Read-only item view shared by the view popup and full detail routes. */
export function ItemDetails({ item, onEdit, showOpenLink = false }: ItemDetailsProps) {
  const isAssignment = item.kind === "assignment";
  const { progress, commit, complete, isPending } = useItemProgress(item);

  return (
    <article className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ItemChips item={item} />
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
                <ProgressSlider value={progress} onCommit={commit} disabled={isPending} />
              </div>
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

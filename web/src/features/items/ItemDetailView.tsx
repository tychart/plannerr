import type { ReactNode } from "react";
import { CalendarDays, CheckCircle2, Clock, Pencil, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { KIND_LABELS, itemDueLabel } from "../../lib/items";
import type { Item } from "../../lib/types";
import { ItemChips } from "./ItemChips";
import { LinksView } from "./ItemLinks";
import { NotesView } from "./NotesView";
import { ProgressSlider } from "./ProgressSlider";
import { useItemProgress } from "./useItemProgress";

interface ItemDetailViewProps {
  item: Item;
  /** True while a delete is in flight — disables the edit/delete actions. */
  busy?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/** One labeled block used both in the mobile meta strip and the desktop rail. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {hint}
      </div>
      {children}
    </div>
  );
}

/** Focus-mode detail layout for /assignments|quizzes|exams/:id.
 *
 *  Below `md` (narrow phones) the item's meta collapses into a compact strip
 *  right under the title and the page scrolls normally. From `md` up the page
 *  becomes a two-column grid: the title + notes own the page scroll in the
 *  left column while a sticky "properties rail" on the right keeps the
 *  kind/class chips, due date, progress, links, and actions in view no matter
 *  how long the notes get. The rail is narrower (16rem) until `xl`, then
 *  widens to 18rem. */
export function ItemDetailView({ item, busy = false, onEdit, onDelete }: ItemDetailViewProps) {
  const isAssignment = item.kind === "assignment";
  const { progress, commit, complete, isPending } = useItemProgress(item);
  const hasLinks = item.links.length > 0;

  const chips = <ItemChips item={item} />;

  const dueField = (
    <Field label={isAssignment ? "Due" : "Date"}>
      <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
        {isAssignment ? (
          <Clock className="h-4 w-4 text-muted" aria-hidden />
        ) : (
          <CalendarDays className="h-4 w-4 text-muted" aria-hidden />
        )}
        {itemDueLabel(item)}
      </p>
    </Field>
  );

  const progressField = isAssignment ? (
    <Field
      label="Progress"
      hint={
        complete && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Complete
          </span>
        )
      }
    >
      <ProgressSlider value={progress} onCommit={commit} disabled={isPending} />
    </Field>
  ) : null;

  const linksField = hasLinks ? (
    <Field label="Links">
      <LinksView links={item.links} />
    </Field>
  ) : null;

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_16rem] md:items-start md:gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
      {/* Reading column: title + notes scroll the whole page. */}
      <div className="min-w-0 space-y-5">
        <h1 className="text-balance text-2xl font-semibold text-foreground">{item.title}</h1>

        {/* Mobile: one compact meta strip right under the title (rail is md+). */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface md:hidden">
          <div className="flex flex-wrap items-center gap-2 p-4">{chips}</div>
          <div className="space-y-4 border-t border-border p-4">
            {dueField}
            {progressField}
            {linksField}
          </div>
        </div>

        <section className="space-y-2 rounded-2xl border border-border bg-surface/60 p-4 sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Notes</h2>
          <NotesView notes={item.notes} />
        </section>
      </div>

      {/* Desktop rail: <aside> itself is the sticky grid item (it must be the
          grid item — not a wrapper inside it — so it sticks within the full
          height of its grid row while the notes scroll). It pins below the
          app header, keeping due/progress/class/links in view. */}
      <aside className="hidden md:sticky md:top-20 md:block">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            {chips}
          </div>
          <div className="space-y-4 p-4">
            {dueField}
            {progressField}
            {linksField}
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" onClick={onEdit} disabled={busy}>
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={busy}
            aria-label={`Delete ${KIND_LABELS[item.kind].toLowerCase()}`}
          >
            <Trash2 className="h-4 w-4 text-danger" aria-hidden />
          </Button>
        </div>
      </aside>
    </div>
  );
}

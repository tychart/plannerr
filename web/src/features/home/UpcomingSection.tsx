import { useState } from "react";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { KIND_LABELS, kindRoute } from "../../lib/items";
import type { Item, ItemKind } from "../../lib/types";
import { ItemDialog } from "../items/ItemDialog";
import { ItemRow } from "../items/ItemRow";
import { LazyItemViewDialog } from "../items/LazyItemViewDialog";
import { useItems } from "../items/useItems";

interface UpcomingSectionProps {
  kind: ItemKind;
}

/** One "Upcoming <quizzes|exams>" sidebar section: up to 10 items from today
 *  onward (the server drops anything whose day already ended), a quick-add "+",
 *  and a link through to the full library page. */
export function UpcomingSection({ kind }: UpcomingSectionProps) {
  const query = useItems({ kind, window: "upcoming", limit: 10 });
  const items = query.data?.pages[0]?.items ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<Item | null>(null);

  const plural = kind === "quiz" ? "Quizzes" : "Exams";
  const loading = query.isLoading;

  return (
    <section aria-label={`Upcoming ${plural.toLowerCase()}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Upcoming {plural.toLowerCase()}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`New ${kind}`}
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
          Nothing scheduled — add a {KIND_LABELS[kind].toLowerCase()} and it shows up here.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} onOpen={() => setViewing(item)} />
            ))}
          </ul>
          <Link
            to={`/${kindRoute(kind)}`}
            className="mt-2 block text-center text-xs font-medium text-primary hover:underline"
          >
            See all {plural.toLowerCase()} →
          </Link>
        </>
      )}

      <ItemDialog open={dialogOpen} onOpenChange={setDialogOpen} kind={kind} />
      <LazyItemViewDialog
        item={viewing}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      />
    </section>
  );
}

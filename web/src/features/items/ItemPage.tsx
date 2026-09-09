import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { KIND_LABELS, KIND_PLURAL_LABELS, kindRoute } from "../../lib/items";
import { ItemDetailView } from "./ItemDetailView";
import { ItemDialog } from "./ItemDialog";
import { useDeleteItem, useItem } from "./useItems";

/** Focus-mode detail page for any item kind — /assignments/:id, /quizzes/:id,
 *  /exams/:id all render this same component. */
export function ItemPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: item, isLoading, isError } = useItem(id);
  const deleteItem = useDeleteItem();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function handleDelete() {
    if (!item) return;
    if (!window.confirm(`Delete “${item.title}”?`)) return;
    setBusy(true);
    try {
      await deleteItem.mutateAsync(id);
      navigate(`/${kindRoute(item.kind)}`);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (isError || !item) {
    return (
      <p className="text-danger">
        Item not found.{" "}
        <Link to="/" className="text-primary hover:underline">
          Back to Home
        </Link>
      </p>
    );
  }

  const kindLabel = KIND_LABELS[item.kind];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/${kindRoute(item.kind)}`}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {KIND_PLURAL_LABELS[item.kind].toLowerCase()}
        </Link>
        {/* On phones the edit/delete actions live here; from md+ they move into
            the sticky rail rendered by ItemDetailView. */}
        <div className="flex items-center gap-2 md:hidden">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)} disabled={busy}>
            <Pencil className="h-4 w-4" aria-hidden /> Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={busy}
            aria-label={`Delete ${kindLabel.toLowerCase()}`}
          >
            <Trash2 className="h-4 w-4 text-danger" aria-hidden />
          </Button>
        </div>
      </div>

      <ItemDetailView
        item={item}
        busy={busy}
        onEdit={() => setEditOpen(true)}
        onDelete={() => void handleDelete()}
      />
      <ItemDialog open={editOpen} onOpenChange={setEditOpen} initial={item} kind={item.kind} />
    </div>
  );
}

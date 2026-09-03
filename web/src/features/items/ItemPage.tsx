import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import { ClassBadge } from "../../components/ClassBadge";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { formatDueTime } from "../../lib/dates";
import type { ItemFormValues } from "../../lib/items";
import { KIND_LABELS, KIND_PLURAL_LABELS, kindRoute, valuesToInput } from "../../lib/items";
import type { SubmitAction } from "./ItemForm";
import { ItemForm } from "./ItemForm";
import { useDeleteItem, useItem, useUpdateItem } from "./useItems";

/** Focus-mode detail page for any item kind — /assignments/:id, /quizzes/:id,
 *  /exams/:id all render this same component. */
export function ItemPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: item, isLoading, isError } = useItem(id);
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: ItemFormValues, _action: SubmitAction) {
    setBusy(true);
    setError(null);
    try {
      await updateItem.mutateAsync({ id, ...valuesToInput(values) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

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
  const dueLabel = formatDueTime(item.due_at);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to={`/${kindRoute(item.kind)}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {KIND_PLURAL_LABELS[item.kind].toLowerCase()}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-xl font-semibold text-foreground">{item.title}</h1>
          <ClassBadge name={item.class.name} color={item.class.color} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {item.kind === "assignment" ? "Due " : ""}
            {dueLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={busy}
            aria-label={`Delete ${kindLabel.toLowerCase()}`}
          >
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      </div>

      <ItemForm
        key={item.id}
        kind={item.kind}
        mode="edit"
        initial={item}
        busy={busy}
        error={error}
        onSubmit={handleSubmit}
        showNotesPreview
      />
    </div>
  );
}

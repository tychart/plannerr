import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ClassBadge } from "../../components/ClassBadge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { formatItemCounts } from "../../lib/items";
import type { ClassItem } from "../../lib/types";
import { ClassDeleteDialog } from "./ClassDeleteDialog";
import { ClassForm } from "./ClassForm";
import { useClasses, useCreateClass, useUpdateClass } from "./useClasses";

/** Class manager, hosted in Settings → Classes. Everything from the old
 *  top-level page is here: create/edit/delete with colors, per-kind counts,
 *  and the delete-preview + transfer dialog. */
export function ClassConfigPage() {
  const { data: classes, isLoading, isError } = useClasses();
  const createClass = useCreateClass();
  const updateClass = useUpdateClass();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [deleting, setDeleting] = useState<ClassItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate(values: { name: string; color: string }) {
    setFormError(null);
    setBusy(true);
    try {
      await createClass.mutateAsync(values);
      setAdding(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create class");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(values: { name: string; color: string }) {
    if (!editing) return;
    setFormError(null);
    setBusy(true);
    try {
      await updateClass.mutateAsync({ id: editing.id, ...values });
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save class");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Classes</h2>
          <p className="mt-1 max-w-md text-sm text-muted">
            Each class carries a color so you can spot its items at a glance. Deleting a class
            previews what it holds and can move everything to another class first.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setFormError(null);
            setAdding((v) => !v);
          }}
        >
          <Plus className="h-4 w-4" />
          Add class
        </Button>
      </div>

      {adding && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <ClassForm
            submitLabel="Create class"
            busy={busy}
            error={formError}
            onSubmit={handleCreate}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : isError ? (
        <p className="text-danger">Failed to load classes.</p>
      ) : (
        <ul className="space-y-2">
          {(classes ?? []).map((cls) => (
            <li
              key={cls.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3"
            >
              <ClassBadge name={cls.name} color={cls.color} />
              <span className="text-sm text-muted">{formatItemCounts(cls.counts)}</span>
              <div className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${cls.name}`}
                  onClick={() => {
                    setFormError(null);
                    setEditing(cls);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${cls.name}`}
                  onClick={() => setDeleting(cls)}
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit class"
      >
        {editing && (
          <ClassForm
            key={editing.id}
            initialName={editing.name}
            initialColor={editing.color}
            submitLabel="Save changes"
            busy={busy}
            error={formError}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ClassDeleteDialog
        cls={deleting}
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      />
    </div>
  );
}

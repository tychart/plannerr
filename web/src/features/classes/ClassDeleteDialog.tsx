import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import type { ClassItem } from "../../lib/types";
import { useClasses, useDeleteClass, useDeletePreview } from "./useClasses";

interface ClassDeleteDialogProps {
  cls: ClassItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Confirm-delete dialog: lists affected assignments and offers transfer. */
export function ClassDeleteDialog({ cls, open, onOpenChange }: ClassDeleteDialogProps) {
  const { data: preview, isLoading } = useDeletePreview(cls?.id ?? null);
  const { data: classes } = useClasses();
  const deleteClass = useDeleteClass();
  const [transferTo, setTransferTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTransferTo("");
      setError(null);
    }
  }, [open, cls?.id]);

  if (!cls) return null;
  const target = cls;

  const others = (classes ?? []).filter((c) => c.id !== target.id);

  async function confirm() {
    setError(null);
    try {
      await deleteClass.mutateAsync({ id: target.id, transferToClassId: transferTo || undefined });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete class");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete “${target.name}”?`}
      description="This permanently deletes the class and, unless transferred, its assignments."
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : preview && preview.assignment_count > 0 ? (
          <>
            <p className="text-sm text-muted">
              {preview.assignment_count} assignment{preview.assignment_count === 1 ? "" : "s"} will be
              deleted:
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-3 text-sm">
              {preview.assignments.map((a) => (
                <li key={a.id} className="truncate text-foreground">
                  {a.title}
                </li>
              ))}
              {preview.assignment_count > preview.assignments.length && (
                <li className="text-muted">
                  …and {preview.assignment_count - preview.assignments.length} more
                </li>
              )}
            </ul>
            {others.length > 0 && (
              <div className="space-y-1.5">
                <label htmlFor="transfer-to" className="block text-sm font-medium text-foreground">
                  Or transfer assignments to another class
                </label>
                <Select
                  id="transfer-to"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                >
                  <option value="">— Delete them all —</option>
                  {others.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            This class has no assignments, so nothing else will be deleted.
          </p>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirm()} disabled={deleteClass.isPending || isLoading}>
            {transferTo ? "Transfer & delete" : "Delete class"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

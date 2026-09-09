import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Modal } from "../../components/ui/Modal";
import type { ItemFormDefaults, ItemFormValues } from "../../lib/items";
import { KIND_LABELS, kindRoute, valuesToInput } from "../../lib/items";
import type { Item, ItemKind } from "../../lib/types";
import type { SubmitAction } from "./ItemForm";
import { ItemForm } from "./ItemForm";
import { useCreateItem, useUpdateItem } from "./useItems";

interface ItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this item instead of creating. */
  initial?: Item | null;
  /** Kind preset for quick-add (used by Home/library "+ New"). */
  kind?: ItemKind;
  /** Quick-add defaults (used after choosing a class/date). */
  defaults?: ItemFormDefaults;
}

/** Modal for quick-add and quick-edit, shared by Home and the library pages. */
export function ItemDialog({ open, onOpenChange, initial, kind, defaults }: ItemDialogProps) {
  const navigate = useNavigate();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();

  const activeKind: ItemKind = initial?.kind ?? kind ?? "assignment";

  const [formKey, setFormKey] = useState(0);
  const [quickDefaults, setQuickDefaults] = useState<ItemFormDefaults>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form each time the dialog opens or targets a new item.
  useEffect(() => {
    if (open) {
      setBusy(false);
      setError(null);
      setQuickDefaults({});
      setFormKey((k) => k + 1);
    }
  }, [open, initial?.id, activeKind]);

  async function handleSubmit(values: ItemFormValues, action: SubmitAction) {
    setBusy(true);
    setError(null);
    try {
      if (initial) {
        await updateItem.mutateAsync({ id: initial.id, ...valuesToInput(values) });
        onOpenChange(false);
        return;
      }

      const created = await createItem.mutateAsync(valuesToInput(values));
      if (action === "open") {
        onOpenChange(false);
        navigate(`/${kindRoute(created.kind)}/${created.id}`);
      } else if (action === "another-class") {
        setQuickDefaults({ classId: values.class_id });
        setFormKey((k) => k + 1);
      } else if (action === "another-date") {
        setQuickDefaults({ classId: values.class_id, dueDate: values.due_date });
        setFormKey((k) => k + 1);
      } else if (action === "another-date-time") {
        setQuickDefaults({
          classId: values.class_id,
          dueDate: values.due_date,
          dueTime: values.due_time,
        });
        setFormKey((k) => k + 1);
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setBusy(false);
    }
  }

  const title = initial
    ? `Edit ${KIND_LABELS[activeKind].toLowerCase()}`
    : `New ${KIND_LABELS[activeKind].toLowerCase()}`;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} className="max-w-lg">
      <ItemForm
        key={`${formKey}-${initial?.id ?? activeKind}`}
        kind={activeKind}
        mode={initial ? "edit" : "create"}
        initial={initial}
        defaultClassId={defaults?.classId ?? quickDefaults.classId}
        defaultDueDate={defaults?.dueDate ?? quickDefaults.dueDate}
        defaultDueTime={defaults?.dueTime ?? quickDefaults.dueTime}
        busy={busy}
        error={error}
        onSubmit={handleSubmit}
        onCancel={() => onOpenChange(false)}
      />
    </Modal>
  );
}

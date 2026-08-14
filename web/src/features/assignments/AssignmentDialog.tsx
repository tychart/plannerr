import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Modal } from "../../components/ui/Modal";
import type { AssignmentFormValues } from "../../lib/assignment";
import type { SubmitAction } from "./AssignmentForm";
import { AssignmentForm } from "./AssignmentForm";
import { valuesToInput } from "../../lib/assignment";
import type { Assignment } from "../../lib/types";
import { useCreateAssignment, useUpdateAssignment } from "./useAssignments";

interface AssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this assignment instead of creating. */
  initial?: Assignment | null;
  /** Quick-add defaults (used by Home's "+ New" after choosing a class). */
  defaults?: { classId?: string; dueDate?: string };
}

/** Modal for quick-add (Home) and quick-edit (card click). */
export function AssignmentDialog({ open, onOpenChange, initial, defaults }: AssignmentDialogProps) {
  const navigate = useNavigate();
  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();

  const [formKey, setFormKey] = useState(0);
  const [quickDefaults, setQuickDefaults] = useState<{ classId?: string; dueDate?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form each time the dialog opens or targets a new assignment.
  useEffect(() => {
    if (open) {
      setBusy(false);
      setError(null);
      setQuickDefaults({});
      setFormKey((k) => k + 1);
    }
  }, [open, initial?.id]);

  async function handleSubmit(values: AssignmentFormValues, action: SubmitAction) {
    setBusy(true);
    setError(null);
    try {
      if (initial) {
        await updateAssignment.mutateAsync({ id: initial.id, ...valuesToInput(values) });
        onOpenChange(false);
        return;
      }

      const created = await createAssignment.mutateAsync(valuesToInput(values));
      if (action === "open") {
        onOpenChange(false);
        navigate(`/assignments/${created.id}`);
      } else if (action === "another-class") {
        setQuickDefaults({ classId: values.class_id });
        setFormKey((k) => k + 1);
      } else if (action === "another-date") {
        setQuickDefaults({ classId: values.class_id, dueDate: values.due_date });
        setFormKey((k) => k + 1);
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save assignment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit assignment" : "New assignment"}
      className="max-w-lg"
    >
      <AssignmentForm
        key={`${formKey}-${initial?.id ?? "new"}`}
        mode={initial ? "edit" : "create"}
        initial={initial}
        defaultClassId={defaults?.classId ?? quickDefaults.classId}
        defaultDueDate={defaults?.dueDate ?? quickDefaults.dueDate}
        busy={busy}
        error={error}
        onSubmit={handleSubmit}
        onCancel={() => onOpenChange(false)}
      />
    </Modal>
  );
}

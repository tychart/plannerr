import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import { ClassBadge } from "../../components/ClassBadge";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { valuesToInput } from "../../lib/assignment";
import { formatDueTime } from "../../lib/dates";
import type { AssignmentFormValues } from "../../lib/assignment";
import type { SubmitAction } from "./AssignmentForm";
import { AssignmentForm } from "./AssignmentForm";
import { useAssignment, useDeleteAssignment, useUpdateAssignment } from "./useAssignments";

/** Full assignment page — the "focus mode" for a complex assignment. */
export function AssignmentPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: assignment, isLoading, isError } = useAssignment(id);
  const updateAssignment = useUpdateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: AssignmentFormValues, _action: SubmitAction) {
    setBusy(true);
    setError(null);
    try {
      await updateAssignment.mutateAsync({ id, ...valuesToInput(values) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save assignment");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!assignment) return;
    if (!window.confirm(`Delete “${assignment.title}”?`)) return;
    setBusy(true);
    try {
      await deleteAssignment.mutateAsync(id);
      navigate("/");
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
  if (isError || !assignment) {
    return (
      <p className="text-danger">
        Assignment not found.{" "}
        <Link to="/" className="text-primary hover:underline">
          Back to assignments
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to assignments
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-xl font-semibold text-foreground">{assignment.title}</h1>
          <ClassBadge name={assignment.class.name} color={assignment.class.color} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">Due {formatDueTime(assignment.due_at)}</span>
          <Button variant="ghost" size="sm" onClick={() => void handleDelete()} disabled={busy} aria-label="Delete assignment">
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      </div>

      <AssignmentForm
        key={assignment.id}
        mode="edit"
        initial={assignment}
        busy={busy}
        error={error}
        onSubmit={handleSubmit}
        showNotesPreview
      />
    </div>
  );
}

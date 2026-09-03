import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Flag } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatDueTime } from "../../lib/dates";
import type { Assignment } from "../../lib/types";
import { ProgressSlider } from "./ProgressSlider";
import { useUpdateAssignment } from "./useAssignments";

interface AssignmentCardProps {
  assignment: Assignment;
  onOpen: () => void;
}

export function AssignmentCard({ assignment, onOpen }: AssignmentCardProps) {
  const updateAssignment = useUpdateAssignment();
  const [progress, setProgress] = useState(assignment.progress);

  // Resync local progress when the refetched server value arrives.
  useEffect(() => {
    setProgress(assignment.progress);
  }, [assignment.progress]);

  const complete = progress === 100;

  function commitProgress(value: number) {
    setProgress(value);
    void updateAssignment.mutateAsync({ id: assignment.id, progress: value });
  }

  return (
    <li>
      <div
        className="group flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-2/60"
        onClick={onOpen}
      >
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: assignment.class.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-sm font-medium text-foreground",
                complete && "text-muted line-through",
              )}
            >
              {assignment.title}
            </span>
            {assignment.is_priority && (
              <Flag className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" aria-label="Priority" />
            )}
            {complete && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Complete" />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDueTime(assignment.due_at)}
            </span>
            <span className="truncate">{assignment.class.name}</span>
          </div>
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <ProgressSlider value={progress} onCommit={commitProgress} />
          </div>
        </div>
      </div>
    </li>
  );
}

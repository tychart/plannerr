import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Flag } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatDueTime } from "../../lib/dates";
import type { Item } from "../../lib/types";
import { ProgressSlider } from "./ProgressSlider";
import { useUpdateItem } from "./useItems";

interface AssignmentCardProps {
  /** Must be an assignment (progress is non-null); callers filter by kind. */
  item: Item;
  onOpen: () => void;
}

/** Row card for an assignment: class dot, title, due time, priority flag, and
 *  the progress slider. Used on the Home dashboard and the Assignments page. */
export function AssignmentCard({ item, onOpen }: AssignmentCardProps) {
  const updateItem = useUpdateItem();
  const [progress, setProgress] = useState(item.progress ?? 0);

  // Resync local progress when the refetched server value arrives.
  useEffect(() => {
    setProgress(item.progress ?? 0);
  }, [item.progress]);

  const complete = progress === 100;

  function commitProgress(value: number) {
    setProgress(value);
    void updateItem.mutateAsync({ id: item.id, progress: value });
  }

  return (
    <li>
      <div
        className="group flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-2/60"
        onClick={onOpen}
      >
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: item.class.color }}
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
              {item.title}
            </span>
            {item.is_priority && (
              <Flag
                className="h-3.5 w-3.5 shrink-0 fill-warning text-warning"
                aria-label="Priority"
              />
            )}
            {complete && (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Complete" />
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDueTime(item.due_at)}
            </span>
            <span className="truncate">{item.class.name}</span>
          </div>
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <ProgressSlider value={progress} onCommit={commitProgress} />
          </div>
        </div>
      </div>
    </li>
  );
}

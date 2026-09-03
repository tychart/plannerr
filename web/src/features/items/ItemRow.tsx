import { CalendarDays, Clock, Flag } from "lucide-react";
import { cn } from "../../lib/cn";
import { itemDueLabel } from "../../lib/items";
import type { Item } from "../../lib/types";

interface ItemRowProps {
  item: Item;
  onOpen: () => void;
  /** Dim past items (used when a quiz/exam list shows history). */
  muted?: boolean;
}

/** Row card for quizzes/exams (dated events — no progress, no completion).
 *  Used in the Home sidebar sections and on the Quizzes/Exams pages. */
export function ItemRow({ item, onOpen, muted = false }: ItemRowProps) {
  return (
    <li>
      <div
        className="group flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2/60"
        onClick={onOpen}
      >
        <span
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", muted && "opacity-50")}
          style={{ backgroundColor: item.class.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "flex items-center gap-1.5 truncate text-sm font-medium text-foreground",
              muted && "text-muted",
            )}
          >
            <span className="truncate">{item.title}</span>
            {item.is_priority && (
              <Flag
                className="h-3.5 w-3.5 shrink-0 fill-warning text-warning"
                aria-label="Priority"
              />
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              {item.kind === "quiz" ? (
                <CalendarDays className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              {itemDueLabel(item)}
            </span>
            <span className="truncate">{item.class.name}</span>
          </p>
        </div>
      </div>
    </li>
  );
}

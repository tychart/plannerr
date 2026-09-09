import { Flag } from "lucide-react";
import { ClassBadge } from "../../components/ClassBadge";
import { KIND_LABELS } from "../../lib/items";
import type { Item } from "../../lib/types";

/** Kind pill + class badge + optional priority flag. Shared by every
 *  read-only item surface so the chips always look identical. */
export function ItemChips({ item }: { item: Item }) {
  return (
    <>
      <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
        {KIND_LABELS[item.kind]}
      </span>
      <ClassBadge name={item.class.name} color={item.class.color} />
      {item.is_priority && (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-foreground">
          <Flag className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
          Priority
        </span>
      )}
    </>
  );
}

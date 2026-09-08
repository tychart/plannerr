import { lazy, Suspense } from "react";
import type { Item } from "../../lib/types";

const ItemViewDialog = lazy(() =>
  import("./ItemViewDialog").then((m) => ({ default: m.ItemViewDialog })),
);

interface LazyItemViewDialogProps {
  item: Item | null;
  onOpenChange: (open: boolean) => void;
}

/** Keeps react-markdown out of the initial app bundle until an item is viewed. */
export function LazyItemViewDialog({ item, onOpenChange }: LazyItemViewDialogProps) {
  if (!item) return null;
  return (
    <Suspense fallback={null}>
      <ItemViewDialog open={Boolean(item)} onOpenChange={onOpenChange} item={item} />
    </Suspense>
  );
}

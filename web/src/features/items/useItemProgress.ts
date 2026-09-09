import { useState } from "react";
import type { Item } from "../../lib/types";
import { useUpdateItem } from "./useItems";

/** Local-first progress state for an item: the slider thumb moves locally
 *  while dragging and the value commits to the server on release; the server
 *  response resyncs local state. Shared by every surface that edits progress.
 *
 *  Resync happens by adjusting state during render (React's recommended
 *  pattern for "adjust state when a prop changes"): `lastSynced` tracks the
 *  last server value already folded in, so a fresh one resets the slider
 *  without clobbering an in-flight drag and without a post-render effect. */
export function useItemProgress(item: Pick<Item, "id" | "progress">) {
  const updateItem = useUpdateItem();
  const [progress, setProgress] = useState(item.progress ?? 0);
  const [lastSynced, setLastSynced] = useState(item.progress ?? 0);

  if (lastSynced !== item.progress) {
    setLastSynced(item.progress ?? 0);
    setProgress(item.progress ?? 0);
  }

  function commit(value: number) {
    setProgress(value);
    void updateItem.mutateAsync({ id: item.id, progress: value });
  }

  return {
    progress,
    commit,
    complete: progress === 100,
    isPending: updateItem.isPending,
  };
}

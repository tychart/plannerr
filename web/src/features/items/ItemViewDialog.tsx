import { useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { KIND_LABELS } from "../../lib/items";
import type { Item } from "../../lib/types";
import { ItemDetails } from "./ItemDetails";
import { ItemDialog } from "./ItemDialog";

interface ItemViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Item | null;
}

/** Default click-through popup: a polished read-only view with a quick path to editing. */
export function ItemViewDialog({ open, onOpenChange, item }: ItemViewDialogProps) {
  const [editOpen, setEditOpen] = useState(false);

  if (!item) return null;

  return (
    <>
      <Modal
        open={open && !editOpen}
        onOpenChange={onOpenChange}
        title={`${KIND_LABELS[item.kind]} details`}
        className="max-w-2xl"
      >
        <ItemDetails item={item} onEdit={() => setEditOpen(true)} showOpenLink />
      </Modal>

      <ItemDialog
        open={editOpen}
        onOpenChange={(nextOpen) => {
          setEditOpen(nextOpen);
          if (!nextOpen) onOpenChange(false);
        }}
        initial={item}
        kind={item.kind}
      />
    </>
  );
}

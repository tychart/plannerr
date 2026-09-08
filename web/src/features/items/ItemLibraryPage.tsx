import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/EmptyState";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import { groupItems } from "../../lib/dates";
import {
  ASSIGNMENT_WINDOW_OPTIONS,
  EVENT_WINDOW_OPTIONS,
  KIND_PLURAL_LABELS,
  STATUS_OPTIONS,
} from "../../lib/items";
import type { Item, ItemKind, ItemStatus, ItemWindow } from "../../lib/types";
import { useClasses } from "../classes/useClasses";
import { AssignmentCard } from "./AssignmentCard";
import { ItemDialog } from "./ItemDialog";
import { ItemRow } from "./ItemRow";
import { LazyItemViewDialog } from "./LazyItemViewDialog";
import { useItems } from "./useItems";

interface LibraryConfig {
  kind: ItemKind;
  /** Collapse everything before today into one "Overdue" group (assignments). */
  overdueGroup: boolean;
  /** Filters offered to the user. */
  showStatusFilter: boolean;
  /** Default due-window (events default to Upcoming; assignments to Any time). */
  defaultWindow: ItemWindow | "";
}

const CONFIGS: Record<ItemKind, LibraryConfig> = {
  assignment: {
    kind: "assignment",
    overdueGroup: true,
    showStatusFilter: true,
    defaultWindow: "",
  },
  quiz: { kind: "quiz", overdueGroup: false, showStatusFilter: false, defaultWindow: "upcoming" },
  exam: { kind: "exam", overdueGroup: false, showStatusFilter: false, defaultWindow: "upcoming" },
};

interface ItemLibraryPageProps {
  kind: ItemKind;
}

/** One shared library page for Assignments, Quizzes, and Exams — each shows
 *  all items of its kind with server-side search + filters + infinite scroll. */
export function ItemLibraryPage({ kind }: ItemLibraryPageProps) {
  const cfg = CONFIGS[kind];
  const plural = KIND_PLURAL_LABELS[kind];

  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState<ItemStatus | "">("active");
  const [window, setWindow] = useState<ItemWindow | "">(cfg.defaultWindow);
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<Item | null>(null);

  // Debounce the search box (server-side search round-trips per keystroke).
  useEffect(() => {
    const t = setTimeout(() => setAppliedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data: classes } = useClasses();
  const query = useItems({
    kind,
    q: appliedQ,
    class_id: classId || undefined,
    status: status || undefined,
    window: window || undefined,
    order,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const groups = useMemo(
    () => groupItems(items, { overdueGroup: cfg.overdueGroup }),
    [items, cfg.overdueGroup],
  );

  // Infinite scroll: load the next page when the sentinel becomes visible.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function openNew() {
    setDialogOpen(true);
  }

  function openView(item: Item) {
    setViewing(item);
  }

  const filterActive = Boolean(
    appliedQ || classId || status !== "active" || window || order !== "asc",
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{plural}</h1>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4" /> New {kind === "assignment" ? "assignment" : kind}
        </Button>
      </div>

      {/* Filter toolbar (server-side) */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${plural.toLowerCase()}…`}
          aria-label={`Search ${plural.toLowerCase()}`}
          className="w-full sm:w-56"
        />
        <Select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          aria-label="Filter by class"
        >
          <option value="">All classes</option>
          {(classes ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {cfg.showStatusFilter && (
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as ItemStatus | "")}
            aria-label="Completion status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "any"} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        )}
        <Select
          value={window}
          onChange={(e) => setWindow(e.target.value as ItemWindow | "")}
          aria-label="Due date window"
        >
          {(cfg.showStatusFilter ? ASSIGNMENT_WINDOW_OPTIONS : EVENT_WINDOW_OPTIONS).map((o) => (
            <option key={o.value || "any"} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          value={order}
          onChange={(e) => setOrder(e.target.value as "asc" | "desc")}
          aria-label="Sort order"
        >
          <option value="asc">Soonest first</option>
          <option value="desc">Latest first</option>
        </Select>
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          kind={kind}
          onAdd={openNew}
          filterActive={filterActive}
          onClearFilters={() => {
            setQ("");
            setAppliedQ("");
            setClassId("");
            setStatus("active");
            setWindow(cfg.defaultWindow);
            setOrder("asc");
          }}
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className="mb-2 flex items-baseline gap-2">
                <span className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {group.label}
                </span>
                <span className="text-xs text-muted">{group.items.length}</span>
              </h2>
              <ul className="space-y-2">
                {group.items.map((item) =>
                  kind === "assignment" ? (
                    <AssignmentCard key={item.id} item={item} onOpen={() => openView(item)} />
                  ) : (
                    <ItemRow key={item.id} item={item} onOpen={() => openView(item)} />
                  ),
                )}
              </ul>
            </section>
          ))}

          <div
            ref={sentinelRef}
            className="flex h-10 items-center justify-center text-xs text-muted"
          >
            {isFetchingNextPage ? (
              <Spinner />
            ) : hasNextPage ? (
              "Scroll for more…"
            ) : (
              "You’re all caught up 🎉"
            )}
          </div>
        </div>
      )}

      <ItemDialog open={dialogOpen} onOpenChange={setDialogOpen} kind={kind} />
      <LazyItemViewDialog
        item={viewing}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      />
    </div>
  );
}

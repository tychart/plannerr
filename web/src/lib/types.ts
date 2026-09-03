/** Types mirroring the server's Pydantic response schemas. */

export type ItemKind = "assignment" | "quiz" | "exam";

export interface User {
  id: string;
  username: string;
  created_at: string;
}

export interface ItemCounts {
  assignment: number;
  quiz: number;
  exam: number;
}

export interface ClassItem {
  id: string;
  name: string;
  color: string; // "#RRGGBB"
  counts: ItemCounts;
  created_at: string;
  updated_at: string;
}

export interface ClassBrief {
  id: string;
  name: string;
  color: string;
}

export interface ItemLink {
  id: string;
  url: string;
  label: string | null;
  position: number;
}

/** A trackable entry: assignment (with progress) or quiz/exam (dated event). */
export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  notes: string;
  due_at: string;
  /** Assignments: 0–100 in steps of 5. Quizzes/exams: null. */
  progress: number | null;
  is_priority: boolean;
  /** Derived: only assignments at 100 are complete. */
  is_complete: boolean;
  created_at: string;
  updated_at: string;
  class: ClassBrief;
  links: ItemLink[];
}

export interface ItemList {
  items: Item[];
  next_cursor: string | null;
}

export interface ItemBrief {
  id: string;
  kind: ItemKind;
  title: string;
  due_at: string;
  progress: number | null;
}

export interface ClassDeletePreview {
  counts: ItemCounts;
  total: number;
  items: ItemBrief[];
}

/** Payloads for creating/updating items. */
export interface ItemLinkInput {
  url: string;
  label?: string | null;
}

export interface ItemInput {
  kind: ItemKind;
  title: string;
  class_id: string;
  notes?: string;
  due_at: string;
  /** Assignments only — omit for quizzes/exams (server rejects it). */
  progress?: number;
  is_priority?: boolean;
  links?: ItemLinkInput[];
}

export type ItemPatch = Omit<Partial<ItemInput>, "kind">;

/** Filters accepted by the shared list endpoint (GET /items). */
export type ItemStatus = "active" | "completed" | "all";

export type ItemWindow = "all" | "upcoming" | "past" | "today" | "week" | "month" | "horizon";

export interface ItemListQuery {
  kind: ItemKind;
  q?: string;
  class_id?: string;
  status?: ItemStatus;
  window?: ItemWindow;
  order?: "asc" | "desc";
  tz?: string;
  limit?: number;
}

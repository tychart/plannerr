/** Item helpers: form values ↔ API payloads, kind metadata, list query builder,
 *  and count formatting. Shared by every surface (Home, library pages, dialog,
 *  detail page, class pages). */

import { format } from "date-fns";
import { formatDayLabel, formatDueTime, isDateOnly, toDate } from "./dates";
import type {
  Item,
  ItemCounts,
  ItemInput,
  ItemKind,
  ItemListQuery,
  ItemStatus,
  ItemWindow,
} from "./types";

export interface LinkDraft {
  url: string;
  label: string;
}

/** Values collected by the shared item form (dialog + detail page). */
export interface ItemFormValues {
  kind: ItemKind;
  title: string;
  class_id: string;
  due_date: string; // yyyy-MM-dd (local)
  due_time: string; // "HH:mm" or "" for all-day
  progress: number; // assignments only; ignored for quizzes/exams
  is_priority: boolean;
  notes: string;
  links: LinkDraft[];
}

/** Build an ISO due_at from a local date (+ optional time) input.
 *  Date-only items are stored at 23:59:59 in the local zone. */
export function dueAtFromParts(date: string, time: string): string {
  const timePart = time || "23:59:59";
  return new Date(`${date}T${timePart}`).toISOString();
}

/** Split an ISO due_at back into local date + time parts for form inputs. */
export function partsFromDueAt(dueAt: string): { date: string; time: string } {
  const d = toDate(dueAt);
  return {
    date: format(d, "yyyy-MM-dd"),
    time: isDateOnly(d) ? "" : format(d, "HH:mm"),
  };
}

/** Map form values to the API payload (filters empty links; assignments carry
 *  progress, quizzes/exams must not send it). */
export function valuesToInput(values: ItemFormValues): ItemInput {
  const input: ItemInput = {
    kind: values.kind,
    title: values.title.trim(),
    class_id: values.class_id,
    due_at: dueAtFromParts(values.due_date, values.due_time),
    is_priority: values.is_priority,
    notes: values.notes,
    links: values.links
      .filter((l) => l.url.trim() !== "")
      .map((l) => ({ url: l.url.trim(), label: l.label.trim() || null })),
  };
  if (values.kind === "assignment") {
    input.progress = values.progress;
  }
  return input;
}

// ── Kind metadata ────────────────────────────────────────────────────────────

export const ITEM_KINDS: readonly ItemKind[] = ["assignment", "quiz", "exam"];

export const KIND_TITLE_LABELS: Record<ItemKind, string> = {
  assignment: "Title",
  quiz: "Name",
  exam: "Name",
};

export const KIND_DUE_LABELS: Record<ItemKind, string> = {
  assignment: "Due date",
  quiz: "Date",
  exam: "Date",
};

export const KIND_LABELS: Record<ItemKind, string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  exam: "Exam",
};

export const KIND_PLURAL_LABELS: Record<ItemKind, string> = {
  assignment: "Assignments",
  quiz: "Quizzes",
  exam: "Exams",
};

const KIND_NOUNS: Record<ItemKind, string> = {
  assignment: "assignment",
  quiz: "quiz",
  exam: "exam",
};

const KIND_NOUN_PLURALS: Record<ItemKind, string> = {
  assignment: "assignments",
  quiz: "quizzes",
  exam: "exams",
};

export function isAssignment(item: Pick<Item, "kind">): boolean {
  return item.kind === "assignment";
}

/** Detail-page route prefix for an item kind (/assignments, /quizzes, /exams). */
export function kindRoute(kind: ItemKind): string {
  if (kind === "assignment") return "assignments";
  if (kind === "quiz") return "quizzes";
  return "exams";
}

/** Compact, humanized due label: "Today, 9:00 AM" / "Fri, Oct 3" / "All day". */
export function itemDueLabel(item: Pick<Item, "due_at">): string {
  const day = formatDayLabel(toDate(item.due_at));
  const time = formatDueTime(item.due_at);
  return time === "All day" ? day : `${day}, ${time}`;
}

export function itemTotal(counts: ItemCounts): number {
  return counts.assignment + counts.quiz + counts.exam;
}

/** "3 assignments · 1 quiz · 2 exams" (zero kinds omitted; 0 → "0 items"). */
export function formatItemCounts(counts: ItemCounts): string {
  const parts = ITEM_KINDS.filter((kind) => counts[kind] > 0).map((kind) => {
    const n = counts[kind];
    return `${n} ${n === 1 ? KIND_NOUNS[kind] : KIND_NOUN_PLURALS[kind]}`;
  });
  return parts.length ? parts.join(" · ") : "0 items";
}

// ── Filter UI options ────────────────────────────────────────────────────────

export interface FilterOption<T extends string> {
  value: T | "";
  label: string;
}

/** Completion filter (assignments only). */
export const STATUS_OPTIONS: FilterOption<ItemStatus>[] = [
  { value: "", label: "Any status" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

/** Due-date window filters for the assignments library page. */
export const ASSIGNMENT_WINDOW_OPTIONS: FilterOption<ItemWindow>[] = [
  { value: "", label: "Any time" },
  { value: "past", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Next 7 days" },
  { value: "month", label: "Next 30 days" },
];

/** Due-date window filters for the quizzes/exams library pages. */
export const EVENT_WINDOW_OPTIONS: FilterOption<ItemWindow>[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All time" },
];

// ── List query builder ───────────────────────────────────────────────────────

const STATUS_DEFAULT: ItemStatus = "active";
const WINDOW_DEFAULT: ItemWindow = "all";
const ORDER_DEFAULT = "asc";

/** Serialize list filters to the GET /items query string (defaults omitted). */
export function itemsQueryString(query: ItemListQuery): string {
  const params = new URLSearchParams();
  params.set("kind", query.kind);
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.class_id) params.set("class_id", query.class_id);
  if (query.status && query.status !== STATUS_DEFAULT) params.set("status", query.status);
  if (query.window && query.window !== WINDOW_DEFAULT) params.set("window", query.window);
  if (query.order && query.order !== ORDER_DEFAULT) params.set("order", query.order);
  if (query.tz) params.set("tz", query.tz);
  if (query.limit != null) params.set("limit", String(query.limit));
  return params.toString();
}

/** The client's IANA timezone, for server-side day-window boundaries. */
export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

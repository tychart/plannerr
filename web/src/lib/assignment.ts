import { format } from "date-fns";
import type { AssignmentInput } from "./types";
import { isDateOnly, toDate } from "./dates";

/** Draft link row in forms (before it has an id). */
export interface LinkDraft {
  url: string;
  label: string;
}

/** Values collected by the shared assignment form (dialog + page). */
export interface AssignmentFormValues {
  title: string;
  class_id: string;
  due_date: string; // yyyy-MM-dd (local)
  due_time: string; // "HH:mm" or "" for all-day
  progress: number;
  is_priority: boolean;
  notes: string;
  links: LinkDraft[];
}

/** Build an ISO due_at from a local date (+ optional time) input.
 *  Date-only assignments are stored at 23:59:59 in the local zone. */
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

/** Map form values to the API payload (filters empty links). */
export function valuesToInput(values: AssignmentFormValues): AssignmentInput {
  return {
    title: values.title.trim(),
    class_id: values.class_id,
    due_at: dueAtFromParts(values.due_date, values.due_time),
    progress: values.progress,
    is_priority: values.is_priority,
    notes: values.notes,
    links: values.links
      .filter((l) => l.url.trim() !== "")
      .map((l) => ({ url: l.url.trim(), label: l.label.trim() || null })),
  };
}

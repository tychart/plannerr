/** Date helpers: parsing, day grouping, and date-only detection. */

import {
  differenceInCalendarDays,
  format,
  isBefore,
  startOfDay,
  startOfToday,
} from "date-fns";
import type { Assignment } from "./types";

export function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** "yyyy-MM-dd" local-time key used to group assignments into days. */
export function dayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * Date-only assignments are stored at 23:59:59 in the user's local zone
 * (converted to UTC by the client at write time). Detecting that sentinel
 * lets us render "All day" instead of a fake time.
 */
export function isDateOnly(value: string | Date): boolean {
  const d = toDate(value);
  return d.getHours() === 23 && d.getMinutes() === 59 && d.getSeconds() === 59;
}

export function formatDueTime(value: string | Date): string {
  const d = toDate(value);
  return isDateOnly(d) ? "All day" : format(d, "h:mm a");
}

export function formatDayLabel(d: Date): string {
  const diff = differenceInCalendarDays(startOfDay(d), startOfToday());
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

export interface AssignmentGroup {
  key: string;
  label: string;
  isOverdue: boolean;
  date: Date | null; // null for the Overdue group
  items: Assignment[];
}

/**
 * Group assignments into day buckets. Input should already be sorted by
 * `due_at` ascending (the server does this). Overdue items — which always
 * live on the first page — are sorted most-recently-due first within their
 * group so the most urgent sits on top.
 */
export function groupAssignments(assignments: Assignment[]): AssignmentGroup[] {
  const today = startOfToday();
  const groups: AssignmentGroup[] = [];
  const byKey = new Map<string, AssignmentGroup>();

  const groupFor = (assignment: Assignment): AssignmentGroup => {
    const due = toDate(assignment.due_at);
    const overdue = isBefore(due, today);
    const key = overdue ? "overdue" : dayKey(due);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: overdue ? "Overdue" : formatDayLabel(due),
        isOverdue: overdue,
        date: overdue ? null : startOfDay(due),
        items: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    return group;
  };

  for (const assignment of assignments) {
    groupFor(assignment).items.push(assignment);
  }

  // Sort items within each group: most-recently-due first for overdue,
  // soonest-first for future days (robust to any input order).
  for (const group of groups) {
    group.items.sort((a, b) =>
      group.isOverdue
        ? toDate(b.due_at).getTime() - toDate(a.due_at).getTime()
        : toDate(a.due_at).getTime() - toDate(b.due_at).getTime(),
    );
  }

  // Order groups: Overdue first, then future days chronologically.
  groups.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0);
  });

  return groups;
}

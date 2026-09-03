/** Date helpers: parsing, day grouping, and date-only detection. */

import { differenceInCalendarDays, format, isBefore, startOfDay, startOfToday } from "date-fns";
import type { Item } from "./types";

export function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** "yyyy-MM-dd" local-time key used to group items into days. */
export function dayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * Date-only items are stored at 23:59:59 in the user's local zone
 * (converted to UTC by the client at write time). Detecting that sentinel
 * lets us render a time label instead of a fake clock time.
 */
export function isDateOnly(value: string | Date): boolean {
  const d = toDate(value);
  return d.getHours() === 23 && d.getMinutes() === 59 && d.getSeconds() === 59;
}

/** Time-less (date-only) items read as "End of day": a deadline due by the
 *  end of its date, whatever the kind. */
export function formatDueTime(value: string | Date): string {
  const d = toDate(value);
  return isDateOnly(d) ? "End of day" : format(d, "h:mm a");
}

export function formatDayLabel(d: Date): string {
  const diff = differenceInCalendarDays(startOfDay(d), startOfToday());
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

export interface ItemGroup {
  key: string;
  label: string;
  isOverdue: boolean;
  /** null for the Overdue group; the day otherwise. */
  date: Date | null;
  items: Item[];
}

export interface GroupItemsOptions {
  /**
   * When true (assignments), everything before today collapses into one
   * "Overdue" group pinned on top, items sorted most-recently-due first.
   * When false (quizzes/exams), past days keep their own date-labeled groups
   * (nothing is "overdue" — there is no completion to chase).
   */
  overdueGroup?: boolean;
}

/**
 * Group items into day buckets. Input should already be sorted by `due_at`
 * ascending (the server does this).
 */
export function groupItems(items: Item[], options: GroupItemsOptions = {}): ItemGroup[] {
  const { overdueGroup = true } = options;
  const today = startOfToday();
  const groups: ItemGroup[] = [];
  const byKey = new Map<string, ItemGroup>();

  const groupFor = (item: Item): ItemGroup => {
    const due = toDate(item.due_at);
    const beforeToday = isBefore(due, today);
    const isOverdue = beforeToday && overdueGroup;
    const key = isOverdue ? "overdue" : dayKey(due);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: isOverdue ? "Overdue" : formatDayLabel(due),
        isOverdue,
        date: isOverdue ? null : startOfDay(due),
        items: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    return group;
  };

  for (const item of items) {
    groupFor(item).items.push(item);
  }

  // Sort items within each group: most-recently-due first for the Overdue
  // group, soonest-first everywhere else (robust to any input order).
  for (const group of groups) {
    group.items.sort((a, b) =>
      group.isOverdue
        ? toDate(b.due_at).getTime() - toDate(a.due_at).getTime()
        : toDate(a.due_at).getTime() - toDate(b.due_at).getTime(),
    );
  }

  // Order groups: Overdue first, then the days chronologically.
  groups.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0);
  });

  return groups;
}

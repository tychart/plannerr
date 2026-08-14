/** Types mirroring the server's Pydantic response schemas. */

export interface User {
  id: string;
  username: string;
  created_at: string;
}

export interface ClassItem {
  id: string;
  name: string;
  color: string; // "#RRGGBB"
  assignment_count: number;
  created_at: string;
  updated_at: string;
}

export interface ClassBrief {
  id: string;
  name: string;
  color: string;
}

export interface AssignmentLink {
  id: string;
  url: string;
  label: string | null;
  position: number;
}

export interface Assignment {
  id: string;
  title: string;
  notes: string;
  due_at: string;
  progress: number; // 0–100, multiples of 5
  is_priority: boolean;
  is_complete: boolean; // derived: progress === 100
  created_at: string;
  updated_at: string;
  class: ClassBrief;
  links: AssignmentLink[];
}

export interface AssignmentList {
  items: Assignment[];
  next_cursor: string | null;
}

export interface AssignmentBrief {
  id: string;
  title: string;
  due_at: string;
  progress: number;
}

export interface ClassDeletePreview {
  assignment_count: number;
  assignments: AssignmentBrief[];
}

/** Payloads for creating/updating assignments. */
export interface AssignmentLinkInput {
  url: string;
  label?: string | null;
}

export interface AssignmentInput {
  title: string;
  class_id: string;
  notes?: string;
  due_at: string;
  progress?: number;
  is_priority?: boolean;
  links?: AssignmentLinkInput[];
}

export type AssignmentPatch = Partial<AssignmentInput>;

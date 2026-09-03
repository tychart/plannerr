import {
  FileQuestion,
  GraduationCap,
  House,
  ListChecks,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end: boolean;
}

/** Primary destinations — rendered inline in the top bar (md+) and as rows in
    the mobile nav sheet (< md), so both stay in sync from this single list. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/assignments", label: "Assignments", icon: ListChecks, end: false },
  { to: "/quizzes", label: "Quizzes", icon: FileQuestion, end: false },
  { to: "/exams", label: "Exams", icon: GraduationCap, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

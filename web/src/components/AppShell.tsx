import { Link, NavLink, Outlet } from "react-router";
import {
  BookOpen,
  FileQuestion,
  GraduationCap,
  House,
  ListChecks,
  LogOut,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";
import { OfflineBanner } from "./OfflineBanner";
import { useAuth } from "../features/auth/useAuth";
import { useTheme } from "../features/theme/useTheme";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/assignments", label: "Assignments", icon: ListChecks, end: false },
  { to: "/quizzes", label: "Quizzes", icon: FileQuestion, end: false },
  { to: "/exams", label: "Exams", icon: GraduationCap, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
] as const;

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
    isActive ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground",
  );
}

/** Authenticated app shell: header with nav, theme toggle, and logout. */
export function AppShell() {
  const { user, logout } = useAuth();
  const { resolvedTheme, toggle } = useTheme();

  return (
    // pt/pb env() insets keep content clear of the iPhone notch & gesture bar.
    <div className="flex min-h-screen flex-col pt-[env(safe-area-inset-top)]">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold text-foreground">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="hidden sm:inline">Plannerr</span>
          </Link>
          <nav className="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={navLinkClass}>
                <Icon className="h-4 w-4" aria-hidden />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <span className="hidden text-sm text-muted lg:inline">{user?.username}</span>
            <Button variant="ghost" size="sm" onClick={toggle} aria-label="Toggle color theme">
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void logout()} aria-label="Log out">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>
      <OfflineBanner />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <Outlet />
      </main>
    </div>
  );
}

import { Link, NavLink, Outlet } from "react-router";
import { BookOpen, LogOut, Moon, Sun } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";
import { OfflineBanner } from "./OfflineBanner";
import { useAuth } from "../features/auth/useAuth";
import { useTheme } from "../features/theme/useTheme";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
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
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="hidden sm:inline">Plannerr</span>
          </Link>
          <nav className="ml-4 flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/classes" className={navLinkClass}>
              Classes
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              Settings
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden text-sm text-muted md:inline">{user?.username}</span>
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
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <Outlet />
      </main>
    </div>
  );
}

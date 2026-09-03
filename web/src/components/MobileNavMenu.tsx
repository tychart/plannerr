import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router";
import { cn } from "../lib/cn";
import { NAV_ITEMS } from "./nav";
import { Button } from "./ui/Button";

/** Mirrors Tailwind's `md:` breakpoint (48rem = 768px) so the sheet closes
    automatically when the inline top-bar nav takes over again. */
const MD_QUERY = "(min-width: 48rem)";

interface MobileNavMenuProps {
  username?: string;
  onLogout: () => void;
}

function sheetLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isActive ? "bg-primary-soft text-primary" : "text-foreground hover:bg-surface-2",
  );
}

/** Mobile navigation: a hamburger trigger that opens a right-hand sheet built
    on Radix Dialog (focus trap, scroll lock, Esc/backdrop dismiss, and exit
    animations via data-state are all handled by the primitive + CSS). */
export function MobileNavMenu({ username, onLogout }: MobileNavMenuProps) {
  const [open, setOpen] = useState(false);

  // Growing past `md` hides the trigger, so a sheet left open across that
  // boundary hands control back to the inline nav instead of getting stuck.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(MD_QUERY);
    const closeOnWide = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    mq.addEventListener("change", closeOnWide);
    return () => mq.removeEventListener("change", closeOnWide);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden"
          aria-label="Open menu"
          aria-haspopup="dialog"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm",
            "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
            "motion-reduce:animate-none",
          )}
        />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-80 max-w-[85vw] flex-col",
            "border-l border-border bg-background shadow-2xl outline-none",
            "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
            "motion-reduce:animate-none",
          )}
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>

          {/* Header: brand + close. Padded for the iOS notch via safe-area. */}
          <div className="flex items-center justify-between gap-4 border-b border-border py-3 pl-5 pr-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <Link
              to="/"
              onClick={close}
              className="flex items-center gap-2 rounded-lg font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BookOpen className="h-5 w-5 text-primary" aria-hidden />
              <span>Plannerr</span>
            </Link>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close menu">
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          {/* Destinations — each row is ~44px tall for comfortable touch. */}
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3" aria-label="Primary">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={close} className={sheetLinkClass}>
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Account — pinned to the bottom, clear of the gesture bar. */}
          <div className="border-t border-border px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
            {username ? (
              <p className="mb-1 truncate px-3 text-sm text-muted">
                Signed in as <span className="font-medium text-foreground">{username}</span>
              </p>
            ) : null}
            <Button
              variant="ghost"
              onClick={onLogout}
              className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-3 font-medium hover:bg-danger-soft hover:text-danger"
            >
              <LogOut className="h-5 w-5 shrink-0" aria-hidden />
              <span>Log out</span>
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

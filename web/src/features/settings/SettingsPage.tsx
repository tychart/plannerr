import { useEffect, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import { Bell, Database, Layers, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { ClassConfigPage } from "../classes/ClassConfigPage";
import { BackupSection } from "./BackupSection";
import { NotificationsPanel } from "./NotificationsPanel";

export type SettingsTab = "notifications" | "classes" | "backup";

const TABS: ReadonlyArray<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "classes", label: "Classes", icon: Layers },
  { id: "backup", label: "Backups", icon: Database },
];

function parseTab(raw: string | null): SettingsTab {
  return TABS.some((t) => t.id === raw) ? (raw as SettingsTab) : "notifications";
}

/** Settings shell: a segmented tab bar (Notifications · Classes · Backups).
 *  The active tab lives in the URL (?tab=…), so views are linkable and survive
 *  refresh. */
export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  // New tab → new scroll position.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  function selectTab(next: SettingsTab) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("tab", next);
      return params;
    });
  }

  // Roving-tabindex arrow navigation (Left/Right move between tabs).
  function handleTablistKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + delta + TABS.length) % TABS.length].id;
    selectTab(next);
    document.getElementById(`settings-tab-${next}`)?.focus();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

      <div
        role="tablist"
        aria-label="Settings sections"
        onKeyDown={handleTablistKeyDown}
        className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              id={`settings-tab-${id}`}
              aria-selected={active}
              aria-controls={`settings-panel-${id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => selectTab(id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      <div
        key={tab}
        role="tabpanel"
        id={`settings-panel-${tab}`}
        aria-labelledby={`settings-tab-${tab}`}
        className="animate-fade-in"
      >
        {tab === "notifications" && <NotificationsPanel />}
        {tab === "classes" && <ClassConfigPage />}
        {tab === "backup" && <BackupSection />}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Slim banner shown whenever the browser is offline. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="border-b border-border bg-warning/15 px-4 py-2 text-center text-xs font-medium text-foreground">
      <span className="inline-flex items-center gap-1.5">
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
        You're offline — showing saved data. Changes need a connection.
      </span>
    </div>
  );
}

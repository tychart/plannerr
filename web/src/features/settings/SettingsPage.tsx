import { Bell, BellOff, CheckCircle2, Info, Send } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { usePushNotifications } from "../notifications/usePushNotifications";

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong — please try again.";
}

export function SettingsPage() {
  const push = usePushNotifications();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Bell className="h-4 w-4 text-primary" />
          Daily notifications
        </h2>
        <p className="mt-1 text-sm text-muted">
          Plannerr can send you a daily summary of what's due, written by an AI model from your
          assignments. Sending isn't scheduled yet — the button below previews the notification.
        </p>

        <div className="mt-4 space-y-3">
          {!push.supported && (
            <p className="text-sm text-muted">Your browser doesn't support push notifications.</p>
          )}

          {push.supported && !push.vapidConfigured && (
            <p className="text-sm text-muted">
              Notifications aren't configured on this server yet (VAPID keys are missing in the
              server environment).
            </p>
          )}

          {push.supported && push.vapidConfigured && push.permission === "denied" && (
            <p className="text-sm text-muted">
              Notifications are blocked for this site. Allow them in your browser's site settings,
              then reload.
            </p>
          )}

          {push.supported && push.vapidConfigured && push.iosNeedsInstall && (
            <p className="flex items-start gap-2 rounded-xl bg-primary-soft/50 p-3 text-sm text-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              On iPhone/iPad, add Plannerr to your Home Screen (Share → “Add to Home Screen”) to
              receive notifications.
            </p>
          )}

          {push.supported && push.vapidConfigured && push.permission !== "denied" && (
            <div className="flex flex-wrap items-center gap-2">
              {push.enabled ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Notifications enabled on this device
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={push.disableState.isPending}
                    onClick={() => void push.disable()}
                  >
                    <BellOff className="h-4 w-4" />
                    Disable
                  </Button>
                  <Button
                    size="sm"
                    disabled={push.testState.isPending}
                    onClick={() => void push.sendTest()}
                  >
                    {push.testState.isPending ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send test notification
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  disabled={push.enableState.isPending}
                  onClick={() => void push.enable()}
                >
                  {push.enableState.isPending ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                  Enable notifications
                </Button>
              )}
            </div>
          )}

          {(push.enableState.isError || push.disableState.isError) && (
            <p className="text-sm text-danger">
              {errorMessage(push.enableState.error ?? push.disableState.error)}
            </p>
          )}
          {push.testState.isError && (
            <p className="text-sm text-danger">{errorMessage(push.testState.error)}</p>
          )}
          {push.testState.data && (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <p className="font-medium text-foreground">
                Sent to {push.testState.data.device_count}{" "}
                {push.testState.data.device_count === 1 ? "device" : "devices"}
                {push.testState.data.source === "llm" ? " · AI summary" : " · built-in summary"}
              </p>
              <p className="mt-1 text-muted">{push.testState.data.summary}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

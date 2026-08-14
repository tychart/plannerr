import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2, Clock, Info, Save, Send, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { Switch } from "../../components/ui/Switch";
import { usePushNotifications } from "../notifications/usePushNotifications";

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong — please try again.";
}

export function SettingsPage() {
  const push = usePushNotifications();
  const [customMessage, setCustomMessage] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const llmReason =
    "AI notifications are off — set LLM_BASE_URL (and LLM_API_KEY if needed) " +
    "in the server's .env, then restart the server.";

  // Sync the form from the saved schedule once it loads (or after saving).
  useEffect(() => {
    if (push.schedule) {
      setScheduleEnabled(push.schedule.enabled);
      if (push.schedule.time) setScheduleTime(push.schedule.time);
    }
  }, [push.schedule]);

  // Show a transient "Saved" confirmation.
  useEffect(() => {
    if (push.saveScheduleState.isSuccess) {
      setScheduleSaved(true);
      const timer = setTimeout(() => setScheduleSaved(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [push.saveScheduleState.isSuccess]);

  const scheduleTz = push.schedule?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  function handleSaveSchedule() {
    if (!scheduleTime) return;
    void push.saveSchedule({ enabled: scheduleEnabled, time: scheduleTime, timezone: scheduleTz });
  }

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
          assignments — automatically on a schedule, or right now with a button. Sends only fire on
          days when something is due (or overdue).
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
                    Send today's summary
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

        {/* Daily schedule */}
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="h-4 w-4 text-primary" />
            Daily schedule
          </h3>
          <p className="mt-1 text-sm text-muted">
            Automatically send the summary each day at your chosen time — only on days when
            something is due or overdue.
          </p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <Switch
                checked={scheduleEnabled}
                onCheckedChange={setScheduleEnabled}
                aria-label="Send daily summary on a schedule"
              />
              Enabled
            </label>
            <div className="flex items-center gap-2">
              <label htmlFor="schedule-time" className="text-sm text-muted">
                At
              </label>
              <input
                id="schedule-time"
                type="time"
                value={scheduleTime}
                onChange={(event) => setScheduleTime(event.target.value)}
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button
              size="md"
              onClick={handleSaveSchedule}
              disabled={push.saveScheduleState.isPending}
            >
              {push.saveScheduleState.isPending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
          </div>

          <p className="mt-2 text-xs text-muted">
            {scheduleEnabled
              ? `Will send at ${scheduleTime} in ${scheduleTz} when something is due.`
              : `Daily sends are off. Timezone: ${scheduleTz}.`}
          </p>
          {scheduleSaved && <p className="mt-1 text-xs text-success">Schedule saved.</p>}
          {push.saveScheduleState.isError && (
            <p className="mt-1 text-sm text-danger">{errorMessage(push.saveScheduleState.error)}</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Custom AI notification
        </h2>
        <p className="mt-1 text-sm text-muted">
          Type anything and the AI turns it into a friendly push notification (needs the LLM
          configured on the server).
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={customMessage}
            onChange={(event) => setCustomMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && push.llmConfigured && customMessage.trim()) {
                void push.sendCustom(customMessage.trim());
              }
            }}
            placeholder="e.g. Remind me to review Chapter 4 tonight"
            maxLength={200}
            disabled={!push.llmConfigured || push.customState.isPending}
            aria-label="Message for the AI notification"
          />
          {push.llmConfigured ? (
            <Button
              size="md"
              className="shrink-0"
              disabled={!customMessage.trim() || push.customState.isPending}
              onClick={() => void push.sendCustom(customMessage.trim())}
            >
              {push.customState.isPending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Send test LLM notification
            </Button>
          ) : (
            <span title={llmReason} className="shrink-0">
              <Button size="md" disabled aria-label="Send test LLM notification (unavailable)">
                <Sparkles className="h-4 w-4" />
                Send test LLM notification
              </Button>
            </span>
          )}
        </div>

        {!push.llmConfigured && (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            {llmReason} Hover the button for the reason, or set it up to enable AI notifications.
          </p>
        )}
        {push.customState.isError && (
          <p className="mt-2 text-sm text-danger">{errorMessage(push.customState.error)}</p>
        )}
        {push.customState.data && (
          <div className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">
            <p className="font-medium text-foreground">
              Sent to {push.customState.data.device_count}{" "}
              {push.customState.data.device_count === 1 ? "device" : "devices"}
            </p>
            <p className="mt-1 text-muted">{push.customState.data.body}</p>
          </div>
        )}
      </section>
    </div>
  );
}

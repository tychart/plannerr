import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  isIOS,
  isStandalone,
  pushSubscriptionToIn,
  urlBase64ToUint8Array,
  type CustomNotificationOut,
  type NotificationCapabilities,
  type NotificationSchedule,
  type TestNotificationOut,
} from "../../lib/push";

const notificationsKeys = {
  vapid: ["notifications", "vapid"] as const,
  schedule: ["notifications", "schedule"] as const,
};

/** True when the browser can do Web Push (secure context + SW + push). */
function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Everything the Settings page needs to manage push notifications:
 * capability checks, VAPID key fetch, subscribe/unsubscribe, the daily
 * schedule, and the test actions.
 */
export function usePushNotifications() {
  const supported = isPushSupported();

  const vapidQuery = useQuery({
    queryKey: notificationsKeys.vapid,
    queryFn: () => api.get<NotificationCapabilities>("/notifications/vapid-public-key"),
    enabled: supported,
    staleTime: Infinity,
  });
  const vapidKey = supported ? (vapidQuery.data?.public_key ?? "") : "";
  const vapidConfigured = Boolean(vapidKey);
  const llmConfigured = supported ? (vapidQuery.data?.llm_configured ?? false) : false;

  const [permission, setPermission] = useState<NotificationPermission>(() =>
    supported ? Notification.permission : "denied",
  );
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  const refresh = useCallback(async () => {
    if (!supported) return;
    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.ready;
      setSubscription(await reg.pushManager.getSubscription());
    } catch {
      setSubscription(null);
    }
  }, [supported]);

  // Sync permission/subscription on mount (once VAPID is known) and whenever
  // the tab regains focus (the user may have changed permission in settings).
  useEffect(() => {
    if (!supported || !vapidKey) return;
    void refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [supported, vapidKey, refresh]);

  const enableMutation = useMutation({
    mutationFn: async () => {
      const granted = (await Notification.requestPermission()) === "granted";
      if (!granted) {
        throw new Error("Notification permission was not granted.");
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await api.post("/notifications/subscribe", pushSubscriptionToIn(sub));
      setPermission("granted");
      setSubscription(sub);
    },
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.delete(`/notifications/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`);
        await sub.unsubscribe();
      }
      setSubscription(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      api.post<TestNotificationOut>("/notifications/test", {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
  });

  const customMutation = useMutation({
    mutationFn: (message: string) =>
      api.post<CustomNotificationOut>("/notifications/test-llm", { message }),
  });

  const queryClient = useQueryClient();
  const scheduleQuery = useQuery({
    queryKey: notificationsKeys.schedule,
    queryFn: () => api.get<NotificationSchedule>("/notifications/schedule"),
  });

  const saveScheduleMutation = useMutation({
    mutationFn: (schedule: NotificationSchedule) =>
      api.put<NotificationSchedule>("/notifications/schedule", schedule),
    onSuccess: (data) => queryClient.setQueryData(notificationsKeys.schedule, data),
  });

  return {
    supported,
    vapidConfigured,
    llmConfigured,
    permission,
    subscription,
    enabled: permission === "granted" && subscription !== null,
    // iOS Safari only supports push for installed (standalone) PWAs — show a hint.
    iosNeedsInstall: isIOS() && !isStandalone(),
    enable: () => enableMutation.mutateAsync().catch(() => undefined),
    disable: () => disableMutation.mutateAsync().catch(() => undefined),
    sendTest: () => testMutation.mutateAsync().catch(() => undefined),
    sendCustom: (message: string) => customMutation.mutateAsync(message).catch(() => undefined),
    schedule: scheduleQuery.data,
    scheduleLoading: scheduleQuery.isLoading,
    saveSchedule: (schedule: NotificationSchedule) =>
      saveScheduleMutation.mutateAsync(schedule).catch(() => undefined),
    saveScheduleState: saveScheduleMutation,
    enableState: enableMutation,
    disableState: disableMutation,
    testState: testMutation,
    customState: customMutation,
  };
}

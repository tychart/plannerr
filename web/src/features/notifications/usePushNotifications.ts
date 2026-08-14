import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  isIOS,
  isStandalone,
  pushSubscriptionToIn,
  urlBase64ToUint8Array,
  type TestNotificationOut,
} from "../../lib/push";

const notificationsKeys = {
  vapid: ["notifications", "vapid"] as const,
};

/** True when the browser can do Web Push (secure context + SW + push). */
function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Everything the Settings page needs to manage push notifications:
 * capability checks, VAPID key fetch, subscribe/unsubscribe, and the
 * "send test notification" action.
 */
export function usePushNotifications() {
  const supported = isPushSupported();

  const vapidQuery = useQuery({
    queryKey: notificationsKeys.vapid,
    queryFn: () => api.get<{ public_key: string }>("/notifications/vapid-public-key"),
    enabled: supported,
    staleTime: Infinity,
  });
  const vapidKey = supported ? (vapidQuery.data?.public_key ?? "") : "";
  const vapidConfigured = Boolean(vapidKey);

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

  return {
    supported,
    vapidConfigured,
    permission,
    subscription,
    enabled: permission === "granted" && subscription !== null,
    // iOS Safari only supports push for installed (standalone) PWAs — show a hint.
    iosNeedsInstall: isIOS() && !isStandalone(),
    enable: () => enableMutation.mutateAsync(),
    disable: () => disableMutation.mutateAsync(),
    sendTest: () => testMutation.mutateAsync(),
    enableState: enableMutation,
    disableState: disableMutation,
    testState: testMutation,
  };
}

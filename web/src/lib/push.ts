/** Push-notification helpers: payload types + base64url conversions. */

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionIn {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface TestNotificationOut {
  device_count: number;
  summary: string;
  source: "llm" | "fallback";
}

/** Convert a base64url-encoded string (e.g. the VAPID public key) to bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const withPadding = base64.replace(/-/g, "+").replace(/_/g, "/") + padding;
  const raw = atob(withPadding);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Map a browser PushSubscription to the API payload shape. */
export function pushSubscriptionToIn(sub: PushSubscription): PushSubscriptionIn {
  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  return {
    endpoint: json.endpoint ?? "",
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
  };
}

/** True when running in an iOS browser (Safari or Chrome iOS). */
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** True when the app is running standalone (added to the home screen). */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Legacy iOS Safari (pre-13.4) reports standalone on the navigator.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare let self: ServiceWorkerGlobalScope;

// Precache the app shell (JS/CSS/HTML/icons) — injected at build time.
precacheAndRoute(self.__WB_MANIFEST);

// API GETs: network-first with a short timeout, falling back to the last
// successful response so the app stays readable on spotty connections.
registerRoute(
  ({ url, request }) => url.pathname.startsWith("/api/") && request.method === "GET",
  new NetworkFirst({
    cacheName: "plannerr-api",
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  }),
);

// Navigations: network-first; when offline, serve the precached app shell.
registerRoute(
  ({ request }) => request.mode === "navigate",
  async ({ event, request }) => {
    try {
      return await new NetworkFirst({
        cacheName: "plannerr-pages",
        networkTimeoutSeconds: 4,
        plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
      }).handle({ event, request });
    } catch {
      const shell = await caches.match("/index.html");
      return shell ?? Response.error();
    }
  },
);

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    // Malformed payload — fall through to the generic notification.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Plannerr", {
      body: payload.body ?? "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: "plannerr-daily",
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        await client.focus();
        if (client.url !== url) await client.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

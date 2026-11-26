/* global RELEASE */
/* One worker for offline shell, safe updates, and existing Web Push. Never cache authenticated responses. */
const STATIC_CACHE = `eduplan-static-${RELEASE}`;
const STATIC_URLS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_URLS)),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("eduplan-static-") && key !== STATIC_CACHE)
          await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "APPLY_UPDATE") self.skipWaiting();
  if (event.data?.type === "CLEAR_USER_DATA")
    event.waitUntil(
      self.registration
        .getNotifications()
        .then((items) => items.forEach((n) => n.close())),
    );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        async () => (await caches.match("/offline.html")) || Response.error(),
      ),
    );
    return;
  }
  if (STATIC_URLS.includes(url.pathname))
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
});
/* Push is authenticated again on receipt. */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const data = event.data?.json();
        if (
          !data ||
          !Number.isFinite(data.expiresAt) ||
          Date.now() >= data.expiresAt
        )
          return;
        if (data.notificationId) {
          const query = new URLSearchParams({
            subscription: data.subscriptionId,
            notification: data.notificationId,
          });
          const response = await fetch(`/api/operation-push?${query}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (!response.ok) return;
          const current = await response.json();
          if (!current?.valid) return;
          await self.registration.showNotification(current.title, {
            body: current.body,
            icon: "/icons/icon-192.png",
            tag: `eduplan-operation:${data.notificationId}`,
            data: { path: current.path },
            renotify: false,
          });
          return;
        }
        const query = new URLSearchParams({
          workspaceId: data.workspaceId,
          year: String(data.year),
          lead: String(data.lead),
          signature: data.signature,
          subscriptionId: data.subscriptionId,
        });
        const response = await fetch(`/api/lesson-push?${query}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const verified = await response.json();
        if (!verified.valid) return;
        await self.registration.showNotification("EduPlan 다음 수업", {
          body: verified.title,
          icon: "/icons/icon-192.png",
          tag: `eduplan:${data.workspaceId}`,
          data: { path: data.path, expiresAt: data.expiresAt },
          renotify: false,
        });
      } catch {
        /* No latest source confirmation means no potentially stale notification. */
      }
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.path;
  const url = new URL(
    typeof path === "string" && path.startsWith("/app/") ? path : "/app",
    self.location.origin,
  );
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const tab = clients.find((c) => new URL(c.url).origin === url.origin);
      if (tab) {
        tab.postMessage({
          type: "OPEN_NOTIFICATION",
          path: url.pathname + url.search,
        });
        await tab.focus();
      } else await self.clients.openWindow(url.href);
    })(),
  );
});

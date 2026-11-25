/* Push only. This worker never caches school data or intercepts page requests. */
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
        const query = new URLSearchParams({
          workspaceId: data.workspaceId,
          year: String(data.year),
          lead: String(data.lead),
          signature: data.signature,
        });
        const response = await fetch(`/api/lesson-push?${query}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok || !(await response.json()).valid) return;
        await self.registration.showNotification("EduPlan 다음 수업", {
          body: data.title,
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
        await tab.navigate(url.href);
        await tab.focus();
      } else await self.clients.openWindow(url.href);
    })(),
  );
});

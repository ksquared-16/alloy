/**
 * Vacilando Gateway service worker — push only.
 * Does not cache pages, APIs, or Claude output. Gateway truth stays live.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = String(data.title || "Vacilando");
  const body = String(data.body || "Vacilando");
  const laneId = String(data.lane_id || "");
  const path = String(data.path || (laneId ? `/#/lanes/${encodeURIComponent(laneId)}` : "/#/lanes"));
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: data.type === "vacilando.test"
      ? "vacilando-test"
      : (laneId ? `lane:${laneId}` : "vacilando-lane"),
    data: { path, lane_id: laneId || null },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const laneId = String(event.notification?.data?.lane_id || "");
  const path = String(event.notification?.data?.path || (laneId ? `/#/lanes/${encodeURIComponent(laneId)}` : "/#/lanes"));
  event.waitUntil((async () => {
    const url = new URL(path, self.registration.scope).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      try {
        await client.focus();
        if ("navigate" in client) {
          try { await client.navigate(url); } catch { /* */ }
        }
        client.postMessage({ type: "vacilando-open-lane", path });
        return;
      } catch { /* try next */ }
    }
    await self.clients.openWindow(url);
  })());
});

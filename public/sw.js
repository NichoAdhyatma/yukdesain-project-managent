// Service worker portal: hanya untuk notifikasi web push (docs/OWNER_NOTIFICATIONS_INBOX.md §2).
// Tidak ada cache offline: data order dan pembayaran harus selalu terbaru dari server.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Notifikasi portal", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Notifikasi portal";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: data.icon || "/favicon.ico",
      badge: data.badge || data.icon || "/favicon.ico",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/wa-orders" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Hanya tautan di dalam portal (path relatif); selain itu buka Order WA.
  const raw = (event.notification.data && event.notification.data.url) || "/wa-orders";
  const target = new URL(raw.startsWith("/") ? raw : "/wa-orders", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.navigate(target).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

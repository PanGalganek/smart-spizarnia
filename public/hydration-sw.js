self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Smart Spiżarnia - nawodnienie";
  const options = {
    body: payload.body || "Pamiętaj o szklance wody.",
    icon: "/smart-spizarnia/icon-192.png",
    badge: "/smart-spizarnia/icon-192.png",
    data: { url: payload.url || "/smart-spizarnia/hydration" },
    tag: "hydration-reminder",
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url.includes("/smart-spizarnia/"));
    if (existing) return existing.focus();
    return clients.openWindow(event.notification.data.url);
  }));
});

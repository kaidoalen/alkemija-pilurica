/* Pilurica alarm service worker — no page caching, only wake + notify. */
const DB_NAME = "pirulica";
const DB_STORE = "kv";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(onPush(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(onClick(event));
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "pirulica-watch" || event.tag === "pilurica-watch") {
    event.waitUntil(scanDue());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "pirulica-scan" || event.tag === "pilurica-scan") {
    event.waitUntil(scanDue());
  }
});

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (msg.type === "notify") {
    event.waitUntil(showAlarm(msg.payload || {}));
  }
  if (msg.type === "close" && msg.tag) {
    event.waitUntil(
      self.registration
        .getNotifications({ tag: msg.tag })
        .then((list) => list.forEach((n) => n.close())),
    );
  }
});

async function onPush(event) {
  let occurrenceId = "";
  try {
    if (event.data) {
      const payload = event.data.json();
      occurrenceId = String(payload.occurrenceId || "");
    }
  } catch {
    /* empty push still scans */
  }
  const schedule = await readSchedule();
  const upcoming = schedule?.upcoming || [];
  const now = Date.now();
  const match =
    upcoming.find((d) => d.occurrenceId === occurrenceId) ||
    upcoming.find((d) => d.at <= now + 30_000 && d.at >= now - 2 * 60 * 60 * 1000);

  if (match) {
    await showAlarm({
      title: "Vrijeme za piluricu",
      body: match.dose ? `${match.name} · ${match.dose}` : match.name,
      occurrenceId: match.occurrenceId,
    });
    return;
  }

  await showAlarm({
    title: "Vrijeme za piluricu",
    body: "Otvori aplikaciju i potvrdi dozu.",
    occurrenceId: occurrenceId || `tick:${now}`,
  });
}

async function scanDue() {
  const schedule = await readSchedule();
  const upcoming = schedule?.upcoming || [];
  const now = Date.now();
  const due = upcoming.filter(
    (d) => d.at <= now + 15_000 && d.at >= now - 2 * 60 * 60 * 1000,
  );
  for (const dose of due) {
    await showAlarm({
      title: "Vrijeme za piluricu",
      body: dose.dose ? `${dose.name} · ${dose.dose}` : dose.name,
      occurrenceId: dose.occurrenceId,
    });
  }
}

async function showAlarm(payload) {
  const occurrenceId = payload.occurrenceId || "alarm";
  const title = payload.title || "Vrijeme za piluricu";
  const body = payload.body || "Otvori aplikaciju i uzmi lijek.";
  await self.registration.showNotification(title, {
    body,
    tag: `pilurica-${occurrenceId}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [400, 160, 400, 160, 700, 200, 400],
    badge: "/icon-192.png",
    icon: "/icon-192.png",
    timestamp: Date.now(),
    actions: [
      { action: "taken", title: "Uzmi" },
      { action: "snooze", title: "Odgodi" },
    ],
    data: {
      occurrenceId,
      url: `/?alarm=${encodeURIComponent(occurrenceId)}`,
    },
  });
}

async function onClick(event) {
  const data = event.notification.data || {};
  const occurrenceId = data.occurrenceId || "";
  const action = event.action;
  const url = data.url || "/";
  const type = action === "taken" ? "sw-taken" : action === "snooze" ? "sw-snooze" : "sw-open";
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    client.postMessage({ type, occurrenceId });
    if ("focus" in client) await client.focus();
    return;
  }
  await self.clients.openWindow(url);
}

function readSchedule() {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      try {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          resolve(null);
          return;
        }
        const tx = db.transaction(DB_STORE, "readonly");
        const get = tx.objectStore(DB_STORE).get("schedule");
        get.onsuccess = () => resolve(get.result || null);
        get.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    };
  });
}

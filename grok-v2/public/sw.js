/* Pilurica alarm SW v2.5 — only at scheduled or snoozed time, never early. */
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

self.addEventListener("notificationclose", (event) => {
  const data = event.notification.data || {};
  if (data.acked) return;
  event.waitUntil(
    sleep(8000).then(() => scanDue()),
  );
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
    event.waitUntil(
      showAlarm(msg.payload || {}).then(() => pingClients(msg.payload?.occurrenceId)),
    );
  }
  if (msg.type === "schedule") {
    event.waitUntil(onSchedule(msg.payload || {}));
  }
  if (msg.type === "close" && msg.tag) {
    event.waitUntil(closeTagged(msg.tag));
  }
  if (msg.type === "badge") {
    event.waitUntil(setBadge(Number(msg.count) || 0));
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDue(d, now = Date.now()) {
  if (!d || !d.at) return false;
  return d.at <= now && d.at >= now - 2 * 60 * 60 * 1000;
}

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
    upcoming.find((d) => d.occurrenceId === occurrenceId && isDue(d, now)) ||
    upcoming.find((d) => isDue(d, now));

  if (!match) return;

  await showAlarm({
    title: "Vrijeme za piluricu",
    body: match.dose ? `${match.name} · ${match.dose}` : match.name,
    occurrenceId: match.occurrenceId,
  });
  await pingClients(match.occurrenceId);
}

async function onSchedule(payload) {
  const upcoming = payload.upcoming || [];
  await scanDueFrom(upcoming, payload.ringingId);
  await scheduleTriggers(upcoming);
}

async function scanDue() {
  const schedule = await readSchedule();
  const upcoming = schedule?.upcoming || [];
  await scanDueFrom(upcoming, schedule?.ringingId);
}

async function scanDueFrom(upcoming, ringingId) {
  const now = Date.now();
  const due = (upcoming || []).filter((d) => isDue(d, now));
  if (ringingId) {
    const ringing = (upcoming || []).find((d) => d.occurrenceId === ringingId);
    if (ringing && isDue(ringing, now) && !due.some((d) => d.occurrenceId === ringingId)) {
      due.push(ringing);
    }
  }
  for (const dose of due) {
    await showAlarm({
      title: "Vrijeme za piluricu",
      body: dose.dose ? `${dose.name} · ${dose.dose}` : dose.name,
      occurrenceId: dose.occurrenceId,
    });
    await pingClients(dose.occurrenceId);
  }
}

async function scheduleTriggers(upcoming) {
  const TT = self.TimestampTrigger;
  if (typeof TT !== "function") return;
  const now = Date.now();
  for (const d of upcoming || []) {
    if (!d.at || d.at <= now + 5_000) continue;
    try {
      await self.registration.showNotification("Vrijeme za piluricu", {
        body: d.dose ? `${d.name} · ${d.dose}` : d.name,
        tag: `pilurica-at-${d.occurrenceId}`,
        showTrigger: new TT(d.at),
        renotify: true,
        requireInteraction: true,
        silent: false,
        badge: "/icon-192.png",
        icon: "/icon-512.png",
        data: {
          occurrenceId: d.occurrenceId,
          url: `/?alarm=${encodeURIComponent(d.occurrenceId)}`,
        },
      });
    } catch {
      /* API blocked */
    }
  }
}

async function showAlarm(payload) {
  const occurrenceId = payload.occurrenceId || "alarm";
  const title = payload.title || "Vrijeme za piluricu";
  const clock = new Date().toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });
  const body = `${payload.body || "Otvori aplikaciju i uzmi lijek."} · ${clock}`;
  await self.registration.showNotification(title, {
    body,
    tag: `pilurica-${occurrenceId}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [400, 160, 400, 160, 700, 200, 400, 200, 900],
    badge: "/icon-192.png",
    icon: "/icon-512.png",
    timestamp: Date.now(),
    actions: [
      { action: "taken", title: "Uzmi" },
      { action: "snooze", title: "Odgodi 15 min" },
    ],
    data: {
      occurrenceId,
      url: `/?alarm=${encodeURIComponent(occurrenceId)}`,
    },
  });
  await setBadge(Math.max(1, await countAlarmNotes()));
}

async function pingClients(occurrenceId) {
  if (!occurrenceId) return;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    client.postMessage({ type: "sw-alarm", occurrenceId });
  }
}

async function setBadge(n) {
  try {
    if (n > 0) await self.navigator.setAppBadge(n);
    else await self.navigator.clearAppBadge();
  } catch {
    /* no Badge API */
  }
}

async function countAlarmNotes() {
  try {
    const list = await self.registration.getNotifications();
    return list.filter((n) => String(n.tag || "").startsWith("pilurica-")).length;
  } catch {
    return 1;
  }
}

async function closeTagged(tag) {
  const list = await self.registration.getNotifications({ tag });
  for (const n of list) {
    try {
      n.data = { ...(n.data || {}), acked: true };
    } catch {
      /* data may be frozen */
    }
    n.close();
  }
  await setBadge(await countAlarmNotes());
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

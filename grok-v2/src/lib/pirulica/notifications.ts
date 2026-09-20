import { SW_PATH, type PushHealth } from "./types";
import type { PlannedDose } from "./schedule";

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_PATH, { scope: "./" });
  } catch {
    return null;
  }
}

export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const ios =
    "standalone" in navigator && Boolean((navigator as { standalone?: boolean }).standalone);
  return standalone || ios;
}

export async function getHealth(): Promise<PushHealth> {
  const sw = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const notif =
    typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  let push = false;
  let periodicSync = false;
  if (sw) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager?.getSubscription();
      push = Boolean(sub);
      periodicSync = Boolean(
        (reg as ServiceWorkerRegistration & { periodicSync?: unknown }).periodicSync,
      );
    } catch {
      /* ignore */
    }
  }
  return {
    notification: notif,
    serviceWorker: sw,
    push,
    installed: isInstalled(),
    periodicSync,
  };
}

export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export async function showDoseNotification(dose: PlannedDose) {
  const who = dose.personName ? `${dose.personName} · ` : "";
  const title = "Vrijeme za piluricu";
  const body = dose.dose ? `${who}${dose.name} · ${dose.dose}` : `${who}${dose.name}`;
  const options: NotificationOptions = {
    body,
    tag: `pilurica-${dose.occurrenceId}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [400, 160, 400, 160, 700],
    data: {
      occurrenceId: dose.occurrenceId,
      url: `/?alarm=${encodeURIComponent(dose.occurrenceId)}`,
    },
    badge: "/icon-192.png",
    icon: "/icon-192.png",
  };

  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker?.controller : null;
  if (sw) {
    sw.postMessage({
      type: "notify",
      payload: { title, body, ...options, occurrenceId: dose.occurrenceId },
    });
    return;
  }
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    /* fall through */
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, options);
  }
}

export async function closeDoseNotification(occurrenceId: string) {
  const tags = [`pilurica-${occurrenceId}`, `pirulica-${occurrenceId}`];
  try {
    const reg = await navigator.serviceWorker?.ready;
    for (const tag of tags) {
      const notes = await reg?.getNotifications({ tag });
      notes?.forEach((n) => n.close());
    }
  } catch {
    /* ignore */
  }
  for (const tag of tags) {
    navigator.serviceWorker?.controller?.postMessage({ type: "close", tag });
  }
}

export function detectOem(): "samsung" | "xiaomi" | "huawei" | "oppo" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/SamsungBrowser|SM-/i.test(ua)) return "samsung";
  if (/MiuiBrowser|XiaoMi|Redmi|POCO/i.test(ua)) return "xiaomi";
  if (/Huawei|Honor|HUAWEI/i.test(ua)) return "huawei";
  if (/OPPO|OnePlus|Realme|vivo/i.test(ua)) return "oppo";
  return "other";
}

declare global {
  interface NotificationOptions {
    vibrate?: number[];
    renotify?: boolean;
    actions?: Array<{ action: string; title: string }>;
  }
}

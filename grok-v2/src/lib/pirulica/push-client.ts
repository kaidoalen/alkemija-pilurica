import { ackPushOccurrence, subscribeDevice, syncPushAlarms } from "@/lib/push/actions";
import { VAPID_PUBLIC_KEY } from "@/lib/push/vapid";
import { opaqueFires } from "./schedule";
import { deviceId, getSnapshot } from "./store";
import { registerServiceWorker, requestNotificationPermission } from "./notifications";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribePush(): Promise<boolean> {
  const perm = await requestNotificationPermission();
  if (perm !== "granted") return false;
  const reg = await registerServiceWorker();
  if (!reg || !reg.pushManager) return false;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
  await subscribeDevice({
    data: {
      deviceId: deviceId(),
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  });
  await syncScheduleToServer();
  await registerPeriodicSync(reg);
  return true;
}

export async function syncScheduleToServer() {
  const snap = getSnapshot();
  const fires = opaqueFires(snap.meds, snap.snoozes);
  try {
    await syncPushAlarms({
      data: { deviceId: deviceId(), fires },
    });
  } catch {
    /* preview / offline */
  }
}

export async function ackOccurrence(occurrenceId: string) {
  try {
    await ackPushOccurrence({
      data: { deviceId: deviceId(), occurrenceId },
    });
  } catch {
    /* ignore */
  }
}

async function registerPeriodicSync(reg: ServiceWorkerRegistration) {
  const ps = (
    reg as ServiceWorkerRegistration & {
      periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
    }
  ).periodicSync;
  if (!ps) return;
  try {
    await ps.register("pilurica-watch", { minInterval: 15 * 60 * 1000 });
  } catch {
    /* not installed / not granted */
  }
}

import { startAlarmSound, startSleepGuard, stopAlarmSound, stopVibrate, unlockAudio, vibrateAlarm } from "./audio";
import { writeSchedule } from "./idb";
import {
  closeDoseNotification,
  registerServiceWorker,
  requestNotificationPermission,
  setIconBadge,
  showDoseNotification,
  showStockNotification,
} from "./notifications";
import { dueUnacked, nextRingCount, nextUpcoming, type PlannedDose } from "./schedule";
import { daysOfStock, stockWarning } from "./stock";
import {
  getSnapshot,
  markMissed,
  markTaken,
  patchSettings,
  queueAlarm,
  setRinging,
  snoozeDose,
  subscribe,
} from "./store";

let armed = false;
let timer: number | null = null;
let testTimer: number | null = null;
let tickTimer: number | null = null;
let vibrateLoop: number | null = null;
let wakeLock: WakeLockSentinel | null = null;
const fired = new Set<string>();
let rangAt = 0;
let lastBurstAt = 0;
const BASE_TITLE = typeof document === "undefined" ? "Pilurica" : document.title || "Pilurica";
const NAG_MS = 20_000;
const ESCALATE_MS = 15 * 60 * 1000;
const STOCK_NOTE_KEY = "pilurica-stock-notified";

function stockSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STOCK_NOTE_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

function rememberStockNote(id: string) {
  const today = new Date().toISOString().slice(0, 10);
  const next = stockSeen();
  for (const item of [...next]) {
    if (!item.endsWith(`:${today}`)) next.delete(item);
  }
  next.add(id);
  try {
    localStorage.setItem(STOCK_NOTE_KEY, JSON.stringify([...next]));
  } catch {
    /* ignore */
  }
}

function checkStockAlerts() {
  const snap = getSnapshot();
  const today = new Date().toISOString().slice(0, 10);
  const seen = stockSeen();
  for (const med of snap.meds) {
    const warn = stockWarning(med);
    if (warn !== "low" && warn !== "out") continue;
    const id = `${med.id}:${today}`;
    if (seen.has(id)) continue;
    rememberStockNote(id);
    const days = warn === "out" ? 0 : Math.max(1, Math.ceil(daysOfStock(med) ?? 1));
    const personName = snap.people.find((p) => p.id === med.personId)?.name ?? "";
    void showStockNotification({
      medId: med.id,
      name: med.name,
      personName,
      days,
    });
  }
}

function alarmTitle(name: string) {
  if (typeof document === "undefined") return;
  document.title = `⏰ ${name} — Pilurica`;
}

function restoreTitle() {
  if (typeof document === "undefined") return;
  document.title = BASE_TITLE.includes("Pilurica") ? "Pilurica" : BASE_TITLE;
}

async function requestBackgroundScan() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (
      reg as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      }
    )?.sync;
    await sync?.register("pilurica-scan");
  } catch {
    /* unsupported */
  }
}

function burst(dose: PlannedDose, opts?: { forceSound?: boolean }) {
  const snap = getSnapshot();
  const rings = Math.min(8, dose.ringCount ?? 2);
  const mustSound =
    opts?.forceSound || snap.settings.soundEnabled || isTestDose(dose);
  lastBurstAt = Date.now();
  alarmTitle(dose.name);
  if (mustSound) void startAlarmSound(rings);
  startVibrateLoop(rings);
  void requestWakeLock();
  void showDoseNotification(dose).catch(() => undefined);
  const due = dueUnacked(snap.meds, snap.logs, snap.snoozes).length;
  void setIconBadge(Math.max(1, due || 1));
  void requestBackgroundScan();
}

function clearTimer() {
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

function startVibrateLoop(rings = 2) {
  stopVibrateLoop();
  let left = Math.max(1, Math.min(8, rings));
  const tick = () => {
    const ringing = getSnapshot().ringing;
    if (!ringing || left <= 0) {
      stopVibrateLoop();
      return;
    }
    if (getSnapshot().settings.vibrateEnabled || isTestDose(ringing)) {
      vibrateAlarm();
    }
    left -= 1;
    if (left > 0) vibrateLoop = window.setTimeout(tick, 1400);
  };
  tick();
}

function stopVibrateLoop() {
  if (vibrateLoop != null) {
    window.clearTimeout(vibrateLoop);
    vibrateLoop = null;
  }
  stopVibrate();
}

function isTestDose(dose: PlannedDose) {
  return dose.occurrenceId.startsWith("test:") || dose.medId === "test";
}

async function persistAndSync() {
  const snap = getSnapshot();
  await writeSchedule(snap);
  navigator.serviceWorker?.controller?.postMessage({
    type: "schedule",
    payload: {
      upcoming: [
        ...dueUnacked(snap.meds, snap.logs, snap.snoozes),
        ...snap.snoozes,
      ],
    },
  });
  const { syncScheduleToServer } = await import("./push-client");
  await syncScheduleToServer();
}

async function requestWakeLock() {
  try {
    if (document.visibilityState !== "visible") return;
    wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
    wakeLock?.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

export async function fireDose(dose: PlannedDose, opts?: { forceSound?: boolean }) {
  const snap = getSnapshot();
  if (snap.logs.some((l) => l.id === dose.occurrenceId && l.result === "taken")) {
    return;
  }
  if (snap.ringing?.occurrenceId === dose.occurrenceId) {
    burst(snap.ringing, opts);
    return;
  }
  fired.add(dose.occurrenceId);
  const personName =
    snap.people.find((p) => p.id === dose.personId)?.name || dose.personName;
  const labeled: PlannedDose = {
    ...dose,
    personName,
    ringCount: Math.min(8, dose.ringCount ?? 2),
  };
  rangAt = Date.now();
  setRinging(labeled);
  burst(labeled, opts);
}

export async function resolveTaken(dose: PlannedDose) {
  markTaken(dose);
  fired.delete(dose.occurrenceId);
  stopAlarmSound();
  stopVibrateLoop();
  releaseWakeLock();
  restoreTitle();
  await closeDoseNotification(dose.occurrenceId);
  const { ackOccurrence } = await import("./push-client");
  await ackOccurrence(dose.occurrenceId);
  await persistAndSync();
  armNext();
}

export async function resolveSnooze(dose: PlannedDose, minutes?: number) {
  const m = minutes ?? (getSnapshot().settings.snoozeMinutes || 15);
  snoozeDose(dose, m);
  fired.delete(dose.occurrenceId);
  stopAlarmSound();
  stopVibrateLoop();
  releaseWakeLock();
  restoreTitle();
  await closeDoseNotification(dose.occurrenceId);
  await persistAndSync();
  armNext();
}

export async function resolveDismiss(dose: PlannedDose) {
  markMissed(dose);
  fired.delete(dose.occurrenceId);
  stopAlarmSound();
  stopVibrateLoop();
  releaseWakeLock();
  restoreTitle();
  await closeDoseNotification(dose.occurrenceId);
  await persistAndSync();
  armNext();
}

function armNext() {
  clearTimer();
  const snap = getSnapshot();
  if (snap.ringing) return;
  const overdue = dueUnacked(snap.meds, snap.logs, snap.snoozes).find(
    (d) => !fired.has(d.occurrenceId),
  );
  if (overdue) {
    void fireDose(overdue);
    return;
  }
  const next = nextUpcoming(snap.meds, snap.logs, snap.snoozes);
  if (!next || fired.has(next.occurrenceId)) return;
  const delay = Math.min(Math.max(next.at - Date.now(), 50), 2_147_000_000);
  timer = window.setTimeout(() => {
    void fireDose(next);
  }, delay);
}

function onVisibility() {
  void unlockAudio();
  void persistAndSync();
  if (document.visibilityState === "visible") {
    const ringing = getSnapshot().ringing;
    if (ringing) burst(ringing, { forceSound: true });
    armNext();
  }
}

function onMessage(event: MessageEvent) {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "sw-taken" && msg.occurrenceId) {
    const dose = findDose(msg.occurrenceId);
    if (dose) void resolveTaken(dose);
  }
  if (msg.type === "sw-snooze" && msg.occurrenceId) {
    const dose = findDose(msg.occurrenceId);
    if (dose) void resolveSnooze(dose);
  }
  if (msg.type === "sw-open" && msg.occurrenceId) {
    const dose = findDose(msg.occurrenceId);
    if (dose) void fireDose(dose, { forceSound: true });
  }
  if (msg.type === "sw-alarm" && msg.occurrenceId) {
    const dose = findDose(msg.occurrenceId);
    if (dose) void fireDose(dose, { forceSound: true });
  }
}

function findDose(occurrenceId: string): PlannedDose | null {
  const snap = getSnapshot();
  if (snap.ringing?.occurrenceId === occurrenceId) return snap.ringing;
  return (
    dueUnacked(snap.meds, snap.logs, snap.snoozes).find(
      (d) => d.occurrenceId === occurrenceId,
    ) ??
    snap.snoozes.find((d) => d.occurrenceId === occurrenceId) ??
    nextUpcoming(snap.meds, snap.logs, snap.snoozes)
  );
}

export function startEngine() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const unlockOnce = () => {
    void unlockAudio();
    patchSettings({ soundEnabled: true, vibrateEnabled: true });
    void import("./push-client").then((m) => m.ensureLockAlarms()).catch(() => undefined);
  };
  document.addEventListener("pointerdown", unlockOnce, { once: true, passive: true });
  document.addEventListener("keydown", unlockOnce, { once: true, passive: true });
  void registerServiceWorker();
  patchSettings({ soundEnabled: true, vibrateEnabled: true });
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    void import("./push-client").then((m) => m.ensureLockAlarms()).catch(() => undefined);
  }
  void persistAndSync();
  startSleepGuard();
  armNext();
  checkStockAlerts();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", armNext);
  window.addEventListener("pageshow", armNext);
  window.addEventListener("online", () => void persistAndSync());
  navigator.serviceWorker?.addEventListener("message", onMessage);
  subscribe(() => {
    void writeSchedule(getSnapshot());
    armNext();
    checkStockAlerts();
  });
  window.addEventListener("pilurica-changed", () => {
    void persistAndSync();
    armNext();
  });
  window.addEventListener("pirulica-changed", () => {
    void persistAndSync();
    armNext();
  });
  tickTimer = window.setInterval(() => {
    const snap = getSnapshot();
    if (snap.ringing) {
      const now = Date.now();
      if (now - rangAt >= ESCALATE_MS) {
        const next: PlannedDose = {
          ...snap.ringing,
          ringCount: nextRingCount(snap.ringing),
          at: now,
        };
        rangAt = now;
        setRinging(next);
        burst(next, { forceSound: true });
        return;
      }
      if (now - lastBurstAt >= NAG_MS) {
        burst(snap.ringing, { forceSound: true });
      }
      return;
    }
    armNext();
  }, 5_000);
}

function makeTestDose(at: number): PlannedDose {
  return {
    occurrenceId: `test:${at}`,
    medId: "test",
    personId: "",
    personName: "",
    name: "Proba alarma",
    dose: "samo zvuk — nije lijek",
    color: "clay",
    tabletsPerDose: 1,
    at,
  };
}

/** Immediate ring — must be called from a tap so the phone allows sound. */
export async function testAlarmNow() {
  await unlockAudio();
  const dose = makeTestDose(Date.now());
  fired.delete(dose.occurrenceId);
  if (testTimer != null) {
    window.clearTimeout(testTimer);
    testTimer = null;
  }
  await fireDose(dose, { forceSound: true });
  void requestNotificationPermission();
}

export async function testAlarmIn(seconds: number) {
  await unlockAudio();
  patchSettings({ soundEnabled: true, vibrateEnabled: true });
  try {
    const { ensureLockAlarms } = await import("./push-client");
    await ensureLockAlarms();
  } catch {
    /* preview */
  }
  const at = Date.now() + seconds * 1000;
  const dose = makeTestDose(at);
  fired.delete(dose.occurrenceId);
  queueAlarm(dose);
  await persistAndSync();
  if (testTimer != null) window.clearTimeout(testTimer);
  testTimer = window.setTimeout(() => {
    testTimer = null;
    void fireDose(dose, { forceSound: true });
  }, Math.max(seconds * 1000, 0));
  return dose;
}

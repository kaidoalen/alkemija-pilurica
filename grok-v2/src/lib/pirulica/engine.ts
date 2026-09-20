import { startAlarmSound, stopAlarmSound, stopVibrate, unlockAudio, vibrateAlarm } from "./audio";
import { writeSchedule } from "./idb";
import {
  closeDoseNotification,
  registerServiceWorker,
  requestNotificationPermission,
  showDoseNotification,
  showStockNotification,
} from "./notifications";
import { dueUnacked, nextUpcoming, type PlannedDose } from "./schedule";
import { daysOfStock, stockWarning } from "./stock";
import {
  getSnapshot,
  markMissed,
  markTaken,
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

function clearTimer() {
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

function startVibrateLoop() {
  stopVibrateLoop();
  vibrateAlarm();
  vibrateLoop = window.setInterval(() => {
    if (!getSnapshot().ringing) {
      stopVibrateLoop();
      return;
    }
    if (getSnapshot().settings.vibrateEnabled) vibrateAlarm();
  }, 1400);
}

function stopVibrateLoop() {
  if (vibrateLoop != null) {
    window.clearInterval(vibrateLoop);
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
  fired.add(dose.occurrenceId);
  const personName =
    snap.people.find((p) => p.id === dose.personId)?.name || dose.personName;
  const labeled: PlannedDose = { ...dose, personName };
  setRinging(labeled);
  try {
    await showDoseNotification(labeled);
  } catch {
    /* overlay still rings */
  }
  const mustSound =
    opts?.forceSound || snap.settings.soundEnabled || isTestDose(dose);
  if (mustSound) await startAlarmSound();
  if (snap.settings.vibrateEnabled || isTestDose(dose)) startVibrateLoop();
  await requestWakeLock();
}

export async function resolveTaken(dose: PlannedDose) {
  markTaken(dose);
  fired.delete(dose.occurrenceId);
  stopAlarmSound();
  stopVibrateLoop();
  releaseWakeLock();
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
  if (document.visibilityState === "visible") {
    if (getSnapshot().ringing && getSnapshot().settings.soundEnabled) {
      void startAlarmSound();
      void requestWakeLock();
    }
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
    if (dose) void fireDose(dose);
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
  void registerServiceWorker();
  void persistAndSync();
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
      if (Date.now() - snap.ringing.at > 15 * 60 * 1000) {
        void resolveDismiss(snap.ringing);
      }
      return;
    }
    armNext();
  }, 15_000);
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
  void requestNotificationPermission();
  const dose = makeTestDose(Date.now());
  fired.delete(dose.occurrenceId);
  if (testTimer != null) {
    window.clearTimeout(testTimer);
    testTimer = null;
  }
  await fireDose(dose, { forceSound: true });
}

export async function testAlarmIn(seconds: number) {
  await unlockAudio();
  void requestNotificationPermission();
  const at = Date.now() + seconds * 1000;
  const dose = makeTestDose(at);
  fired.delete(dose.occurrenceId);
  if (testTimer != null) window.clearTimeout(testTimer);
  testTimer = window.setTimeout(() => {
    testTimer = null;
    void fireDose(dose, { forceSound: true });
  }, Math.max(seconds * 1000, 0));
  return dose;
}

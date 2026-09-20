import { IDB_NAME, IDB_STORE } from "./types";
import { dueUnacked, planWindow, type PlannedDose } from "./schedule";
import type { Snapshot } from "./store";

export type SwSchedule = {
  upcoming: PlannedDose[];
  ringingId: string | null;
  soundEnabled: boolean;
  vibrateEnabled: boolean;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function writeSchedule(snap: Snapshot) {
  if (typeof indexedDB === "undefined") return;
  const upcoming = [
    ...dueUnacked(snap.meds, snap.logs, snap.snoozes),
    ...planWindow(snap.meds, Date.now(), 3).slice(0, 80),
    ...snap.snoozes,
  ];
  const unique = new Map<string, PlannedDose>();
  for (const d of upcoming) unique.set(d.occurrenceId, d);
  const payload: SwSchedule = {
    upcoming: [...unique.values()],
    ringingId: snap.ringing?.occurrenceId ?? null,
    soundEnabled: snap.settings.soundEnabled,
    vibrateEnabled: snap.settings.vibrateEnabled,
    updatedAt: Date.now(),
  };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(payload, "schedule");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore — SW will fall back to push payload */
  }
}

export async function readSchedule(): Promise<SwSchedule | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const value = await new Promise<SwSchedule | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get("schedule");
      req.onsuccess = () => resolve((req.result as SwSchedule) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export async function writePhotoMap(entries: Array<[string, string]>) {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      for (const [id, data] of entries) {
        store.put(data, `photo:${id}`);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* quota */
  }
}

export async function readPhotoMap(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (typeof indexedDB === "undefined") return out;
  try {
    const db = await openDb();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    for (const key of keys) {
      if (typeof key !== "string" || !key.startsWith("photo:")) continue;
      const value = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (typeof value === "string" && value.startsWith("data:image/")) {
        out[key.slice(6)] = value;
      }
    }
    db.close();
  } catch {
    /* ignore */
  }
  return out;
}

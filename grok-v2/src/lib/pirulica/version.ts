export const APP_VERSION = "2.4";
export const VERSION_SEEN_KEY = "pilurica-seen-version";
export const LAST_REFRESH_KEY = "pilurica-last-refresh";
export const REFRESH_EVERY_MS = 15 * 24 * 60 * 60 * 1000;

export function needsWhatsNew(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(VERSION_SEEN_KEY) !== APP_VERSION;
}

export function dismissWhatsNew() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(VERSION_SEEN_KEY, APP_VERSION);
}

export function ensureRefreshStamp() {
  if (typeof localStorage === "undefined") return;
  if (!localStorage.getItem(LAST_REFRESH_KEY)) {
    localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()));
  }
}

export function needsStaleRefresh(): boolean {
  if (typeof localStorage === "undefined") return false;
  const raw = localStorage.getItem(LAST_REFRESH_KEY);
  if (!raw) return false;
  const t = Number(raw);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > REFRESH_EVERY_MS;
}

export function markRefreshed() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()));
}

export async function refreshRuntime() {
  markRefreshed();
  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.all(
      (regs ?? []).map(async (reg) => {
        await reg.update();
        reg.waiting?.postMessage({ type: "SKIP_WAITING" });
      }),
    );
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* offline / no sw */
  }
}

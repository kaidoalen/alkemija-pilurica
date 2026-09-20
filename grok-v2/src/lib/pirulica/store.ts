import { useSyncExternalStore } from "react";
import { nid } from "./ids";
import type { PlannedDose } from "./schedule";
import {
  BACKUP_KEY,
  DEFAULT_PERSON,
  DEFAULT_PERSON_ID,
  DEFAULT_SETTINGS,
  DEVICE_KEY,
  IDB_NAME,
  LEGACY_DEVICE_KEY,
  STORAGE_KEY,
  type DoseLog,
  type ExportPayload,
  type Med,
  type MedColor,
  type Person,
  type Settings,
} from "./types";
import { ensureRefreshStamp, markRefreshed, refreshRuntime } from "./version";

export type Snapshot = {
  people: Person[];
  meds: Med[];
  logs: DoseLog[];
  snoozes: PlannedDose[];
  settings: Settings;
  ringing: PlannedDose | null;
  hydrated: boolean;
};

const empty: Snapshot = {
  people: [DEFAULT_PERSON],
  meds: [],
  logs: [],
  snoozes: [],
  settings: DEFAULT_SETTINGS,
  ringing: null,
  hydrated: false,
};

let state: Snapshot = empty;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function persist() {
  if (typeof localStorage === "undefined") return;
  const payload = persistable();
  const light = {
    ...payload,
    meds: payload.meds.map((m) => ({
      ...m,
      photo: m.photo ? `idb:${m.id}` : null,
    })),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(light));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(light));
    } catch {
      /* quota */
    }
  }
  void persistPhotos();
}

async function persistPhotos() {
  try {
    const { writePhotoMap } = await import("./idb");
    const { shrinkDataUrl } = await import("./image");
    const entries: Array<[string, string]> = [];
    const shrunk: Med[] = [];
    for (const m of state.meds) {
      if (!isDisplayablePhoto(m.photo) || !m.photo) {
        shrunk.push(m);
        continue;
      }
      let data = m.photo;
      if (data.length > 180_000) {
        try {
          data = await shrinkDataUrl(data, 720, 0.72);
        } catch {
          /* keep original */
        }
      }
      entries.push([m.id, data]);
      shrunk.push(data === m.photo ? m : { ...m, photo: data });
    }
    if (shrunk.some((m, i) => m.photo !== state.meds[i]?.photo)) {
      state = { ...state, meds: shrunk };
    }
    await writePhotoMap(entries);
  } catch {
    /* ignore */
  }
}

function persistable() {
  return {
    people: state.people,
    meds: state.meds,
    logs: state.logs.slice(-400),
    snoozes: state.snoozes.filter((s) => s.at > Date.now() - 3_600_000),
    settings: state.settings,
  };
}

function set(patch: Partial<Snapshot>) {
  state = { ...state, ...patch };
  persist();
  emit();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pilurica-changed"));
  }
}

export function getSnapshot(): Snapshot {
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePilurica(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => empty);
}

export function deviceId(): string {
  if (typeof localStorage === "undefined") return "ssr";
  let id = localStorage.getItem(DEVICE_KEY) ?? localStorage.getItem(LEGACY_DEVICE_KEY);
  if (!id) {
    id = nid();
    localStorage.setItem(DEVICE_KEY, id);
  } else if (!localStorage.getItem(DEVICE_KEY)) {
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

const COLORS: MedColor[] = ["pine", "clay", "ink", "moss"];

function firstString(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function firstNumber(r: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = r[k];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asTime(value: unknown): string | null {
  if (typeof value === "number" && value >= 0 && value <= 23) {
    return `${String(value).padStart(2, "0")}:00`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const hm = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (hm) {
      const h = Number(hm[1]);
      const m = Number(hm[2]);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      }
    }
    const hour = /^(\d{1,2})$/.exec(trimmed);
    if (hour) {
      const h = Number(hour[1]);
      if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:00`;
    }
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const h = Number(o.hour ?? o.hours ?? o.h ?? o.sat);
    const m = Number(o.minute ?? o.minutes ?? o.m ?? o.min ?? 0);
    if (Number.isFinite(h) && h >= 0 && h <= 23) {
      const min = Number.isFinite(m) ? m : 0;
      if (min >= 0 && min <= 59) {
        return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      }
    }
  }
  return null;
}

function parseTimes(r: Record<string, unknown>): string[] {
  const nested =
    r.schedule && typeof r.schedule === "object" && !Array.isArray(r.schedule)
      ? (r.schedule as Record<string, unknown>)
      : null;
  const raw =
    r.clockTimes ??
    r.times ??
    r.satnice ??
    r.vremena ??
    r.hours ??
    r.hourList ??
    r.alarms ??
    nested?.times ??
    nested?.hours ??
    r.time ??
    r.vrijeme ??
    r.alarmTime;

  const fromList = (value: unknown): string[] => {
    if (typeof value === "string" && /[,;]/.test(value)) {
      return value.split(/[,;]/).map(asTime).filter((t): t is string => Boolean(t));
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (item && typeof item === "object") {
            const o = item as Record<string, unknown>;
            return asTime(o.time ?? o.at ?? o.hour ?? o.vrijeme ?? o.hm);
          }
          return asTime(item);
        })
        .filter((t): t is string => Boolean(t));
    }
    const single = asTime(value);
    return single ? [single] : [];
  };

  const times = fromList(raw);
  if (times.length) return [...new Set(times)];

  if (Array.isArray(r.doses)) {
    const fromDoses = fromList(r.doses);
    if (fromDoses.length) return [...new Set(fromDoses)];
  }

  const named: string[] = [];
  if (r.morning || r.ujutro || r.am) named.push("08:00");
  if (r.noon || r.podne) named.push("12:00");
  if (r.evening || r.navecer || r.navečer || r.pm) named.push("20:00");
  if (r.night || r.noc || r.noć) named.push("22:00");
  if (named.length) return named;

  const perDay = firstNumber(r, [
    "timesPerDay",
    "putaDnevno",
    "frequency",
    "ponavljanja",
    "repeats",
    "repeatCount",
  ]);
  if (perDay && perDay >= 1) {
    const presets = [
      ["08:00"],
      ["08:00", "20:00"],
      ["08:00", "14:00", "20:00"],
      ["08:00", "12:00", "18:00", "22:00"],
    ];
    return presets[Math.min(Math.floor(perDay), 4) - 1];
  }
  return ["08:00"];
}

function parseDays(r: Record<string, unknown>): number[] {
  const nested =
    r.schedule && typeof r.schedule === "object" && !Array.isArray(r.schedule)
      ? (r.schedule as Record<string, unknown>)
      : null;
  const repeat = String(r.repeat ?? r.ponavljanje ?? r.frequencyLabel ?? r.every ?? "")
    .trim()
    .toLowerCase();
  if (
    /daily|everyday|svaki dan|svakodnev|every day/.test(repeat) ||
    r.everyDay === true ||
    r.daily === true
  ) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  if (/weekday|radni/.test(repeat)) return [1, 2, 3, 4, 5];
  if (/weekend|vikend/.test(repeat)) return [0, 6];
  const interval = firstNumber(r, ["intervalDays", "interval", "svakihDana"]);
  if (interval === 1) return [0, 1, 2, 3, 4, 5, 6];

  const raw = r.days ?? r.dani ?? r.weekdays ?? nested?.days ?? nested?.dani;
  if (!Array.isArray(raw)) return [0, 1, 2, 3, 4, 5, 6];
  const days = raw
    .map((d) => {
      if (typeof d === "number") return d;
      const map: Record<string, number> = {
        ned: 0,
        nedjelja: 0,
        sun: 0,
        sunday: 0,
        pon: 1,
        ponedjeljak: 1,
        mon: 1,
        monday: 1,
        uto: 2,
        utorak: 2,
        tue: 2,
        tuesday: 2,
        sri: 3,
        srijeda: 3,
        wed: 3,
        wednesday: 3,
        cet: 4,
        čet: 4,
        četvrtak: 4,
        thu: 4,
        thursday: 4,
        pet: 5,
        petak: 5,
        fri: 5,
        friday: 5,
        sub: 6,
        subota: 6,
        sat: 6,
        saturday: 6,
      };
      return map[String(d).trim().toLowerCase()] ?? Number(d);
    })
    .filter((d) => d >= 0 && d <= 6);
  return days.length ? days : [0, 1, 2, 3, 4, 5, 6];
}

function parseExpiry(r: Record<string, unknown>): string | null {
  const raw = firstString(r, [
    "expiry",
    "rok",
    "expires",
    "expiryDate",
    "rokTrajanja",
    "expiresOn",
  ]);
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const hr = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(raw);
  if (hr) return `${hr[3]}-${hr[2].padStart(2, "0")}-${hr[1].padStart(2, "0")}`;
  return null;
}

function isDisplayablePhoto(value: string | null | undefined): boolean {
  return Boolean(value && (value.startsWith("data:image/") || /^https?:\/\//i.test(value)));
}

function bytesToDataUrl(bytes: Uint8Array, mime = "image/jpeg"): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function normalizePhoto(value: unknown, mime = "image/jpeg"): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const p = normalizePhoto(item, mime);
      if (p) return p;
    }
    return null;
  }
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
    return bytesToDataUrl(new Uint8Array(value), mime);
  }
  if (typeof Uint8Array !== "undefined" && value instanceof Uint8Array) {
    return bytesToDataUrl(value, mime);
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const nextMime =
      typeof o.mimeType === "string" && o.mimeType.startsWith("image/")
        ? o.mimeType
        : typeof o.type === "string" && o.type.startsWith("image/")
          ? o.type
          : mime;
    if (typeof Blob !== "undefined" && o.blob instanceof Blob) {
      return null;
    }
    return normalizePhoto(
      o.data ?? o.src ?? o.url ?? o.base64 ?? o.photo ?? o.image ?? o.dataUrl,
      nextMime,
    );
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || s.startsWith("idb:")) return null;
  if (s.startsWith("data:image/")) return s;
  if (/^https?:\/\//i.test(s) && s.length < 4000) return s;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const body = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  if (body.length > 24 && /^[A-Za-z0-9+/=\s]+$/.test(body.slice(0, 120))) {
    return `data:${mime};base64,${body.replace(/\s/g, "")}`;
  }
  return null;
}

function strengthFromName(name: string): string {
  const m = /(\d+[\d.,]*\s*(?:mg|mcg|µg|ug|g|ml|i\.?u\.?|ij)\b.*)$/i.exec(name);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function asPhoto(r: Record<string, unknown>): string | null {
  const keys = [
    "photo",
    "image",
    "slika",
    "photoData",
    "imageData",
    "thumbnail",
    "thumb",
    "boxPhoto",
    "kutija",
    "photoUrl",
    "dataUrl",
    "photos",
    "images",
    "slike",
  ];
  for (const k of keys) {
    const p = normalizePhoto(r[k]);
    if (p) return p;
  }
  return null;
}

function asMed(raw: unknown): Med | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = firstString(r, ["name", "naziv", "title", "lijek", "drug", "medication"]);
  if (!name) return null;
  const times = parseTimes(r);
  const days = parseDays(r);
  const color = COLORS.includes(r.color as MedColor) ? (r.color as MedColor) : "pine";
  const stockN = firstNumber(r, [
    "remainingTablets",
    "stock",
    "remaining",
    "tableta",
    "kolicina",
    "količina",
    "quantity",
    "count",
    "brojTableta",
    "broj",
    "zaliha",
    "zalihe",
    "qty",
    "qtyLeft",
    "remainingCount",
    "inventory",
    "left",
  ]);
  const packN = firstNumber(r, [
    "tabletsInBox",
    "packSize",
    "kutija",
    "pack",
    "pakiranje",
    "boxSize",
    "packCount",
  ]);
  const perDose = firstNumber(r, [
    "tabletsPerDose",
    "perDose",
    "uDozi",
    "doseCount",
    "komada",
    "kom",
  ]);
  const photo = asPhoto(r);
  const dose =
    firstString(r, ["dose", "doza", "gramaza", "gramaža", "strength", "jacina", "jačina"]) ||
    strengthFromName(name);
  return {
    id: String(r.id ?? r._id ?? nid()),
    personId: String(r.personId ?? r.patientId ?? r.person ?? r.osoba ?? r.ownerId ?? DEFAULT_PERSON_ID),
    name,
    dose,
    form: firstString(r, ["form", "oblik", "type", "vrsta"]) || "tablete",
    color,
    times,
    days,
    notes: [
      firstString(r, ["notes", "biljeska", "bilješka", "napomena"]),
      firstString(r, ["ean", "barcode", "gtin"])
        ? `EAN ${firstString(r, ["ean", "barcode", "gtin"])}`
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
    active: r.active !== false && r.enabled !== false,
    createdAt: Number(r.createdAt ?? r.created) || Date.now(),
    stock: stockN != null ? Math.max(0, stockN) : null,
    tabletsPerDose: Math.max(1, perDose ?? 1),
    packSize: packN != null ? Math.max(0, packN) : null,
    expiry: parseExpiry(r),
    photo,
  };
}

function asPerson(raw: unknown): Person | null {
  if (typeof raw === "string" && raw.trim()) {
    return { id: nid(), name: raw.trim().slice(0, 40), createdAt: Date.now() };
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = firstString(r, ["name", "naziv", "ime", "title"]);
  if (!name) return null;
  return {
    id: String(r.id ?? r._id ?? nid()),
    name: name.slice(0, 40),
    createdAt: Number(r.createdAt) || Date.now(),
  };
}

function asSettings(raw: unknown): Settings {
  if (Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const snooze = Number(r.snoozeMinutes ?? r.odgoda);
  return {
    ...DEFAULT_SETTINGS,
    snoozeMinutes: snooze === 30 ? 30 : 15,
    soundEnabled: r.soundEnabled !== false && r.zvuk !== false,
    vibrateEnabled: r.vibrateEnabled !== false && r.vibracija !== false,
    setupDismissed: Boolean(r.setupDismissed),
    currentPersonId: String(r.currentPersonId ?? r.personId ?? DEFAULT_PERSON_ID),
  };
}

function parseBundle(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function unwrap(rec: Record<string, unknown>): Record<string, unknown> {
  if (rec.state && typeof rec.state === "object" && !Array.isArray(rec.state)) {
    return rec.state as Record<string, unknown>;
  }
  if (rec.data && typeof rec.data === "object" && !Array.isArray(rec.data)) {
    return rec.data as Record<string, unknown>;
  }
  return rec;
}

function pickArray(rec: Record<string, unknown>, keys: string[]): unknown[] {
  const src = unwrap(rec);
  for (const k of keys) {
    if (Array.isArray(src[k])) return src[k] as unknown[];
    if (Array.isArray(rec[k])) return rec[k] as unknown[];
  }
  return [];
}

function asLog(raw: unknown): DoseLog | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "");
  const medId = String(r.medId ?? r.medicineId ?? "");
  if (!id && !medId) return null;
  const date = String(r.date ?? "");
  const time = String(r.time ?? "");
  let scheduledAt = Number(r.scheduledAt);
  if (!Number.isFinite(scheduledAt) && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const hm = /^\d{2}:\d{2}$/.test(time) ? time : "08:00";
    scheduledAt = new Date(`${date}T${hm}:00`).getTime();
  }
  const resolvedAt = Number(r.resolvedAt ?? r.takenAt ?? Date.now());
  const result =
    r.result === "missed" || r.result === "snoozed" ? r.result : "taken";
  return {
    id: id || `${medId}:${scheduledAt}`,
    medId,
    name: String(r.name ?? r.medicineName ?? ""),
    dose: String(r.dose ?? ""),
    scheduledAt: Number.isFinite(scheduledAt) ? scheduledAt : resolvedAt,
    resolvedAt: Number.isFinite(resolvedAt) ? resolvedAt : Date.now(),
    result,
  };
}

const legacyMedIds = new Map<string, string>();

function resolveMedId(id: string): string {
  return legacyMedIds.get(id) ?? id;
}

function photoRank(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const o = raw as Record<string, unknown>;
  let n = 0;
  const kind = String(o.kind ?? "");
  if (kind === "box" || kind === "kutija") n += 10;
  if (Number(o.slot) === 0) n += 5;
  if (kind === "blister") n += 2;
  return n;
}

function attachOldPhotos(meds: Med[], photos: unknown[]): Med[] {
  const ranked = [...photos].sort((a, b) => photoRank(b) - photoRank(a));
  const byMed = new Map<string, string>();
  for (const p of ranked) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const id = String(o.medicineId ?? o.medId ?? "");
    const url = normalizePhoto(o);
    if (!url) continue;
    if (id) {
      byMed.set(id, url);
      byMed.set(resolveMedId(id), url);
    }
  }
  return meds.map((m) => {
    if (isDisplayablePhoto(m.photo)) return m;
    const url = byMed.get(m.id) ?? byMed.get(resolveMedId(m.id)) ?? null;
    return { ...m, photo: url };
  });
}

function fromParsed(parsed: Partial<Snapshot> | ExportPayload | Record<string, unknown>): Snapshot {
  const rec = unwrap(parsed as Record<string, unknown>);
  const peopleRaw = pickArray(rec, [
    "people",
    "persons",
    "patients",
    "osobe",
    "profiles",
    "users",
  ]);
  let people = peopleRaw.map(asPerson).filter((p): p is Person => Boolean(p));
  if (!people.length) people = [{ ...DEFAULT_PERSON }];
  const meds = pickArray(rec, [
    "meds",
    "medications",
    "medicines",
    "lijekovi",
    "drugs",
    "pills",
    "items",
    "therapies",
    "tablete",
  ])
    .map(asMed)
    .filter((m): m is Med => Boolean(m))
    .map((m) => (people.some((p) => p.id === m.personId) ? m : { ...m, personId: people[0].id }));
  const withPhotos = attachOldPhotos(meds, pickArray(rec, ["photos", "slike", "images"]));
  const logsRaw = pickArray(rec, [
    "logs",
    "records",
    "zapisi",
    "history",
    "taken",
    "doseLogs",
  ]);
  const logs = logsRaw.map(asLog).filter((l): l is DoseLog => Boolean(l));
  const snoozes = (Array.isArray(rec.snoozes) ? rec.snoozes : []) as PlannedDose[];
  const settings = asSettings(rec.settings ?? rec);
  if (!people.some((p) => p.id === settings.currentPersonId)) {
    settings.currentPersonId = people[0].id;
  }
  return {
    people,
    meds: withPhotos,
    logs: Array.isArray(logs) ? logs : [],
    snoozes: Array.isArray(snoozes) ? snoozes : [],
    settings,
    ringing: null,
    hydrated: true,
  };
}

function fromRawString(raw: string | null): Snapshot | null {
  if (!raw) return null;
  const parsed = parseBundle(raw);
  if (!parsed) return null;
  const next = fromParsed(parsed);
  if (next.meds.length) return next;
  const looksLikeBundle = pickArray(unwrap(parsed), [
    "meds",
    "medications",
    "lijekovi",
    "people",
    "osobe",
  ]).length;
  return looksLikeBundle ? next : null;
}

function medScore(m: Med): number {
  return (
    (m.photo ? 8 : 0) +
    (m.stock != null ? 3 : 0) +
    (m.times.length > 1 ? 2 : 0) +
    (m.days.length === 7 ? 1 : 0) +
    (m.dose ? 1 : 0) +
    (m.packSize != null ? 1 : 0)
  );
}

function richerMed(a: Med, b: Med): Med {
  const pick = medScore(b) >= medScore(a) ? b : a;
  const other = pick === b ? a : b;
  return {
    ...other,
    ...pick,
    name: pick.name || other.name,
    dose: pick.dose || other.dose,
    form: pick.form || other.form,
    times: pick.times.length >= other.times.length ? pick.times : other.times,
    days: pick.days.length >= other.days.length ? pick.days : other.days,
    notes: pick.notes || other.notes,
    stock: pick.stock ?? other.stock,
    packSize: pick.packSize ?? other.packSize,
    expiry: pick.expiry || other.expiry,
    photo:
      isDisplayablePhoto(pick.photo)
        ? pick.photo
        : isDisplayablePhoto(other.photo)
          ? other.photo
          : null,
    tabletsPerDose: Math.max(pick.tabletsPerDose || 1, other.tabletsPerDose || 1),
  };
}

function mergeSnapshots(base: Snapshot, extra: Snapshot): Snapshot {
  const people = [...base.people];
  const personIdMap = new Map<string, string>();
  for (const p of extra.people) {
    const existing = people.find(
      (x) => x.id === p.id || x.name.trim().toLowerCase() === p.name.trim().toLowerCase(),
    );
    if (existing) {
      personIdMap.set(p.id, existing.id);
    } else {
      people.push(p);
    }
  }
  const meds = [...base.meds];
  for (const m of extra.meds) {
    const mapped: Med = {
      ...m,
      personId: personIdMap.get(m.personId) ?? m.personId,
    };
    const idx = meds.findIndex(
      (x) =>
        x.id === mapped.id ||
        (x.personId === mapped.personId && x.name.toLowerCase() === mapped.name.toLowerCase()),
    );
    if (idx >= 0) {
      const surviving = richerMed(meds[idx], mapped);
      legacyMedIds.set(mapped.id, surviving.id);
      legacyMedIds.set(meds[idx].id, surviving.id);
      meds[idx] = surviving;
    } else {
      legacyMedIds.set(mapped.id, mapped.id);
      meds.push(mapped);
    }
  }
  const logs = [...base.logs];
  for (const l of extra.logs) {
    if (!logs.some((x) => x.id === l.id)) logs.push(l);
  }
  const settings = { ...base.settings, ...extra.settings };
  const mappedCurrent = personIdMap.get(settings.currentPersonId) ?? settings.currentPersonId;
  settings.currentPersonId = people.some((p) => p.id === mappedCurrent)
    ? mappedCurrent
    : (people[0]?.id ?? DEFAULT_PERSON_ID);
  return {
    people,
    meds,
    logs,
    snoozes: extra.snoozes.length ? extra.snoozes : base.snoozes,
    settings,
    ringing: null,
    hydrated: true,
  };
}

function snapshotFromUnknown(value: unknown): Snapshot | null {
  if (!value) return null;
  if (typeof value === "string") return fromRawString(value);
  if (Array.isArray(value)) {
    const meds = value.map(asMed).filter((m): m is Med => Boolean(m));
    if (!meds.length) {
      let acc: Snapshot | null = null;
      for (const item of value) {
        const snap = snapshotFromUnknown(item);
        if (!snap) continue;
        acc = acc ? mergeSnapshots(acc, snap) : snap;
      }
      return acc;
    }
    return {
      ...empty,
      people: [{ ...DEFAULT_PERSON }],
      meds,
      hydrated: true,
    };
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const nested = snapshotFromUnknown(rec.state ?? rec.data ?? rec.value ?? rec.payload);
    const parsed = fromParsed(rec);
    const one = asMed(rec);
    let acc: Snapshot | null = parsed.meds.length ? parsed : null;
    if (nested) acc = acc ? mergeSnapshots(acc, nested) : nested;
    if (one) {
      const single: Snapshot = {
        ...empty,
        people: [{ ...DEFAULT_PERSON }],
        meds: [one],
        hydrated: true,
      };
      acc = acc ? mergeSnapshots(acc, single) : single;
    }
    return acc;
  }
  return null;
}

function scanAllLocalStorage(): Snapshot | null {
  if (typeof localStorage === "undefined") return null;
  let acc: Snapshot | null = null;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || key === DEVICE_KEY) continue;
    const cand = fromRawString(localStorage.getItem(key)) ?? snapshotFromUnknown(localStorage.getItem(key));
    if (!cand || !cand.meds.length) continue;
    acc = acc ? mergeSnapshots(acc, cand) : cand;
  }
  return acc;
}

async function collectIndexedDb(): Promise<Snapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  const names = new Set<string>(["lijekovi-podsjetnik"]);
  try {
    const listed = await indexedDB.databases();
    for (const d of listed) if (d.name) names.add(d.name);
  } catch {
    names.add(IDB_NAME);
    names.add("pilurica");
    names.add("pirulica");
  }
  let acc: Snapshot | null = null;
  for (const name of names) {
    const snap = await readOneDatabase(name);
    if (snap?.meds.length) acc = acc ? mergeSnapshots(acc, snap) : snap;
  }
  return acc;
}

function openExistingDb(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      resolve(db);
    };
    const timer = window.setTimeout(() => done(null), 800);
    let created = false;
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(name);
    } catch {
      window.clearTimeout(timer);
      done(null);
      return;
    }
    req.onupgradeneeded = () => {
      created = true;
      try {
        req.transaction?.abort();
      } catch {
        /* ignore */
      }
    };
    req.onsuccess = () => {
      window.clearTimeout(timer);
      if (created) {
        try {
          req.result.close();
        } catch {
          /* ignore */
        }
        done(null);
        return;
      }
      done(req.result);
    };
    req.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    req.onblocked = () => {
      window.clearTimeout(timer);
      done(null);
    };
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function hydrateStoreValues(values: unknown[]): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const value of values) {
    if (value && typeof value === "object") {
      const rec = value as Record<string, unknown>;
      const blob = rec.blob;
      if (typeof Blob !== "undefined" && blob instanceof Blob) {
        try {
          const dataUrl = await blobToDataUrl(blob);
          out.push({ ...rec, base64: dataUrl, mimeType: rec.blob instanceof Blob ? rec.blob.type || rec.mimeType : rec.mimeType });
          continue;
        } catch {
          /* skip blob */
        }
      }
      if (blob instanceof ArrayBuffer) {
        out.push({
          ...rec,
          base64: bytesToDataUrl(
            new Uint8Array(blob),
            typeof rec.mimeType === "string" ? rec.mimeType : "image/jpeg",
          ),
        });
        continue;
      }
      if (blob instanceof Uint8Array) {
        out.push({
          ...rec,
          base64: bytesToDataUrl(
            blob,
            typeof rec.mimeType === "string" ? rec.mimeType : "image/jpeg",
          ),
        });
        continue;
      }
    }
    out.push(value);
  }
  return out;
}

async function readOneDatabase(name: string): Promise<Snapshot | null> {
  const db = await openExistingDb(name);
  if (!db) return null;
  let acc: Snapshot | null = null;
  try {
    const names = Array.from(db.objectStoreNames);
    const bundle: Record<string, unknown[]> = {};
    for (const storeName of names) {
      const raw = await new Promise<unknown[]>((resolve) => {
        try {
          const tx = db.transaction(storeName, "readonly");
          const req = tx.objectStore(storeName).getAll();
          req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
      const values = await hydrateStoreValues(raw);
      if (
        storeName === "patients" ||
        storeName === "medicines" ||
        storeName === "photos" ||
        storeName === "doseLogs" ||
        storeName === "people" ||
        storeName === "meds"
      ) {
        bundle[storeName] = values;
      }
      const storeSnap = snapshotFromUnknown(values);
      if (storeSnap?.meds.length) acc = acc ? mergeSnapshots(acc, storeSnap) : storeSnap;
    }
    if (Object.keys(bundle).length) {
      const named = snapshotFromUnknown(bundle);
      if (named?.meds.length) acc = acc ? mergeSnapshots(acc, named) : named;
    }
  } finally {
    db.close();
  }
  return acc;
}

async function attachPhotos(snap: Snapshot): Promise<Snapshot> {
  try {
    const { readPhotoMap } = await import("./idb");
    const photos = await readPhotoMap();
    return {
      ...snap,
      meds: snap.meds.map((m) => {
        if (isDisplayablePhoto(m.photo)) return m;
        const fromIdb =
          photos[m.id] ||
          (m.photo?.startsWith("idb:") ? photos[m.photo.slice(4)] : undefined);
        return { ...m, photo: fromIdb || null };
      }),
    };
  } catch {
    return {
      ...snap,
      meds: snap.meds.map((m) => ({
        ...m,
        photo: isDisplayablePhoto(m.photo) ? m.photo : null,
      })),
    };
  }
}

export async function hydrateFromStorage() {
  if (typeof localStorage === "undefined") {
    state = { ...empty, hydrated: true };
    emit();
    return;
  }
  ensureRefreshStamp();
  const fromLs = scanAllLocalStorage();
  const fromIdb = await collectIndexedDb();
  let chosen: Snapshot | null = null;
  if (fromLs) chosen = fromLs;
  if (fromIdb) chosen = chosen ? mergeSnapshots(chosen, fromIdb) : fromIdb;
  if (!chosen) {
    state = { ...empty, hydrated: true };
    emit();
    return;
  }
  state = await attachPhotos(chosen);
  persist();
  emit();
}

export type RecoverReport = {
  meds: number;
  photos: number;
  withStock: number;
  withTimes: number;
};

export async function recoverFromDevice(): Promise<RecoverReport> {
  const fromLs = scanAllLocalStorage();
  const fromIdb = await collectIndexedDb();
  let found: Snapshot | null = state.hydrated && state.meds.length ? { ...state } : null;
  if (fromLs) found = found ? mergeSnapshots(found, fromLs) : fromLs;
  if (fromIdb) found = found ? mergeSnapshots(found, fromIdb) : fromIdb;
  if (!found) {
    return { meds: 0, photos: 0, withStock: 0, withTimes: 0 };
  }
  const next = await attachPhotos(found);
  state = next;
  persist();
  emit();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pilurica-changed"));
  }
  return {
    meds: next.meds.length,
    photos: next.meds.filter((m) => isDisplayablePhoto(m.photo)).length,
    withStock: next.meds.filter((m) => m.stock != null).length,
    withTimes: next.meds.filter((m) => m.times.length > 0).length,
  };
}

export const OLD_PILURICA_APP = "https://alkemija.com/app/#/postavke";
export const OLD_PILURICA_IZVOZ = "https://alkemija.com/app/izvoz.html";

function reportOf(snap: Snapshot): RecoverReport {
  return {
    meds: snap.meds.length,
    photos: snap.meds.filter((m) => isDisplayablePhoto(m.photo)).length,
    withStock: snap.meds.filter((m) => m.stock != null).length,
    withTimes: snap.meds.filter((m) => m.times.length > 0).length,
  };
}

async function shrinkIncomingPhotos(meds: Med[]): Promise<Med[]> {
  try {
    const { shrinkDataUrl } = await import("./image");
    const next: Med[] = [];
    for (const m of meds) {
      if (!isDisplayablePhoto(m.photo) || !m.photo) {
        next.push({ ...m, photo: null });
        continue;
      }
      try {
        next.push({ ...m, photo: await shrinkDataUrl(m.photo, 720, 0.72) });
      } catch {
        next.push(m);
      }
    }
    return next;
  } catch {
    return meds.map((m) => ({ ...m, photo: isDisplayablePhoto(m.photo) ? m.photo : null }));
  }
}

export async function ingestOldExport(raw: unknown): Promise<RecoverReport> {
  if (!raw || typeof raw !== "object") {
    return { meds: 0, photos: 0, withStock: 0, withTimes: 0 };
  }
  const incoming = fromParsed(raw as Record<string, unknown>);
  incoming.meds = await shrinkIncomingPhotos(incoming.meds);
  if (!incoming.meds.length && incoming.people.length <= 1) {
    const onlyPhotos = pickArray(raw as Record<string, unknown>, ["photos", "slike", "images"]);
    if (onlyPhotos.length) {
      for (const p of onlyPhotos) await ingestOldPhoto(p);
      return reportOf(state);
    }
    return { meds: 0, photos: 0, withStock: 0, withTimes: 0 };
  }
  const base = state.hydrated ? state : { ...empty, hydrated: true };
  const next = mergeSnapshots(base, incoming);
  state = next;
  persist();
  emit();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pilurica-changed"));
  }
  await persistPhotos();
  emit();
  return reportOf(state);
}

export async function ingestOldPhoto(raw: unknown): Promise<RecoverReport> {
  if (!raw || typeof raw !== "object") return reportOf(state);
  const o = raw as Record<string, unknown>;
  let url = normalizePhoto(o);
  if (!url) return reportOf(state);
  try {
    const { shrinkDataUrl } = await import("./image");
    url = await shrinkDataUrl(url, 720, 0.72);
  } catch {
    /* keep */
  }
  const incomingId = String(o.medicineId ?? o.medId ?? "");
  const name = firstString(o, ["name", "naziv", "medicineName"]).toLowerCase();
  const target = resolveMedId(incomingId);
  let hit = false;
  const meds = state.meds.map((m) => {
    if (isDisplayablePhoto(m.photo)) return m;
    const sameId = incomingId && (m.id === incomingId || m.id === target);
    const sameName = Boolean(name) && m.name.toLowerCase() === name;
    if (!sameId && !sameName) return m;
    hit = true;
    return { ...m, photo: url };
  });
  if (hit) {
    state = { ...state, meds };
    persist();
    emit();
    await persistPhotos();
    emit();
  }
  return reportOf(state);
}

export function ingestOldFile(file: File): Promise<RecoverReport> {
  return file.text().then((text) => {
    const parsed: unknown = JSON.parse(text);
    return ingestOldExport(parsed);
  });
}

export function listenForOldPilurica(onReport: (report: RecoverReport) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  let photoQueue: Promise<void> = Promise.resolve();
  const onMsg = (event: MessageEvent) => {
    const origin = event.origin;
    if (
      origin !== "https://alkemija.com" &&
      origin !== "https://www.alkemija.com" &&
      origin !== window.location.origin
    ) {
      return;
    }
    const data = event.data as
      | { type?: string; payload?: unknown; photo?: unknown; count?: number }
      | null;
    if (!data || typeof data !== "object") return;
    if (data.type === "pilurica-stara-slika") {
      photoQueue = photoQueue
        .then(() => ingestOldPhoto(data.photo ?? data.payload))
        .then(() => undefined);
      return;
    }
    if (data.type === "pilurica-stara-gotovo") {
      void photoQueue.then(() => onReport(reportOf(state)));
      return;
    }
    if (data.type !== "pilurica-stara-kopija") return;
    void ingestOldExport(data.payload).then(onReport);
  };
  window.addEventListener("message", onMsg);
  return () => window.removeEventListener("message", onMsg);
}

export function openOldPiluricaExport() {
  if (typeof window === "undefined") return;
  window.open(OLD_PILURICA_IZVOZ, "pilurica-stara");
}

export function currentPerson(snap: Snapshot = state): Person {
  return (
    snap.people.find((p) => p.id === snap.settings.currentPersonId) ??
    snap.people[0] ??
    DEFAULT_PERSON
  );
}

export function personMeds(snap: Snapshot = state): Med[] {
  const id = snap.settings.currentPersonId;
  return snap.meds.filter((m) => m.personId === id);
}

export function upsertMed(med: Med) {
  const exists = state.meds.some((m) => m.id === med.id);
  set({
    meds: exists ? state.meds.map((m) => (m.id === med.id ? med : m)) : [...state.meds, med],
  });
}

export function removeMed(id: string) {
  set({
    meds: state.meds.filter((m) => m.id !== id),
    ringing: state.ringing?.medId === id ? null : state.ringing,
  });
}

export function refillMed(id: string) {
  set({
    meds: state.meds.map((m) => {
      if (m.id !== id) return m;
      const add = m.packSize ?? m.stock ?? 0;
      return { ...m, stock: (m.stock ?? 0) + add };
    }),
  });
}

export function upsertPerson(person: Person) {
  const exists = state.people.some((p) => p.id === person.id);
  set({
    people: exists
      ? state.people.map((p) => (p.id === person.id ? person : p))
      : [...state.people, person],
  });
}

export function setCurrentPerson(id: string) {
  if (!state.people.some((p) => p.id === id)) return;
  set({ settings: { ...state.settings, currentPersonId: id } });
}

export function removePerson(id: string) {
  if (state.people.length <= 1) return;
  const nextPeople = state.people.filter((p) => p.id !== id);
  const fallback = nextPeople[0].id;
  set({
    people: nextPeople,
    meds: state.meds.filter((m) => m.personId !== id),
    settings: {
      ...state.settings,
      currentPersonId:
        state.settings.currentPersonId === id ? fallback : state.settings.currentPersonId,
    },
    ringing:
      state.ringing && state.meds.find((m) => m.id === state.ringing?.medId)?.personId === id
        ? null
        : state.ringing,
  });
}

export function markTaken(dose: PlannedDose, now = Date.now()) {
  const med = state.meds.find((m) => m.id === dose.medId);
  const n = dose.tabletsPerDose || med?.tabletsPerDose || 1;
  const log: DoseLog = {
    id: dose.occurrenceId,
    medId: dose.medId,
    name: dose.name,
    dose: dose.dose,
    scheduledAt: dose.at,
    resolvedAt: now,
    result: "taken",
  };
  set({
    logs: [...state.logs.filter((l) => l.id !== log.id), log],
    snoozes: state.snoozes.filter((s) => s.occurrenceId !== dose.occurrenceId),
    ringing: state.ringing?.occurrenceId === dose.occurrenceId ? null : state.ringing,
    meds: med
      ? state.meds.map((m) =>
          m.id === med.id && m.stock != null ? { ...m, stock: Math.max(0, m.stock - n) } : m,
        )
      : state.meds,
  });
}

export function markMissed(dose: PlannedDose, now = Date.now()) {
  if (state.logs.some((l) => l.id === dose.occurrenceId && l.result === "taken")) {
    return;
  }
  const log: DoseLog = {
    id: dose.occurrenceId,
    medId: dose.medId,
    name: dose.name,
    dose: dose.dose,
    scheduledAt: dose.at,
    resolvedAt: now,
    result: "missed",
  };
  set({
    logs: [...state.logs.filter((l) => l.id !== log.id), log],
    ringing: state.ringing?.occurrenceId === dose.occurrenceId ? null : state.ringing,
  });
}

export function snoozeDose(dose: PlannedDose, minutes: number, now = Date.now()) {
  const at = now + minutes * 60_000;
  const next: PlannedDose = {
    ...dose,
    occurrenceId: `${dose.medId}:snooze:${at}`,
    at,
  };
  const log: DoseLog = {
    id: `${dose.occurrenceId}:snooze`,
    medId: dose.medId,
    name: dose.name,
    dose: dose.dose,
    scheduledAt: dose.at,
    resolvedAt: now,
    result: "snoozed",
  };
  set({
    logs: [...state.logs, log],
    snoozes: [...state.snoozes.filter((s) => s.occurrenceId !== dose.occurrenceId), next],
    ringing: null,
  });
  return next;
}

export function setRinging(dose: PlannedDose | null) {
  if (dose && state.ringing?.occurrenceId === dose.occurrenceId) return;
  set({ ringing: dose });
}

export function patchSettings(patch: Partial<Settings>) {
  set({ settings: { ...state.settings, ...patch } });
}

export function exportPayload(): ExportPayload {
  return {
    app: "pilurica",
    version: 2,
    exportedAt: Date.now(),
    people: state.people,
    meds: state.meds,
    logs: state.logs.slice(-400),
    settings: state.settings,
  };
}

export async function exportFullPayload(): Promise<Record<string, unknown>> {
  const snap = await attachPhotos(state);
  const photos = snap.meds
    .filter((m) => isDisplayablePhoto(m.photo))
    .map((m) => {
      const photo = m.photo as string;
      const mime = /^data:(image\/[a-zA-Z0-9.+-]+)/.exec(photo)?.[1] ?? "image/jpeg";
      const base64 = photo.includes(",") ? photo.slice(photo.indexOf(",") + 1) : photo;
      return {
        medicineId: m.id,
        kind: "box",
        slot: 0,
        mimeType: mime,
        base64,
      };
    });
  return {
    app: "pilurica",
    version: 1,
    exportedAt: new Date().toISOString(),
    people: snap.people,
    patients: snap.people,
    meds: snap.meds,
    medicines: snap.meds.map((m) => ({
      id: m.id,
      patientId: m.personId,
      name: m.name,
      tabletsInBox: m.packSize ?? 0,
      remainingTablets: m.stock ?? 0,
      tabletsPerDose: m.tabletsPerDose,
      timesPerDay: Math.max(1, m.times.length),
      clockTimes: m.times,
      notes: m.notes,
      expiresOn: m.expiry ?? "",
      createdAt: m.createdAt,
    })),
    photos,
    logs: snap.logs.slice(-400),
    doseLogs: snap.logs.slice(-400),
    settings: snap.settings,
  };
}

export async function importPayload(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Datoteka nije prepoznata." };
  const incoming = fromParsed(raw as Record<string, unknown>);
  const photos = pickArray(raw as Record<string, unknown>, ["photos", "slike", "images"]);
  if (!incoming.meds.length && incoming.people.length <= 1 && !photos.length) {
    return { ok: false, error: "U kopiji nema lijekova ni osoba." };
  }
  await ingestOldExport(raw);
  return { ok: true };
}

export function saveUpdateCopy() {
  persist();
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(BACKUP_KEY, localStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    /* quota */
  }
}

export async function applyAppUpdate() {
  saveUpdateCopy();
  markRefreshed();
  await refreshRuntime();
  window.location.reload();
}

export function seedExamples() {
  const now = Date.now();
  const personId = state.settings.currentPersonId;
  const meds: Med[] = [
    {
      id: nid(),
      personId,
      name: "Amlodipin",
      dose: "5 mg",
      form: "tablete",
      color: "pine",
      times: ["08:00", "20:00"],
      days: [0, 1, 2, 3, 4, 5, 6],
      notes: "Uz čašu vode, ujutro i navečer.",
      active: true,
      createdAt: now,
      stock: 28,
      tabletsPerDose: 1,
      packSize: 28,
      expiry: null,
      photo: null,
    },
    {
      id: nid(),
      personId,
      name: "Vitamin D",
      dose: "1000 IU",
      form: "kapsule",
      color: "clay",
      times: ["09:00"],
      days: [0, 1, 2, 3, 4, 5, 6],
      notes: "",
      active: true,
      createdAt: now,
      stock: 60,
      tabletsPerDose: 1,
      packSize: 60,
      expiry: null,
      photo: null,
    },
  ];
  set({ meds: [...state.meds, ...meds] });
}

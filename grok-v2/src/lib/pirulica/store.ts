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
  type MedPhoto,
  type MedPhotoKind,
  type Person,
  type Settings,
} from "./types";
import { ensureRefreshStamp, markRefreshed, refreshRuntime } from "./version";
import { UPUTE } from "./upute";

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
      photos: photosOf(m).map((p) => ({ ...p, src: `idb:${m.id}:${p.id}` })),
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
      const nextPhotos: MedPhoto[] = [];
      for (const p of photosOf(m)) {
        if (!isDisplayablePhoto(p.src)) continue;
        let data = p.src;
        if (data.length > 180_000) {
          try {
            data = await shrinkDataUrl(data, 720, 0.72);
          } catch {
            /* keep original */
          }
        }
        nextPhotos.push({ ...p, src: data });
        entries.push([`${m.id}:${p.id}`, data]);
      }
      const next = withPhotos(m, nextPhotos);
      if (next.photo) entries.push([m.id, next.photo]);
      shrunk.push(next);
    }
    if (
      shrunk.some(
        (m, i) =>
          m.photo !== state.meds[i]?.photo ||
          photosOf(m).length !== photosOf(state.meds[i] ?? m).length,
      )
    ) {
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

function photoKindOf(raw: unknown): MedPhotoKind {
  const s = String(raw ?? "").toLowerCase();
  if (/(box|kutija|front|prednj|natrag|pole[dđ]ina|back)/.test(s)) return "box";
  if (/(blister|strip)/.test(s)) return "blister";
  if (/(tablet|tableta|tablete|pill)/.test(s)) return "tablet";
  return "other";
}

function makePhoto(
  src: string,
  kind: MedPhotoKind = "box",
  slot = 0,
  id?: string,
): MedPhoto {
  return { id: id || nid(), kind, slot, src };
}

function photoFingerprint(src: string): string {
  if (src.startsWith("idb:")) return src;
  return src.length > 80 ? `${src.length}:${src.slice(24, 48)}:${src.slice(-24)}` : src;
}

export function photosOf(med: Pick<Med, "photo" | "photos"> | null | undefined): MedPhoto[] {
  if (!med) return [];
  return mergePhotoLists(med.photos, med.photo ? [makePhoto(med.photo, "box", 0, "primary")] : []);
}

function mergePhotoLists(...lists: Array<MedPhoto[] | undefined | null>): MedPhoto[] {
  const out: MedPhoto[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const p of list ?? []) {
      if (!p?.src) continue;
      if (!isDisplayablePhoto(p.src) && !p.src.startsWith("idb:")) continue;
      const fp = photoFingerprint(p.src);
      if (seen.has(fp)) continue;
      seen.add(fp);
      out.push({
        id: p.id || nid(),
        kind: photoKindOf(p.kind),
        slot: Number.isFinite(p.slot) ? Number(p.slot) : out.length,
        src: p.src,
      });
    }
  }
  return out.sort((a, b) => photoRank(b) - photoRank(a) || a.slot - b.slot);
}

function withPhotos(med: Med, extra?: MedPhoto[] | null): Med {
  const photos = mergePhotoLists(extra, med.photos, med.photo ? [makePhoto(med.photo)] : []);
  return { ...med, photos, photo: photos[0]?.src ?? null };
}

function asMedPhoto(raw: unknown): MedPhoto | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const src = normalizePhoto(raw);
    return src ? makePhoto(src) : null;
  }
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const src = normalizePhoto(o);
  if (!src) return null;
  return makePhoto(
    src,
    photoKindOf(o.kind ?? o.type ?? o.vrsta),
    Number(o.slot ?? o.index ?? o.order ?? 0),
    typeof o.id === "string" && o.id ? o.id : undefined,
  );
}

function photosFromRecord(r: Record<string, unknown>): MedPhoto[] {
  const lists = [r.photos, r.slike, r.images, r.gallery, r.photoList];
  const out: MedPhoto[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const p = asMedPhoto(item);
      if (p) out.push(p);
    }
  }
  const single = asPhoto(r);
  if (single) out.push(makePhoto(single, "box", 0, "primary"));
  return mergePhotoLists(out);
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

const PERSON_NAME_KEYS = [
  "name",
  "naziv",
  "ime",
  "title",
  "displayName",
  "label",
  "fullName",
  "personName",
  "patientName",
];

function personNameOf(r: Record<string, unknown>): string {
  return firstString(r, PERSON_NAME_KEYS);
}

function isJaName(name: string): boolean {
  return name.trim().toLowerCase() === "ja";
}

function nestedPerson(r: Record<string, unknown>): Record<string, unknown> | null {
  for (const key of ["patient", "person", "osoba", "owner", "profile"]) {
    const v = r[key];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return null;
}

function looksLikeId(value: string): boolean {
  const v = value.trim();
  if (!v || /\s/.test(v)) return false;
  if (v === DEFAULT_PERSON_ID || v.toLowerCase() === "ja") return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    return true;
  }
  return /^[a-z0-9_-]{8,}$/i.test(v);
}

function asPersonId(r: Record<string, unknown>): string {
  const nested = nestedPerson(r);
  const direct = firstString(r, ["personId", "patientId", "ownerId", "profileId"]);
  if (direct) return direct;
  if (nested) {
    const id = firstString(nested, ["id", "_id"]);
    if (id) return id;
  }
  for (const key of ["person", "osoba", "owner"]) {
    const v = r[key];
    if (typeof v === "string" && looksLikeId(v)) return v.trim();
  }
  return "";
}

function asPersonNameFromMed(r: Record<string, unknown>): string {
  const nested = nestedPerson(r);
  const fromMed = firstString(r, ["personName", "patientName", "ownerName"]);
  if (fromMed) return fromMed;
  if (typeof r.osoba === "string" && r.osoba.trim() && !looksLikeId(r.osoba)) return r.osoba.trim();
  if (typeof r.person === "string" && r.person.trim() && !looksLikeId(r.person)) return r.person.trim();
  return nested ? personNameOf(nested) : "";
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
  const photos = photosFromRecord(r);
  const dose =
    firstString(r, ["dose", "doza", "gramaza", "gramaža", "strength", "jacina", "jačina"]) ||
    strengthFromName(name);
  return withPhotos({
    id: String(r.id ?? r._id ?? nid()),
    personId: asPersonId(r) || DEFAULT_PERSON_ID,
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
    photo: photos[0]?.src ?? null,
    photos,
  });
}

function asPerson(raw: unknown): Person | null {
  if (typeof raw === "string" && raw.trim()) {
    return { id: nid(), name: raw.trim().slice(0, 40), createdAt: Date.now() };
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = personNameOf(r);
  const id = firstString(r, ["id", "_id", "patientId", "personId"]);
  if (!id && !name) return null;
  return {
    id: id || nid(),
    name: name.slice(0, 40),
    createdAt: Number(r.createdAt) || Date.now(),
  };
}

function upsertNamedPerson(list: Person[], id: string, name: string): Person[] {
  const label = name.trim().slice(0, 40);
  const existing = list.find(
    (p) =>
      (id && p.id === id) ||
      (label && p.name.trim().toLowerCase() === label.toLowerCase()),
  );
  if (existing) {
    if (label && (!existing.name.trim() || isJaName(existing.name))) {
      return list.map((p) => (p.id === existing.id ? { ...p, name: label } : p));
    }
    return list;
  }
  if (!id && !label) return list;
  return [...list, { id: id || nid(), name: label, createdAt: Date.now() }];
}

function peopleFromBundle(peopleRaw: unknown[], medsRaw: unknown[]): Person[] {
  let people = peopleRaw.map(asPerson).filter((p): p is Person => Boolean(p));
  for (const raw of medsRaw) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    people = upsertNamedPerson(people, asPersonId(r), asPersonNameFromMed(r));
  }
  return people;
}

function remapOrphans(people: Person[], meds: Med[]): Med[] {
  if (!people.length) return meds;
  const ids = new Set(people.map((p) => p.id));
  const fallback = people[0].id;
  return meds.map((m) => (ids.has(m.personId) ? m : { ...m, personId: fallback }));
}

function dropUndefinedJa(
  people: Person[],
  meds: Med[],
  settings: Settings,
  jaDefined: boolean,
): { people: Person[]; meds: Med[]; settings: Settings } {
  if (jaDefined) {
    const nextPeople = people.length ? people : [{ ...DEFAULT_PERSON }];
    return {
      people: nextPeople,
      meds: remapOrphans(nextPeople, meds),
      settings: {
        ...settings,
        currentPersonId: nextPeople.some((p) => p.id === settings.currentPersonId)
          ? settings.currentPersonId
          : nextPeople[0].id,
      },
    };
  }
  const real = people.filter((p) => p.name.trim() && !isJaName(p.name));
  if (!real.length) {
    const leftover = people.filter((p) => p.name.trim() || p.id !== DEFAULT_PERSON_ID);
    const nextPeople = leftover.length ? leftover : [{ ...DEFAULT_PERSON }];
    return {
      people: nextPeople,
      meds: remapOrphans(nextPeople, meds),
      settings: {
        ...settings,
        currentPersonId: nextPeople.some((p) => p.id === settings.currentPersonId)
          ? settings.currentPersonId
          : nextPeople[0].id,
      },
    };
  }
  const kept = new Set(real.map((p) => p.id));
  const fallback = real[0].id;
  return {
    people: real,
    meds: meds.map((m) => (kept.has(m.personId) ? m : { ...m, personId: fallback })),
    settings: {
      ...settings,
      currentPersonId: real.some((p) => p.id === settings.currentPersonId)
        ? settings.currentPersonId
        : fallback,
    },
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
  const extra = new Map<string, MedPhoto[]>();
  const add = (id: string, photo: MedPhoto) => {
    if (!id) return;
    extra.set(id, mergePhotoLists(extra.get(id), [photo]));
  };
  for (const raw of photos) {
    const photo = asMedPhoto(raw);
    if (!photo || !raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = String(o.medicineId ?? o.medId ?? o.patientMedicineId ?? "");
    add(id, photo);
    add(resolveMedId(id), photo);
  }
  return meds.map((m) =>
    withPhotos(m, mergePhotoLists(extra.get(m.id), extra.get(resolveMedId(m.id)))),
  );
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
  const medsRaw = pickArray(rec, [
    "meds",
    "medications",
    "medicines",
    "lijekovi",
    "drugs",
    "pills",
    "items",
    "therapies",
    "tablete",
  ]);
  const people = peopleFromBundle(peopleRaw, medsRaw);
  const jaDefined = people.some((p) => isJaName(p.name));
  const meds = medsRaw.map(asMed).filter((m): m is Med => Boolean(m));
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
  const cleaned = dropUndefinedJa(people, withPhotos, asSettings(rec.settings ?? rec), jaDefined);
  return {
    people: cleaned.people,
    meds: cleaned.meds,
    logs: Array.isArray(logs) ? logs : [],
    snoozes: Array.isArray(snoozes) ? snoozes : [],
    settings: cleaned.settings,
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
    photos: mergePhotoLists(pick.photos, other.photos),
    tabletsPerDose: Math.max(pick.tabletsPerDose || 1, other.tabletsPerDose || 1),
  };
}

function mergeSnapshots(base: Snapshot, extra: Snapshot): Snapshot {
  const extraDefinesJa = extra.people.some((p) => isJaName(p.name));
  const bareJa =
    base.meds.length === 0 &&
    base.people.length === 1 &&
    isJaName(base.people[0]?.name ?? "");
  const people: Person[] = (bareJa ? [] : base.people).map((p) => ({ ...p }));
  const personIdMap = new Map<string, string>();
  for (const p of extra.people) {
    const existing = people.find(
      (x) => x.id === p.id || (p.name.trim() && x.name.trim().toLowerCase() === p.name.trim().toLowerCase()),
    );
    if (existing) {
      personIdMap.set(p.id, existing.id);
      if (p.name.trim() && (isJaName(existing.name) || !existing.name.trim())) {
        const idx = people.findIndex((x) => x.id === existing.id);
        if (idx >= 0) people[idx] = { ...existing, name: p.name.slice(0, 40) };
      }
    } else if (p.name.trim() || p.id) {
      people.push({ ...p, name: p.name.slice(0, 40) });
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
  const cleaned = dropUndefinedJa(people, meds, settings, extraDefinesJa);
  return {
    people: cleaned.people,
    meds: cleaned.meds,
    logs,
    snoozes: extra.snoozes.length ? extra.snoozes : base.snoozes,
    settings: cleaned.settings,
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
        const restored: MedPhoto[] = [];
        for (const p of photosOf(m)) {
          if (isDisplayablePhoto(p.src)) {
            restored.push(p);
            continue;
          }
          if (p.src.startsWith("idb:")) {
            const url = photos[p.src.slice(4)] || photos[`${m.id}:${p.id}`];
            if (url) restored.push({ ...p, src: url });
          }
        }
        for (const [key, url] of Object.entries(photos)) {
          if (key !== m.id && !key.startsWith(`${m.id}:`)) continue;
          if (!restored.some((p) => p.src === url)) {
            restored.push(
              makePhoto(url, "box", restored.length, key.includes(":") ? key.slice(m.id.length + 1) : "primary"),
            );
          }
        }
        if (!restored.length) {
          const fromIdb =
            photos[m.id] ||
            (m.photo?.startsWith("idb:") ? photos[m.photo.slice(4)] : undefined);
          if (fromIdb) restored.push(makePhoto(fromIdb, "box", 0, "primary"));
        }
        return withPhotos({ ...m, photo: null, photos: [] }, restored);
      }),
    };
  } catch {
    return {
      ...snap,
      meds: snap.meds.map((m) => withPhotos({ ...m, photo: isDisplayablePhoto(m.photo) ? m.photo : null, photos: m.photos ?? [] })),
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
    photos: next.meds.reduce((n, m) => n + photosOf(m).length, 0),
    withStock: next.meds.filter((m) => m.stock != null).length,
    withTimes: next.meds.filter((m) => m.times.length > 0).length,
  };
}

export const OLD_PILURICA_APP = "https://alkemija.com/app/#/postavke";
export const OLD_PILURICA_IZVOZ = "https://alkemija.com/app/izvoz.html";

function reportOf(snap: Snapshot): RecoverReport {
  return {
    meds: snap.meds.length,
    photos: snap.meds.reduce((n, m) => n + photosOf(m).length, 0),
    withStock: snap.meds.filter((m) => m.stock != null).length,
    withTimes: snap.meds.filter((m) => m.times.length > 0).length,
  };
}

async function shrinkIncomingPhotos(meds: Med[]): Promise<Med[]> {
  try {
    const { shrinkDataUrl } = await import("./image");
    const next: Med[] = [];
    for (const m of meds) {
      const shrunk: MedPhoto[] = [];
      for (const p of photosOf(m)) {
        if (!isDisplayablePhoto(p.src)) continue;
        try {
          shrunk.push({ ...p, src: await shrinkDataUrl(p.src, 720, 0.72) });
        } catch {
          shrunk.push(p);
        }
      }
      next.push(withPhotos({ ...m, photo: null, photos: [] }, shrunk));
    }
    return next;
  } catch {
    return meds.map((m) => withPhotos(m));
  }
}

export async function ingestOldExport(raw: unknown): Promise<RecoverReport> {
  if (!raw || typeof raw !== "object") {
    return { meds: 0, photos: 0, withStock: 0, withTimes: 0 };
  }
  const incoming = fromParsed(raw as Record<string, unknown>);
  incoming.meds = await shrinkIncomingPhotos(incoming.meds);
  if (!incoming.meds.length && !incoming.people.some((p) => p.name.trim() && !isJaName(p.name))) {
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
  const parsed = asMedPhoto(raw);
  if (!parsed) return reportOf(state);
  let photo = parsed;
  try {
    const { shrinkDataUrl } = await import("./image");
    photo = { ...parsed, src: await shrinkDataUrl(parsed.src, 720, 0.72) };
  } catch {
    /* keep */
  }
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const incomingId = String(o.medicineId ?? o.medId ?? "");
  const name = firstString(o, ["name", "naziv", "medicineName"]).toLowerCase();
  const target = resolveMedId(incomingId);
  let hit = false;
  const meds = state.meds.map((m) => {
    const sameId = incomingId && (m.id === incomingId || m.id === target);
    const sameName = Boolean(name) && m.name.toLowerCase() === name;
    if (!sameId && !sameName) return m;
    hit = true;
    return withPhotos(m, [photo]);
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

export function medKey(med: Pick<Med, "name" | "dose">): string {
  return `${med.name.trim().toLowerCase()}|${med.dose.trim().toLowerCase()}`;
}

export function catalogMeds(snap: Snapshot = state): Med[] {
  const byKey = new Map<string, Med>();
  for (const m of snap.meds) {
    const key = medKey(m);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, m);
      continue;
    }
    const score = (x: Med) =>
      photosOf(x).length * 8 + (x.packSize != null ? 2 : 0) + (x.times.length ? 1 : 0);
    if (score(m) > score(prev)) byKey.set(key, m);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "hr"));
}

export function assignedPeople(snap: Snapshot, med: Med): Person[] {
  const key = medKey(med);
  const ids = new Set(
    snap.meds.filter((m) => medKey(m) === key).map((m) => m.personId),
  );
  return snap.people.filter((p) => ids.has(p.id));
}

export function assignMedToPerson(medId: string, personId: string) {
  const src = state.meds.find((m) => m.id === medId);
  if (!src || !state.people.some((p) => p.id === personId)) return;
  if (state.meds.some((m) => m.personId === personId && medKey(m) === medKey(src))) return;
  set({
    meds: [
      ...state.meds,
      {
        ...src,
        id: nid(),
        personId,
        createdAt: Date.now(),
      },
    ],
  });
}

export function unassignMedFromPerson(medId: string, personId: string) {
  const med = state.meds.find((m) => m.id === medId && m.personId === personId);
  if (!med) return;
  const key = medKey(med);
  const copies = state.meds.filter((m) => medKey(m) === key);
  if (copies.length <= 1) return;
  removeMed(med.id);
}

export function saveCatalogMed(prev: Med | null, next: Med) {
  if (!prev) {
    upsertMed(next);
    return;
  }
  const oldKey = medKey(prev);
  set({
    meds: state.meds.map((m) => {
      if (m.id === next.id) return next;
      if (medKey(m) !== oldKey) return m;
      return {
        ...m,
        name: next.name,
        dose: next.dose,
        form: next.form,
        color: next.color,
        photo: next.photo ?? m.photo,
        photos: mergePhotoLists(next.photos, m.photos),
        packSize: next.packSize,
        tabletsPerDose: next.tabletsPerDose,
        notes: next.notes,
        expiry: next.expiry,
      };
    }),
  });
}

export function removeCatalogMed(med: Med) {
  const key = medKey(med);
  const gone = new Set(state.meds.filter((m) => medKey(m) === key).map((m) => m.id));
  set({
    meds: state.meds.filter((m) => !gone.has(m.id)),
    ringing: state.ringing && gone.has(state.ringing.medId) ? null : state.ringing,
  });
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
  const photos: Array<Record<string, unknown>> = [];
  for (const m of snap.meds) {
    photosOf(m).forEach((p, i) => {
      const mime = /^data:(image\/[a-zA-Z0-9.+-]+)/.exec(p.src)?.[1] ?? "image/jpeg";
      const base64 = p.src.includes(",") ? p.src.slice(p.src.indexOf(",") + 1) : p.src;
      photos.push({
        id: p.id,
        medicineId: m.id,
        patientId: m.personId,
        kind: p.kind,
        slot: p.slot || i,
        mimeType: mime,
        base64,
      });
    });
  }
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
    upute: {
      title: UPUTE.title,
      lead: UPUTE.lead,
      steps: [...UPUTE.steps],
      install: UPUTE.install,
      alarm: UPUTE.alarm,
      disclaimer: UPUTE.disclaimer,
    },
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
      photos: [],
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
      photos: [],
    },
  ];
  set({ meds: [...state.meds, ...meds] });
}

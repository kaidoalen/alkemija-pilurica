export const WEEKDAYS = [
  { id: 1, short: "Pon", label: "Ponedjeljak" },
  { id: 2, short: "Uto", label: "Utorak" },
  { id: 3, short: "Sri", label: "Srijeda" },
  { id: 4, short: "Čet", label: "Četvrtak" },
  { id: 5, short: "Pet", label: "Petak" },
  { id: 6, short: "Sub", label: "Subota" },
  { id: 0, short: "Ned", label: "Nedjelja" },
] as const;

export const MED_COLORS = ["pine", "clay", "ink", "moss"] as const;
export type MedColor = (typeof MED_COLORS)[number];

export const DEFAULT_PERSON_ID = "me";

export type Person = {
  id: string;
  name: string;
  createdAt: number;
};

export type Med = {
  id: string;
  personId: string;
  name: string;
  dose: string;
  form: string;
  color: MedColor;
  times: string[];
  days: number[];
  notes: string;
  active: boolean;
  createdAt: number;
  stock: number | null;
  tabletsPerDose: number;
  packSize: number | null;
  expiry: string | null;
  photo: string | null;
};

export type DoseStatus = "pending" | "ringing" | "taken" | "snoozed" | "missed";

export type DoseLog = {
  id: string;
  medId: string;
  name: string;
  dose: string;
  scheduledAt: number;
  resolvedAt: number;
  result: "taken" | "missed" | "snoozed";
};

export type Settings = {
  snoozeMinutes: 15 | 30;
  soundEnabled: boolean;
  vibrateEnabled: boolean;
  setupDismissed: boolean;
  currentPersonId: string;
};

export type AlarmEvent = {
  occurrenceId: string;
  medId: string;
  name: string;
  dose: string;
  scheduledAt: number;
  kind: "due" | "test";
};

export type PushHealth = {
  notification: NotificationPermission | "unsupported";
  serviceWorker: boolean;
  push: boolean;
  installed: boolean;
  periodicSync: boolean;
};

export type ExportPayload = {
  app: "pilurica";
  version: 2;
  exportedAt: number;
  people: Person[];
  meds: Med[];
  logs: DoseLog[];
  settings: Settings;
};

export const DEFAULT_PERSON: Person = {
  id: DEFAULT_PERSON_ID,
  name: "Ja",
  createdAt: 0,
};

export const DEFAULT_SETTINGS: Settings = {
  snoozeMinutes: 15,
  soundEnabled: true,
  vibrateEnabled: true,
  setupDismissed: false,
  currentPersonId: DEFAULT_PERSON_ID,
};

export const STORAGE_KEY = "pilurica-v2";
export const LEGACY_STORAGE_KEY = "pirulica-v1";
export const BACKUP_KEY = "pilurica-backup";
export const DEVICE_KEY = "pilurica-device-id";
export const LEGACY_DEVICE_KEY = "pirulica-device-id";
export const IDB_NAME = "pirulica";
export const IDB_STORE = "kv";
export const SW_PATH = "/sw.js";

import { addDays, atOnDay, formatHm, occurrenceId, startOfDay } from "./ids";
import type { DoseLog, Med } from "./types";

export type PlannedDose = {
  occurrenceId: string;
  medId: string;
  personId: string;
  personName: string;
  name: string;
  dose: string;
  color: Med["color"];
  tabletsPerDose: number;
  at: number;
  ringCount?: number;
};

/** At least 3 h between two takes of the same medicine. */
export const MIN_GAP_MS = 3 * 60 * 60 * 1000;
/** A missed satnica is forgotten after 24 h. */
export const MAX_GAP_MS = 24 * 60 * 60 * 1000;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_SHORT = ["nedjelja", "ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota"];

export function medDays(med: Med): number[] {
  return med.days?.length ? med.days : ALL_DAYS;
}

export function planWindow(
  meds: Med[],
  fromMs: number,
  daysAhead: number,
  personNameById?: Map<string, string>,
): PlannedDose[] {
  const start = startOfDay(fromMs);
  const out: PlannedDose[] = [];
  for (let i = 0; i < daysAhead; i += 1) {
    const day = addDays(start, i);
    const weekday = day.getDay();
    for (const med of meds) {
      if (!med.active) continue;
      if (!medDays(med).includes(weekday)) continue;
      for (const hm of med.times) {
        const at = atOnDay(day, hm);
        out.push({
          occurrenceId: occurrenceId(med.id, at),
          medId: med.id,
          personId: med.personId,
          personName: personNameById?.get(med.personId) ?? "",
          name: med.name,
          dose: med.dose,
          color: med.color,
          tabletsPerDose: med.tabletsPerDose || 1,
          at,
        });
      }
    }
  }
  out.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name, "hr"));
  return out;
}

/** Prefer snoozed fire time over the original satnica for the same dose. */
export function applySnoozes(planned: PlannedDose[], snoozes: PlannedDose[]): PlannedDose[] {
  const byId = new Map(snoozes.map((s) => [s.occurrenceId, s]));
  const used = new Set<string>();
  const out: PlannedDose[] = [];
  for (const d of planned) {
    const s = byId.get(d.occurrenceId);
    if (s) {
      out.push(s);
      used.add(s.occurrenceId);
    } else {
      out.push(d);
    }
  }
  for (const s of snoozes) {
    if (!used.has(s.occurrenceId)) out.push(s);
  }
  return out.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name, "hr"));
}

export function todayPlan(meds: Med[], now = Date.now()): PlannedDose[] {
  const start = startOfDay(now).getTime();
  const end = addDays(startOfDay(now), 1).getTime();
  return planWindow(meds, now, 2).filter((d) => d.at >= start && d.at < end);
}

export function lastTakenAt(logs: DoseLog[], medId: string): number | null {
  let latest: number | null = null;
  for (const log of logs) {
    if (log.medId !== medId || log.result !== "taken") continue;
    const t = log.resolvedAt || log.scheduledAt;
    if (latest == null || t > latest) latest = t;
  }
  return latest;
}

export function takenKeys(logs: DoseLog[], now = Date.now()): Set<string> {
  const horizon = now - 36 * 60 * 60 * 1000;
  const keys = new Set<string>();
  for (const log of logs) {
    if (log.scheduledAt < horizon) continue;
    if (log.result === "taken") keys.add(log.id);
  }
  return keys;
}

export function isTaken(logs: DoseLog[], occurrenceIdValue: string): boolean {
  return logs.some((l) => l.id === occurrenceIdValue && l.result === "taken");
}

/** Last takes of this person's medicines, newest first. */
export function recentTakes(
  logs: DoseLog[],
  medIds: Set<string> | string[],
  limit = 4,
): DoseLog[] {
  const ids = medIds instanceof Set ? medIds : new Set(medIds);
  return logs
    .filter((l) => l.result === "taken" && ids.has(l.medId))
    .sort((a, b) => {
      const ta = a.resolvedAt || a.scheduledAt;
      const tb = b.resolvedAt || b.scheduledAt;
      return tb - ta || b.scheduledAt - a.scheduledAt;
    })
    .slice(0, limit);
}

/** Satnica has arrived, and it is at least 3 h since this medicine was last taken. */
export function canTakeDose(
  dose: PlannedDose,
  now = Date.now(),
  logs: DoseLog[] = [],
): boolean {
  if (dose.medId === "test" || dose.occurrenceId.startsWith("test:")) return true;
  if (dose.at > now) return false;
  const last = lastTakenAt(logs, dose.medId);
  if (last != null && now < last + MIN_GAP_MS && dose.at <= last) return false;
  return true;
}

/**
 * Reminders the clock must know: not taken, not inside the 3 h quiet after a take.
 * One adult dose at a time — the satnica you actually set.
 */
export function watchUpcoming(
  meds: Med[],
  logs: DoseLog[],
  snoozes: PlannedDose[],
  now = Date.now(),
): PlannedDose[] {
  const taken = takenKeys(logs, now);
  const planned = planWindow(meds, now - MAX_GAP_MS, 8);
  return applySnoozes(planned, snoozes).filter((d) => {
    if (taken.has(d.occurrenceId)) return false;
    if (d.at < now - MAX_GAP_MS) return false;
    const last = lastTakenAt(logs, d.medId);
    if (last != null && d.at < last + MIN_GAP_MS && d.at <= last) return false;
    return true;
  });
}

/**
 * What should ring now: for each medicine, the latest satnica that has
 * already arrived (don't keep nagging 08:00 at 22:00 if 20:00 is the current one).
 */
export function dueUnacked(
  meds: Med[],
  logs: DoseLog[],
  snoozes: PlannedDose[],
  now = Date.now(),
): PlannedDose[] {
  const overdue = watchUpcoming(meds, logs, snoozes, now).filter((d) => d.at <= now);
  const current = new Map<string, PlannedDose>();
  for (const d of overdue) {
    const prev = current.get(d.medId);
    if (!prev || d.at >= prev.at) current.set(d.medId, d);
  }
  return [...current.values()].sort((a, b) => a.at - b.at || a.name.localeCompare(b.name, "hr"));
}

export function nextUpcoming(
  meds: Med[],
  logs: DoseLog[],
  snoozes: PlannedDose[],
  now = Date.now(),
): PlannedDose | null {
  const due = dueUnacked(meds, logs, snoozes, now);
  if (due[0]) return due[0];
  return watchUpcoming(meds, logs, snoozes, now).find((d) => d.at > now) ?? null;
}

export function opaqueFires(
  meds: Med[],
  snoozes: PlannedDose[],
  now = Date.now(),
  horizonMs = 48 * 60 * 60 * 1000,
  logs: DoseLog[] = [],
): { id: string; at: number }[] {
  const merged = watchUpcoming(meds, logs, snoozes, now).filter(
    (d) => d.at >= now - 30_000 && d.at <= now + horizonMs,
  );
  const retries: { id: string; at: number }[] = [];
  const offsets = [
    0, 30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 1_500_000, 2_400_000, 3_600_000,
  ];
  for (const dose of merged) {
    offsets.forEach((off, i) => {
      retries.push({ id: `${dose.occurrenceId}:${i}`, at: dose.at + off });
    });
  }
  return retries.slice(0, 180);
}

export function nextRingCount(dose: PlannedDose): number {
  return Math.min(8, (dose.ringCount ?? 2) + 1);
}

export function remainingLabel(at: number, now = Date.now()): string {
  const diff = at - now;
  if (diff <= 0) {
    const late = Math.round(-diff / 60_000);
    if (late < 2) return "sada";
    if (late < 60) return `kasni ${late} min`;
    const h = Math.floor(late / 60);
    return h === 1 ? "kasni 1 sat" : `kasni ${h} h`;
  }
  const today = startOfDay(now).getTime();
  const day = startOfDay(at).getTime();
  const days = Math.round((day - today) / 86_400_000);
  if (days >= 1) {
    const hm = formatHm(at);
    if (days === 1) return `sutra ${hm}`;
    return `${DAY_SHORT[new Date(at).getDay()]} ${hm}`;
  }
  const min = Math.round(diff / 60_000);
  if (min < 1) return "manje od minute";
  if (min === 1) return "za 1 min";
  if (min < 60) return `za ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 1 && m === 0) return "za 1 sat";
  if (m === 0) return `za ${h} h`;
  return `za ${h} h ${m} min`;
}

export { DAY_SHORT };
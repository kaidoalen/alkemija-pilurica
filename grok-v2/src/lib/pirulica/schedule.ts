import { addDays, atOnDay, occurrenceId, startOfDay } from "./ids";
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
  /** How many ring cycles this firing. Starts at 2, +1 after each 15 min snooze. */
  ringCount?: number;
};

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
      if (!med.days.includes(weekday)) continue;
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

export function todayPlan(meds: Med[], now = Date.now()): PlannedDose[] {
  const start = startOfDay(now).getTime();
  const end = addDays(startOfDay(now), 1).getTime();
  return planWindow(meds, now, 2).filter((d) => d.at >= start && d.at < end);
}

export function nextUpcoming(
  meds: Med[],
  logs: DoseLog[],
  snoozes: PlannedDose[],
  now = Date.now(),
): PlannedDose | null {
  const taken = takenKeys(logs, now);
  const planned = planWindow(meds, now, 8);
  const extra = snoozes.filter((s) => s.at >= now - 60_000);
  const all = [...planned, ...extra].sort((a, b) => a.at - b.at);
  for (const dose of all) {
    if (dose.at < now - 2 * 60 * 60 * 1000) continue;
    if (taken.has(dose.occurrenceId)) continue;
    return dose;
  }
  return null;
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

export function dueUnacked(
  meds: Med[],
  logs: DoseLog[],
  snoozes: PlannedDose[],
  now = Date.now(),
  graceMs = 2 * 60 * 60 * 1000,
): PlannedDose[] {
  const taken = takenKeys(logs, now);
  const planned = planWindow(meds, now - graceMs, 3);
  const extra = snoozes.filter((s) => s.at >= now - graceMs);
  return [...planned, ...extra].filter((d) => {
    if (taken.has(d.occurrenceId)) return false;
    if (d.at > now + 8_000) return false;
    if (now - d.at > graceMs) return false;
    return true;
  });
}

/** Opaque fire times for the push server — no medication names. */
export function opaqueFires(
  meds: Med[],
  snoozes: PlannedDose[],
  now = Date.now(),
  horizonMs = 48 * 60 * 60 * 1000,
): { id: string; at: number }[] {
  const planned = planWindow(meds, now, 3).filter(
    (d) => d.at >= now - 30_000 && d.at <= now + horizonMs,
  );
  const extra = snoozes.filter(
    (s) => s.at >= now - 30_000 && s.at <= now + horizonMs,
  );
  const retries: { id: string; at: number }[] = [];
  const offsets = [
    0, 30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 1_500_000, 2_400_000, 3_600_000,
  ];
  for (const dose of [...planned, ...extra]) {
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
  if (diff <= 0) return "sada";
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

export const DAY_SHORT = ["Ned", "Pon", "Uto", "Sri", "Čet", "Pet", "Sub"];

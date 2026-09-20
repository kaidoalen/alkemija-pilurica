export function nid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function occurrenceId(medId: string, at: number): string {
  return `${medId}:${at}`;
}

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatHm(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseHm(hm: string): { hours: number; minutes: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function sortTimes(times: string[]): string[] {
  return [...new Set(times.filter(Boolean))].sort((a, b) => {
    const pa = parseHm(a);
    const pb = parseHm(b);
    if (!pa && !pb) return a.localeCompare(b);
    if (!pa) return 1;
    if (!pb) return -1;
    return pa.hours * 60 + pa.minutes - (pb.hours * 60 + pb.minutes);
  });
}

export function spacedTimes(count: number, startHm = "08:00"): string[] {
  const n = Math.max(1, Math.min(8, Math.round(count) || 1));
  const start = parseHm(startHm) ?? { hours: 8, minutes: 0 };
  const origin = start.hours * 60 + start.minutes;
  const step = Math.round((24 * 60) / n);
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const m = (origin + i * step) % (24 * 60);
    out.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
  }
  return sortTimes(out);
}

export function shiftHour(hm: string, deltaHours: number): string {
  const p = parseHm(hm) ?? { hours: 8, minutes: 0 };
  const h = (p.hours + deltaHours + 24) % 24;
  return `${pad2(h)}:${pad2(p.minutes)}`;
}

export function atOnDay(day: Date, hm: string): number {
  const parsed = parseHm(hm);
  if (!parsed) return day.getTime();
  const d = new Date(day);
  d.setHours(parsed.hours, parsed.minutes, 0, 0);
  return d.getTime();
}

export function startOfDay(ms = Date.now()): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(day: Date, n: number): Date {
  const d = new Date(day);
  d.setDate(d.getDate() + n);
  return d;
}

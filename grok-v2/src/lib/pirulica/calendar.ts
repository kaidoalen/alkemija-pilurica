import { planWindow, type PlannedDose } from "./schedule";
import type { Med } from "./types";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function stampLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function stampUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function fold(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length) {
    chunks.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return chunks.join("\r\n");
}

function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcs(meds: Med[], now = Date.now()): string {
  const doses = planWindow(meds, now, 30).filter((d) => d.at >= now - 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pilurica//HR//",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Pilurica",
  ];
  for (const dose of doses.slice(0, 180)) {
    const end = dose.at + 10 * 60_000;
    const summary = dose.dose ? `${dose.name} · ${dose.dose}` : dose.name;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${esc(dose.occurrenceId)}@pilurica`,
      `DTSTAMP:${stampUtc(now)}`,
      `DTSTART:${stampLocal(dose.at)}`,
      `DTEND:${stampLocal(end)}`,
      fold(`SUMMARY:${esc(summary)}`),
      fold(`DESCRIPTION:${esc("Pilurica podsjetnik — uzmi dozu.")}`),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Vrijeme je za lijek",
      "TRIGGER:PT0S",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function downloadIcs(ics: string, filename = "pilurica.ics") {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

export async function shareOrDownloadIcs(ics: string): Promise<"shared" | "downloaded"> {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const file = new File([blob], "pilurica.ics", { type: "text/calendar" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  try {
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({
        files: [file],
        title: "Pilurica",
        text: "Satnice za kalendar mobitela ili Google Kalendar.",
      });
      return "shared";
    }
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") return "shared";
  }
  downloadIcs(ics);
  return "downloaded";
}

export function googleEventUrl(dose: PlannedDose): string {
  const start = stampLocal(dose.at);
  const end = stampLocal(dose.at + 10 * 60_000);
  const text = dose.dose ? `${dose.name} · ${dose.dose}` : dose.name;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Pilurica — ${text}`,
    dates: `${start}/${end}`,
    details: "Pilurica podsjetnik",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

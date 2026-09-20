import type { Med } from "./types";

export function dailyTablets(med: Med): number {
  if (!med.times.length || !med.days.length) return 0;
  return (med.tabletsPerDose * med.times.length * med.days.length) / 7;
}

export function daysOfStock(med: Med): number | null {
  if (med.stock == null) return null;
  const perDay = dailyTablets(med);
  if (perDay <= 0) return med.stock > 0 ? 99 : 0;
  return med.stock / perDay;
}

export function stockWarning(med: Med): "none" | "low" | "out" {
  if (med.stock == null) return "none";
  if (med.stock <= 0) return "out";
  const days = daysOfStock(med);
  if (days != null && days <= 3) return "low";
  return "none";
}

export function daysLeftLabel(med: Med): string | null {
  const days = daysOfStock(med);
  if (days == null) return null;
  if (days <= 0) return "nema zalihe";
  const n = Math.max(1, Math.ceil(days));
  return n === 1 ? "još 1 dan" : `još ${n} dana`;
}

export function expiryWarning(
  med: Med,
  now = Date.now(),
): "none" | "soon" | "expired" {
  if (!med.expiry) return "none";
  const end = new Date(`${med.expiry}T23:59:59`).getTime();
  if (Number.isNaN(end)) return "none";
  if (end < now) return "expired";
  if (end - now < 14 * 86_400_000) return "soon";
  return "none";
}

export function formatStock(med: Med): string | null {
  if (med.stock == null) return null;
  const warn = stockWarning(med);
  if (warn === "out") return `${med.stock} kom · nema zalihe`;
  if (warn === "low") return `${med.stock} kom · ${daysLeftLabel(med)}`;
  return `${med.stock} kom`;
}

export function formatExpiry(med: Med): string | null {
  if (!med.expiry) return null;
  const warn = expiryWarning(med);
  const [y, m, d] = med.expiry.split("-");
  const label = d && m && y ? `${d}.${m}.${y}.` : med.expiry;
  if (warn === "expired") return `rok istekao ${label}`;
  if (warn === "soon") return `rok ${label}`;
  return `rok ${label}`;
}

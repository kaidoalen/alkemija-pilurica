import { useState } from "react";
import { formatHm } from "@/lib/pirulica/ids";
import { isTaken, recentTakes } from "@/lib/pirulica/schedule";
import type { DoseLog, Med } from "@/lib/pirulica/types";
import { colorDot } from "./capsule";

function when(ms: number) {
  const d = new Date(ms);
  return `${d.getDate()}.${d.getMonth() + 1}. ${formatHm(ms)}`;
}

export function LastTakes({
  logs,
  meds,
  personName,
  onToggleLast,
  title = "Zadnja 4 uzimanja",
  limit = 4,
}: {
  logs: DoseLog[];
  meds: Med[];
  personName: string;
  onToggleLast: (log: DoseLog) => void;
  title?: string;
  limit?: number;
}) {
  const ids = meds.map((m) => m.id);
  const taken = recentTakes(logs, ids, limit);
  const [held, setHeld] = useState<DoseLog | null>(null);
  const heldLive =
    held && !isTaken(logs, held.id) && taken[0]?.id !== held.id ? held : null;
  const rows = heldLive ? [heldLive, ...taken].slice(0, limit) : taken;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {personName ? <p className="text-xs text-muted">{personName}</p> : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-[20px] bg-surface px-4 py-4 text-sm text-muted shadow-[var(--shadow-card)]">
          Još nema uzimanja za ovu osobu.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((log, i) => {
            const med = meds.find((m) => m.id === log.medId);
            const on = isTaken(logs, log.id);
            const isLast = i === 0;
            return (
              <li
                key={log.id}
                className="flex items-center gap-3 rounded-[20px] bg-surface px-3 py-3 shadow-[var(--shadow-card)]"
              >
                <span
                  className={`size-2.5 shrink-0 rounded-full ${colorDot[med?.color ?? "pine"]}`}
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${on ? "text-ink" : "text-muted"}`}>
                    {log.name}
                  </p>
                  <p className="text-xs tabular-nums text-muted">
                    {when(log.resolvedAt || log.scheduledAt)}
                    {log.dose ? ` · ${log.dose}` : ""}
                  </p>
                </div>
                {isLast ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (on) setHeld(log);
                      else setHeld(null);
                      onToggleLast(log);
                    }}
                    className={`h-11 min-w-16 rounded-full px-4 text-sm font-medium ${
                      on
                        ? "bg-pine text-pine-fg"
                        : "bg-cream text-ink shadow-[var(--shadow-card)]"
                    }`}
                  >
                    {on ? "Uzeto" : "Nije"}
                  </button>
                ) : (
                  <span className="grid h-11 min-w-16 place-items-center rounded-full bg-pine/10 px-3 text-xs font-medium text-pine">
                    Uzeto
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

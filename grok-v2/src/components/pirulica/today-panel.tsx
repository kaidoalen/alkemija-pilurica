import { BellRing, Plus, Smartphone } from "lucide-react";
import { formatHm } from "@/lib/pirulica/ids";
import {
  isTaken,
  nextUpcoming,
  remainingLabel,
  todayPlan,
} from "@/lib/pirulica/schedule";
import { daysLeftLabel, expiryWarning, stockWarning } from "@/lib/pirulica/stock";
import type { Snapshot } from "@/lib/pirulica/store";
import { UPUTE } from "@/lib/pirulica/upute";
import type { Med } from "@/lib/pirulica/types";
import { Button } from "@/components/ui/button";
import { HowTo } from "./how-to";
import { CapsuleMark, colorDot } from "./capsule";

export function TodayPanel({
  snap,
  meds,
  personName,
  personId,
  now,
  onTaken,
  onAdd,
  onSimulate,
  onRecover,
  onOpenPerson,
}: {
  snap: Snapshot;
  meds: Med[];
  personName: string;
  personId: string;
  now: number;
  onTaken: (id: string) => void;
  onAdd: () => void;
  onSimulate: () => void;
  onRecover: () => void;
  onOpenPerson: (id: string) => void;
}) {
  const plan = todayPlan(meds, now);
  const next = nextUpcoming(meds, snap.logs, snap.snoozes, now);
  const remaining = plan.filter((d) => !isTaken(snap.logs, d.occurrenceId));
  const alerts = meds.filter(
    (m) => stockWarning(m) !== "none" || expiryWarning(m, now) !== "none",
  );

  return (
    <div className="space-y-5">
      {next ? (
        <section className="rounded-[28px] bg-pine px-5 py-5 text-pine-fg shadow-[var(--shadow-card)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine-fg/70">
            Sljedeća doza
            {personName ? (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => onOpenPerson(personId)}
                  className="underline-offset-2 hover:underline"
                >
                  {personName}
                </button>
              </>
            ) : null}
          </p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl font-medium leading-none tracking-[-0.03em]">
                {next.name}
              </h2>
              <p className="mt-2 text-sm text-pine-fg/75">{formatHm(next.at)}</p>
            </div>
            <p className="font-display text-xl tabular-nums tracking-tight">
              {remainingLabel(next.at, now)}
            </p>
          </div>
          {next.at <= now + 15 * 60 * 1000 ? (
            <Button
              variant="outline"
              className="mt-5 w-full bg-pine-fg text-pine"
              onClick={() => onTaken(next.occurrenceId)}
            >
              Uzmi
            </Button>
          ) : null}
        </section>
      ) : meds.length === 0 ? (
        <section className="rounded-[28px] bg-surface px-5 py-8 text-center shadow-[var(--shadow-card)]">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-cream">
            <CapsuleMark size={28} />
          </div>
          <h2 className="mt-4 font-display text-2xl tracking-[-0.03em]">Pilurica</h2>
          <p className="mx-auto mt-2 max-w-[32ch] text-sm text-muted text-pretty">
            {UPUTE.lead}
          </p>
          <Button className="mt-5 h-14 w-full text-base" onClick={onAdd}>
            <Plus className="size-4" />
            Dodaj lijek
          </Button>
        </section>
      ) : (
        <section className="rounded-[28px] bg-surface px-5 py-6 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-2xl tracking-[-0.03em]">Sve uzeto</h2>
          <p className="mt-1 text-sm text-muted">Nema više doza za danas.</p>
        </section>
      )}

      {meds.length === 0 ? <HowTo compact /> : null}

      {alerts.length > 0 ? (
        <section className="rounded-[20px] bg-clay/10 px-4 py-3 text-sm text-clay">
          {alerts.map((m) => {
            const stock = stockWarning(m);
            const exp = expiryWarning(m, now);
            const bits: string[] = [];
            if (stock === "out") bits.push("nema zalihe");
            else if (stock === "low") bits.push(daysLeftLabel(m) ?? "zaliha nestaje");
            if (exp === "expired") bits.push("rok istekao");
            else if (exp === "soon") bits.push("rok ističe");
            return (
              <p key={m.id} className="text-pretty">
                {m.name}: {bits.join(" · ")}
              </p>
            );
          })}
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-ink">Raspored</h3>
          <p className="text-xs text-muted tabular-nums">
            {plan.length - remaining.length}/{plan.length || 0}
          </p>
        </div>
        {plan.length === 0 ? (
          <p className="text-sm text-muted">Nema rasporeda za ovaj dan.</p>
        ) : (
          <ul className="space-y-2">
            {plan.map((dose) => {
              const taken = isTaken(snap.logs, dose.occurrenceId);
              const overdue = !taken && dose.at < now - 60_000;
              return (
                <li
                  key={dose.occurrenceId}
                  className="flex items-center gap-3 rounded-[20px] bg-surface px-3 py-3 shadow-[var(--shadow-card)]"
                >
                  <span className={`size-2.5 shrink-0 rounded-full ${colorDot[dose.color]}`} />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-medium ${taken ? "text-muted line-through" : "text-ink"}`}
                    >
                      {dose.name}
                    </p>
                    {overdue ? (
                      <p className="text-xs text-muted">kasni</p>
                    ) : null}
                  </div>
                  <p className="text-sm tabular-nums text-muted">{formatHm(dose.at)}</p>
                  {taken ? (
                    <span className="grid h-11 min-w-11 place-items-center rounded-full bg-pine/10 px-3 text-xs font-medium text-pine">
                      Uzeto
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onTaken(dose.occurrenceId)}
                      className="h-11 rounded-full bg-pine px-4 text-sm font-medium text-pine-fg"
                    >
                      Uzmi
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {meds.length === 0 ? (
        <section className="rounded-[24px] bg-surface px-5 py-4 shadow-[var(--shadow-card)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
            JSON kopija
          </p>
          <p className="mt-1 text-sm text-muted text-pretty">
            Ako već imate kopiju sa starog telefona — uvezi slike, količinu i satnice.
          </p>
          <Button variant="outline" className="mt-3 w-full" onClick={onRecover}>
            <Smartphone className="size-4" />
            Uvezi JSON kopiju
          </Button>
        </section>
      ) : null}

      <section className="rounded-[24px] bg-clay px-5 py-4 text-clay-fg shadow-[var(--shadow-card)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-clay-fg/70">
          Proba zvuka
        </p>
        <p className="mt-1 text-sm text-clay-fg/85 text-pretty">
          Morate čuti piskanje. Ako ne — isključite tihi način.
        </p>
        <Button
          variant="outline"
          className="mt-3 w-full bg-clay-fg text-clay"
          onClick={onSimulate}
        >
          <BellRing className="size-4" />
          Simuliraj alarm
        </Button>
      </section>
    </div>
  );
}

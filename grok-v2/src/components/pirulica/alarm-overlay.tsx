import { Clock } from "lucide-react";
import { formatHm } from "@/lib/pirulica/ids";
import { remainingLabel, type PlannedDose } from "@/lib/pirulica/schedule";
import { Button } from "@/components/ui/button";

export function AlarmOverlay({
  dose,
  now,
  onTaken,
  onSnooze,
  onMissed,
}: {
  dose: PlannedDose;
  now: number;
  onTaken: () => void;
  onSnooze: (minutes: 15 | 30) => void;
  onMissed: () => void;
}) {
  const late = now - dose.at > 30_000;

  return (
    <section className="rounded-[28px] bg-clay px-5 py-5 text-clay-fg shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-clay-fg/70">
        {dose.occurrenceId.startsWith("test:")
          ? "Proba — nije pravi lijek"
          : late
            ? "Kasni — uzmite sada"
            : "Vrijeme je"}
      </p>
      {dose.personName ? <p className="mt-2 text-sm text-clay-fg/85">{dose.personName}</p> : null}
      <h2 className="mt-2 font-display text-3xl font-medium leading-none tracking-[-0.03em]">
        {dose.name}
      </h2>
      <p className="mt-2 flex items-center gap-2 text-sm text-clay-fg/80">
        <Clock className="size-4" />
        {formatHm(dose.at)}
        {late ? ` · ${remainingLabel(dose.at, now)}` : null}
      </p>
      <Button
        size="lg"
        className="mt-5 h-14 w-full bg-clay-fg text-clay text-base"
        onClick={onTaken}
      >
        Uzmi
      </Button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="lg"
          className="bg-clay text-clay-fg"
          onClick={() => onSnooze(15)}
        >
          15 min
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="bg-clay text-clay-fg"
          onClick={() => onSnooze(30)}
        >
          30 min
        </Button>
      </div>
      <button type="button" className="mt-3 w-full py-2 text-sm text-clay-fg/70" onClick={onMissed}>
        Ugasi
      </button>
    </section>
  );
}

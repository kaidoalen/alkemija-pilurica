import { BellRing, Clock } from "lucide-react";
import { formatHm } from "@/lib/pirulica/ids";
import { startAlarmSound } from "@/lib/pirulica/audio";
import { remainingLabel, type PlannedDose } from "@/lib/pirulica/schedule";
import { Button } from "@/components/ui/button";
import { CapsuleMark } from "./capsule";

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
  const rings = dose.ringCount ?? 2;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-surface">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(154,74,50,0.28),transparent_55%)]" />
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        <button
          type="button"
          onClick={() => void startAlarmSound(rings)}
          className="alarm-pulse mb-8 grid size-24 place-items-center rounded-[28px] bg-clay/20"
          aria-label="Ponovi zvuk"
        >
          <BellRing className="size-10 text-clay-fg" strokeWidth={1.6} />
        </button>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-faint">
          {dose.occurrenceId.startsWith("test:")
            ? "Proba — nije pravi lijek"
            : late
              ? "Kasni alarm"
              : "Vrijeme je"}
        </p>
        {dose.personName ? (
          <p className="mt-2 text-sm text-cream">{dose.personName}</p>
        ) : null}
        <h1 className="mt-3 max-w-[16ch] font-display text-4xl font-medium leading-[1.1] tracking-[-0.03em] text-balance">
          {dose.name}
        </h1>
        {dose.dose ? <p className="mt-3 text-lg text-cream">{dose.dose}</p> : null}
        <p className="mt-6 flex items-center gap-2 text-sm text-faint">
          <Clock className="size-4" />
          {formatHm(dose.at)}
          {late ? ` · ${remainingLabel(dose.at, now).replace("za ", "kasni ")}` : null}
        </p>
      </div>
      <div className="relative space-y-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Button size="lg" className="h-14 w-full text-base" onClick={onTaken}>
          Uzmi
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            size="lg"
            className="bg-ink text-surface"
            onClick={() => onSnooze(15)}
          >
            15 min
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="bg-ink text-surface"
            onClick={() => onSnooze(30)}
          >
            30 min
          </Button>
        </div>
        <Button variant="ghost" size="lg" className="w-full text-faint" onClick={onMissed}>
          Ugasi
        </Button>
        <p className="flex items-center justify-center gap-2 pt-1 text-xs text-faint">
          <CapsuleMark size={14} />
          {rings} zvona u pozadini. Ovdje je dovoljno Uzmi ili odgoda. Zvono samo ako želite opet čuti.
        </p>
      </div>
    </div>
  );
}

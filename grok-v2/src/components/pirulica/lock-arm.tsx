import { useState } from "react";
import { Bell } from "lucide-react";
import { ensureLockAlarms } from "@/lib/pirulica/push-client";
import { UPUTE } from "@/lib/pirulica/upute";
import { Button } from "@/components/ui/button";
import { CapsuleMark } from "./capsule";

export function needsLockArm() {
  if (typeof window === "undefined" || typeof Notification === "undefined") return false;
  return Notification.permission !== "granted";
}

export function LockArm({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function arm() {
    setBusy(true);
    setErr("");
    try {
      const ok = await ensureLockAlarms();
      if (!ok && Notification.permission !== "granted") {
        setErr("Bez dozvole obavijesti ne zvonimo na zaključanom telefonu. Stisnite Dozvoli.");
        setBusy(false);
        return;
      }
      onDone();
    } catch {
      setErr("Nije uspjelo. Provjerite mrežu i stisnite opet.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <CapsuleMark size={22} />
          <p className="font-display text-xl tracking-[-0.03em]">Pilurica</p>
        </div>
        <div className="mt-10 flex flex-1 flex-col">
          <div className="grid size-16 place-items-center rounded-[22px] bg-clay/15 text-clay">
            <Bell className="size-7" />
          </div>
          <h1 className="mt-6 font-display text-3xl tracking-[-0.03em] text-pretty">
            Da zvoni i kad je telefon zaključan
          </h1>
          <p className="mt-3 text-sm text-muted text-pretty">
            Jedan gumb uključuje zvuk, vibraciju i obavijesti. Inače Android uspava alarm.
          </p>
          <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-ink">
            {UPUTE.naredbe.map((row) => (
              <li key={row} className="text-pretty">
                {row}
              </li>
            ))}
          </ol>
          {err ? <p className="mt-4 text-sm text-clay text-pretty">{err}</p> : null}
          <div className="mt-auto space-y-2 pt-8">
            <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={() => void arm()}>
              {busy ? "Uključujem…" : "Uključi alarm na zaključanom"}
            </Button>
            <button
              type="button"
              onClick={onDone}
              className="w-full py-2 text-center text-sm text-muted"
            >
              Kasnije
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

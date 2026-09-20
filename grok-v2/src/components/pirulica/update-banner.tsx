import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_VERSION } from "@/lib/pirulica/version";
import { CapsuleMark } from "./capsule";

const NEWS = [
  "Alarm svira na medijima — i u tihom načinu i kad je ekran ugašen.",
  "Obavijest na zaključanom zaslonu i broj na ikoni dok ne uzmete.",
  "Zvoni 2 puta, pa svakih 20 s; odgoda 15 min daje 3, pa 4 zvona.",
  "Isti lijek uz jednu osobu samo jednom. Gumb Uključi alarm na zaključanom.",
];

export function UpdateNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <CapsuleMark size={22} />
          <p className="font-display text-xl tracking-[-0.03em]">Pilurica</p>
        </div>
        <section className="mt-8 flex flex-1 flex-col rounded-[28px] bg-pine px-5 py-6 text-pine-fg shadow-[var(--shadow-card)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine-fg/70">
            Ažuriranje · verzija {APP_VERSION}
          </p>
          <h1 className="mt-3 font-display text-3xl tracking-[-0.03em]">Nova verzija</h1>
          <p className="mt-2 text-sm text-pine-fg/80 text-pretty">
            Što je novo. Zapisi ostaju.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-pine-fg/90">
            {NEWS.map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-pine-fg/80" />
                <span className="text-pretty">{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8">
            <Button
              variant="outline"
              className="w-full bg-pine-fg text-pine"
              onClick={onDismiss}
            >
              U redu
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function RefreshCard({
  onUpdate,
  busy,
}: {
  onUpdate: () => void;
  busy: boolean;
}) {
  return (
    <section className="rounded-[20px] bg-cream px-4 py-4">
      <p className="text-sm font-medium text-ink">Osvježi predmemoriju</p>
      <p className="mt-1 text-xs text-muted text-pretty">Ažuriraj. Zapisi ostaju.</p>
      <Button
        variant="outline"
        className="mt-3 w-full"
        disabled={busy}
        onClick={onUpdate}
      >
        <RefreshCw className="size-4" />
        {busy ? "Ažuriram…" : "Ažuriraj"}
      </Button>
    </section>
  );
}

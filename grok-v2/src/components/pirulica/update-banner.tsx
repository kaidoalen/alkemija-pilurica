import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_VERSION } from "@/lib/pirulica/version";

export function WhatsNewCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="rounded-[24px] bg-pine px-5 py-5 text-pine-fg shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine-fg/70">
        Verzija {APP_VERSION}
      </p>
      <h2 className="mt-2 font-display text-2xl tracking-[-0.03em]">Nova verzija je tu</h2>
      <p className="mt-2 text-sm text-pine-fg/80 text-pretty">
        Najavljeno ažuriranje. Osobe, lijekovi i zapisi ostaju — kopija se pokupi sama.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-pine-fg/85">
        <li>Alarmi koji se ne preskaču na Androidu</li>
        <li>Fotografija kutije predloži naziv i gramažu</li>
        <li>Zaliha, rok, više osoba, kalendar</li>
      </ul>
      <Button
        variant="outline"
        className="mt-5 w-full bg-pine-fg text-pine"
        onClick={onDismiss}
      >
        U redu
      </Button>
    </section>
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
      <p className="text-sm font-medium text-ink">Vrijeme je za osvježenje</p>
      <p className="mt-1 text-xs text-muted text-pretty">
        Svakih 15 dana program se treba osvježiti da predmemorija ne zastari. Zapisi ostaju.
      </p>
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

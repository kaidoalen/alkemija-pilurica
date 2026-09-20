import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { ingestOldFile, type RecoverReport } from "@/lib/pirulica/store";
import { Button } from "@/components/ui/button";
import { CapsuleMark } from "./capsule";

export function OldPullOverlay({
  onDone,
  onClose,
}: {
  onDone: (report: RecoverReport, source: "file" | "message") => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function takeFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const report = await ingestOldFile(file);
      if (!report.meds) {
        setError("U toj datoteci nema lijekova. Treba JSON kopija iz Postavki.");
        return;
      }
      onDone(report, "file");
    } catch {
      setError("Datoteka nije valjani JSON.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-6">
      <div className="relative w-full max-w-lg rounded-t-[28px] bg-paper px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[var(--shadow-card)] sm:rounded-[28px]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-cream text-muted"
          aria-label="Zatvori"
        >
          <X className="size-4" />
        </button>
        <div className="flex items-center gap-3 pr-10">
          <span className="grid size-11 place-items-center rounded-2xl bg-cream">
            <CapsuleMark size={22} />
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
              JSON kopija
            </p>
            <h2 className="font-display text-2xl tracking-[-0.03em]">Uvezi JSON</h2>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted text-pretty">
          U JSON-u su slike kutija, doze, preostala količina i satnice. Nema prijave ni
          korisničkog računa — odaberi datoteku.
        </p>
        {error ? (
          <p className="mt-4 rounded-[16px] bg-clay/12 px-4 py-3 text-sm text-clay">{error}</p>
        ) : null}
        <div className="mt-5">
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" />
            {busy ? "Uvozim…" : "Odaberi JSON kopiju"}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void takeFile(file);
          }}
        />
      </div>
    </div>
  );
}

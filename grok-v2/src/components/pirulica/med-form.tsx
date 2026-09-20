import { useMemo, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { compressImage, thumbImage } from "@/lib/pirulica/image";
import { nid } from "@/lib/pirulica/ids";
import { readBoxLabel } from "@/lib/pirulica/scan";
import {
  MED_COLORS,
  WEEKDAYS,
  type Med,
  type MedColor,
  type Person,
} from "@/lib/pirulica/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { colorDot } from "./capsule";

const PRESETS = ["08:00", "12:00", "18:00", "21:00"];

export function MedForm({
  initial,
  people,
  personId,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Med | null;
  people: Person[];
  personId: string;
  onClose: () => void;
  onSave: (med: Med) => void;
  onDelete?: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [dose, setDose] = useState(initial?.dose ?? "");
  const [form, setForm] = useState(initial?.form ?? "tablete");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [color, setColor] = useState<MedColor>(initial?.color ?? "pine");
  const [times, setTimes] = useState<string[]>(initial?.times ?? ["08:00"]);
  const [days, setDays] = useState<number[]>(initial?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [active, setActive] = useState(initial?.active ?? true);
  const [customTime, setCustomTime] = useState("");
  const [owner, setOwner] = useState(initial?.personId ?? personId);
  const [stock, setStock] = useState(initial?.stock != null ? String(initial.stock) : "");
  const [packSize, setPackSize] = useState(
    initial?.packSize != null ? String(initial.packSize) : "",
  );
  const [perDose, setPerDose] = useState(String(initial?.tabletsPerDose ?? 1));
  const [expiry, setExpiry] = useState(initial?.expiry ?? "");
  const [photo, setPhoto] = useState<string | null>(initial?.photo ?? null);
  const [scanState, setScanState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [scanMsg, setScanMsg] = useState("");

  const canSave = name.trim().length > 0 && times.length > 0 && days.length > 0;

  const sortedTimes = useMemo(
    () => [...times].sort((a, b) => a.localeCompare(b)),
    [times],
  );

  function toggleTime(hm: string) {
    setTimes((cur) => (cur.includes(hm) ? cur.filter((t) => t !== hm) : [...cur, hm]));
  }

  function toggleDay(id: number) {
    setDays((cur) => (cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id]));
  }

  function addCustom() {
    if (!/^\d{1,2}:\d{2}$/.test(customTime)) return;
    const [h, m] = customTime.split(":");
    const hm = `${h.padStart(2, "0")}:${m}`;
    toggleTime(hm);
    setCustomTime("");
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setScanState("busy");
    setScanMsg("Čitam kutiju…");
    try {
      const dataUrl = await compressImage(file);
      const thumb = await thumbImage(dataUrl);
      setPhoto(thumb);
      const result = await readBoxLabel({ data: { image: dataUrl } });
      if (result.ok) {
        if (result.box.name) setName(result.box.name);
        if (result.box.dose) setDose(result.box.dose);
        if (result.box.form) setForm(result.box.form);
        setScanState("ok");
        setScanMsg("Predloženi naziv i gramaža. Provjeri pa spremi.");
      } else {
        setScanState("err");
        setScanMsg(result.error);
      }
    } catch {
      setScanState("err");
      setScanMsg("Slika se nije dala obraditi. Upiši naziv ručno.");
    }
  }

  function save() {
    if (!canSave) return;
    const stockN = stock.trim() === "" ? null : Math.max(0, Number(stock));
    const packN = packSize.trim() === "" ? null : Math.max(0, Number(packSize));
    onSave({
      id: initial?.id ?? nid(),
      personId: owner,
      name: name.trim(),
      dose: dose.trim(),
      form: form.trim(),
      notes: notes.trim(),
      color,
      times: sortedTimes,
      days: [...days].sort((a, b) => a - b),
      active,
      createdAt: initial?.createdAt ?? Date.now(),
      stock: stockN != null && Number.isFinite(stockN) ? stockN : null,
      packSize: packN != null && Number.isFinite(packN) ? packN : null,
      tabletsPerDose: Math.max(1, Number(perDose) || 1),
      expiry: expiry || null,
      photo,
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-paper">
      <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button
          type="button"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full bg-surface text-ink shadow-[var(--shadow-card)]"
          aria-label="Zatvori"
        >
          <X className="size-4" />
        </button>
        <h2 className="font-display text-xl tracking-[-0.03em]">
          {initial ? "Uredi lijek" : "Novi lijek"}
        </h2>
        <span className="w-11" />
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-8">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void onPhoto(e.target.files?.[0])}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={scanState === "busy"}
          className="flex w-full items-center gap-3 rounded-[20px] bg-surface px-4 py-3 text-left shadow-[var(--shadow-card)]"
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              className="size-12 rounded-[12px] object-cover"
            />
          ) : (
            <span className="grid size-12 place-items-center rounded-[12px] bg-cream text-pine">
              {scanState === "busy" ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Camera className="size-5" />
              )}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">
              Fotografiraj prednju stranu kutije
            </span>
            <span className="mt-0.5 block text-xs text-muted text-pretty">
              {scanMsg || "Program predloži naziv i gramažu."}
            </span>
          </span>
        </button>

        <div className="space-y-2">
          <Label htmlFor="med-name">Naziv</Label>
          <Input
            id="med-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="npr. Amlodipin"
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="med-dose">Gramaža</Label>
            <Input
              id="med-dose"
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="npr. 5 mg"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="med-form">Oblik</Label>
            <Input
              id="med-form"
              value={form}
              onChange={(e) => setForm(e.target.value)}
              placeholder="tablete"
              autoComplete="off"
            />
          </div>
        </div>

        {people.length > 1 ? (
          <div className="space-y-2">
            <Label>Osoba</Label>
            <div className="flex flex-wrap gap-2">
              {people.map((p) => {
                const on = owner === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setOwner(p.id)}
                    className={`h-11 rounded-full px-4 text-sm ${
                      on ? "bg-ink text-surface" : "bg-surface text-ink shadow-[var(--shadow-card)]"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>Boja</Label>
          <div className="flex gap-2">
            {MED_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setColor(c)}
                className={`size-11 rounded-full ${colorDot[c]} ${
                  color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""
                }`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="med-stock">Broj tableta</Label>
            <Input
              id="med-stock"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="28"
              inputMode="numeric"
              className="tabular-nums"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="med-dose-n">U jednoj dozi</Label>
            <Input
              id="med-dose-n"
              value={perDose}
              onChange={(e) => setPerDose(e.target.value)}
              inputMode="numeric"
              className="tabular-nums"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="med-pack">Kutija</Label>
            <Input
              id="med-pack"
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
              placeholder="28"
              inputMode="numeric"
              className="tabular-nums"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="med-expiry">Rok trajanja</Label>
          <Input id="med-expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Koliko puta dnevno · satnice</Label>
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set([...PRESETS, ...times])).map((hm) => {
              const on = times.includes(hm);
              return (
                <button
                  key={hm}
                  type="button"
                  onClick={() => toggleTime(hm)}
                  className={`h-11 rounded-full px-4 text-sm tabular-nums ${
                    on ? "bg-pine text-pine-fg" : "bg-surface text-ink shadow-[var(--shadow-card)]"
                  }`}
                >
                  {hm}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              placeholder="07:30"
              inputMode="numeric"
              className="tabular-nums"
            />
            <Button type="button" variant="outline" onClick={addCustom}>
              Dodaj
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Dani</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const on = days.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDay(d.id)}
                  className={`h-11 min-w-11 rounded-full px-3 text-sm ${
                    on ? "bg-ink text-surface" : "bg-surface text-muted shadow-[var(--shadow-card)]"
                  }`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="med-notes">Bilješka</Label>
          <Input
            id="med-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="npr. nakon jela"
          />
        </div>

        <div className="flex items-center justify-between rounded-[20px] bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
          <div>
            <p className="text-sm font-medium text-ink">Aktivan alarm</p>
            <p className="text-xs text-muted">Isključi ako pauziraš terapiju</p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        <Button size="lg" className="w-full" disabled={!canSave} onClick={save}>
          Spremi
        </Button>
        {initial && onDelete ? (
          <Button variant="danger" className="w-full" onClick={() => onDelete(initial.id)}>
            Obriši lijek
          </Button>
        ) : null}
      </div>
    </div>
  );
}

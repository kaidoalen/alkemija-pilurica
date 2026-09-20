import { useMemo, useRef, useState } from "react";
import { Camera, Images, Loader2, X } from "lucide-react";
import { compressImage, thumbImage } from "@/lib/pirulica/image";
import { nid } from "@/lib/pirulica/ids";
import { readBoxLabel } from "@/lib/pirulica/scan";
import {
  MED_COLORS,
  WEEKDAYS,
  type Med,
  type MedColor,
  type MedPhoto,
  type Person,
} from "@/lib/pirulica/types";
import { photosOf } from "@/lib/pirulica/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { colorDot } from "./capsule";

const TIME_CHIPS = [
  { hm: "08:00", label: "Ujutro", clock: "8:00" },
  { hm: "12:00", label: "Podne", clock: "12:00" },
  { hm: "18:00", label: "Popodne", clock: "18:00" },
  { hm: "21:00", label: "Navečer", clock: "21:00" },
];

const PER_DOSE = [1, 2, 3];

export function MedForm({
  initial,
  people,
  personId,
  hideOwner = false,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Med | null;
  people: Person[];
  personId: string;
  hideOwner?: boolean;
  onClose: () => void;
  onSave: (med: Med) => void;
  onDelete?: (id: string) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
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
  const [photos, setPhotos] = useState<MedPhoto[]>(() =>
    photosOf(initial ?? { photo: null, photos: [] }),
  );
  const [scanState, setScanState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [scanMsg, setScanMsg] = useState("");
  const [more, setMore] = useState(false);
  const [pickDays, setPickDays] = useState(() => (initial?.days.length ?? 7) < 7);

  const askStock = !hideOwner || !initial;
  const forPerson = Boolean(initial) && !hideOwner;
  const canSave = name.trim().length > 0 && times.length > 0 && days.length > 0;

  const sortedTimes = useMemo(
    () => [...times].sort((a, b) => a.localeCompare(b)),
    [times],
  );

  const dirty = useMemo(() => {
    if (!initial) return true;
    const stockInit = initial.stock != null ? String(initial.stock) : "";
    const photoInit = photosOf(initial)
      .map((p) => p.src)
      .join("|");
    return (
      name.trim() !== initial.name ||
      form.trim() !== (initial.form || "tablete") ||
      notes.trim() !== initial.notes ||
      color !== initial.color ||
      sortedTimes.join("|") !== [...initial.times].sort().join("|") ||
      [...days].sort((a, b) => a - b).join("|") !==
        [...initial.days].sort((a, b) => a - b).join("|") ||
      active !== initial.active ||
      owner !== initial.personId ||
      stock !== stockInit ||
      Math.max(1, Number(perDose) || 1) !== (initial.tabletsPerDose || 1) ||
      (expiry || "") !== (initial.expiry || "") ||
      photoInit !== photos.map((p) => p.src).join("|")
    );
  }, [
    initial,
    name,
    form,
    notes,
    color,
    sortedTimes,
    days,
    active,
    owner,
    stock,
    perDose,
    expiry,
    photos,
  ]);

  function toggleTime(hm: string) {
    setTimes((cur) => (cur.includes(hm) ? cur.filter((t) => t !== hm) : [...cur, hm]));
  }

  function toggleDay(id: number) {
    setDays((cur) => (cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id]));
  }

  function addCustom() {
    const raw = customTime.trim();
    if (!/^\d{1,2}:\d{2}$/.test(raw)) return;
    const [h, m] = raw.split(":");
    const hm = `${h.padStart(2, "0")}:${m}`;
    if (!times.includes(hm)) toggleTime(hm);
    setCustomTime("");
  }

  async function onPhotos(list: FileList | File[] | null | undefined) {
    const files = [...(list ?? [])].filter(
      (f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name),
    );
    if (!files.length) return;
    let added = photos.length;
    setScanState("busy");
    let scanned = false;
    for (const file of files) {
      const isFirst = added === 0;
      setScanMsg(isFirst ? "Čitam kutiju…" : "Dodajem sliku…");
      try {
        const dataUrl = await compressImage(file);
        const thumb = await thumbImage(dataUrl);
        const kind = added === 0 ? "box" : added === 1 ? "blister" : "tablet";
        const slot = added;
        setPhotos((cur) => [...cur, { id: nid(), kind, slot, src: thumb }]);
        added += 1;
        if (isFirst && !scanned) {
          scanned = true;
          const result = await readBoxLabel({ data: { image: dataUrl } });
          if (result.ok) {
            if (result.box.name) setName(result.box.name);
            if (result.box.form) setForm(result.box.form);
            setScanState("ok");
            setScanMsg("Predloženi naziv. Provjerite pa spremite.");
          } else {
            setScanState("err");
            setScanMsg(result.error);
          }
        } else {
          setScanState("ok");
        }
      } catch {
        setScanState("err");
        setScanMsg("Slika se nije dala obraditi. Upišite naziv ručno.");
      }
    }
    if (files.length > 1 && added > photos.length) {
      setScanMsg(`Dodano ${files.length} slika iz galerije.`);
    } else if (!scanned && added > photos.length) {
      setScanMsg("Slika je dodana.");
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
      form: form.trim() || "tablete",
      notes: notes.trim(),
      color,
      times: sortedTimes,
      days: [...days].sort((a, b) => a - b),
      active,
      createdAt: initial?.createdAt ?? Date.now(),
      stock: askStock
        ? stockN != null && Number.isFinite(stockN)
          ? stockN
          : null
        : (initial?.stock ?? null),
      packSize: packN != null && Number.isFinite(packN) ? packN : null,
      tabletsPerDose: Math.max(1, Number(perDose) || 1),
      expiry: expiry || null,
      photo: photos[0]?.src ?? null,
      photos,
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
          {initial ? "Uredi lijek" : "Upis lijeka"}
        </h2>
        <span className="w-11" />
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-10">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void onPhotos(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void onPhotos(e.target.files);
            e.target.value = "";
          }}
        />

        <section className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
            1 · Koji lijek
          </p>
          {photos.length ? (
            <div className="flex gap-2 overflow-x-auto">
              {photos.map((p) => (
                <div key={p.id} className="relative shrink-0">
                  <img src={p.src} alt="" className="size-20 rounded-[14px] object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))}
                    className="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full bg-ink text-surface"
                    aria-label="Ukloni sliku"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={scanState === "busy"}
              className="flex min-h-14 items-center gap-3 rounded-[20px] bg-surface px-3 py-3 text-left shadow-[var(--shadow-card)]"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-cream text-pine">
                {scanState === "busy" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Camera className="size-5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">Kamera</span>
                <span className="mt-0.5 block text-xs text-muted">Slikaj kutiju</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={scanState === "busy"}
              className="flex min-h-14 items-center gap-3 rounded-[20px] bg-surface px-3 py-3 text-left shadow-[var(--shadow-card)]"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-cream text-pine">
                <Images className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">Galerija</span>
                <span className="mt-0.5 block text-xs text-muted">Odaberi slike</span>
              </span>
            </button>
          </div>
          <p className="text-sm text-muted text-pretty">
            {scanMsg || "Slikajte kutiju ili samo upišite naziv."}
          </p>
          <div className="space-y-2">
            <Label htmlFor="med-name">Naziv lijeka</Label>
            <Input
              id="med-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="npr. Amlodipin"
              autoComplete="off"
              className="h-12 text-base"
            />
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
            2 · Kako uzimate
          </p>
          <p className="text-sm font-medium text-ink">Koliko tableta odjednom?</p>
          <div className="flex gap-2">
            {PER_DOSE.map((n) => {
              const on = Number(perDose) === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPerDose(String(n))}
                  className={`h-12 min-w-12 flex-1 rounded-[16px] text-base tabular-nums ${
                    on ? "bg-pine text-pine-fg" : "bg-surface text-ink shadow-[var(--shadow-card)]"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {askStock ? (
            <div className="space-y-2">
              <Label htmlFor="med-stock">Koliko komada još imate?</Label>
              <Input
                id="med-stock"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="npr. 28 — ili ostavite prazno"
                inputMode="numeric"
                className="h-12 tabular-nums text-base"
              />
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
            3 · Kad da vas podsjetim
          </p>
          <p className="text-sm text-muted text-pretty">
            Stisnite doba dana kad uzimate lijek. Možete više.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TIME_CHIPS.map((chip) => {
              const on = times.includes(chip.hm);
              return (
                <button
                  key={chip.hm}
                  type="button"
                  onClick={() => toggleTime(chip.hm)}
                  className={`min-h-14 rounded-[18px] px-3 py-2 text-left ${
                    on ? "bg-pine text-pine-fg" : "bg-surface text-ink shadow-[var(--shadow-card)]"
                  }`}
                >
                  <span className="block text-sm font-medium">{chip.label}</span>
                  <span className="block text-xs tabular-nums opacity-80">{chip.clock}</span>
                </button>
              );
            })}
          </div>
          {times
            .filter((hm) => !TIME_CHIPS.some((c) => c.hm === hm))
            .map((hm) => (
              <button
                key={hm}
                type="button"
                onClick={() => toggleTime(hm)}
                className="h-12 rounded-full bg-pine px-4 text-sm tabular-nums text-pine-fg"
              >
                {hm} · makni
              </button>
            ))}
          <div className="flex gap-2">
            <Input
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              placeholder="7:30"
              inputMode="numeric"
              aria-label="Drugi sat"
              className="h-12 tabular-nums text-base"
            />
            <Button type="button" variant="outline" className="h-12 shrink-0" onClick={addCustom}>
              Drugi sat
            </Button>
          </div>
          {pickDays ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">Koje dane?</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => {
                  const on = days.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDay(d.id)}
                      className={`h-11 min-w-11 rounded-full px-3 text-sm ${
                        on
                          ? "bg-ink text-surface"
                          : "bg-surface text-muted shadow-[var(--shadow-card)]"
                      }`}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickDays(true)}
              className="text-sm text-muted underline-offset-4 hover:underline"
            >
              Ne uzimam svaki dan
            </button>
          )}
        </section>

        {hideOwner || people.length <= 1 ? null : (
          <div className="space-y-2">
            <Label>Za koga je ovaj unos</Label>
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
        )}

        {forPerson ? null : (
          <>
            <Button size="lg" className="h-14 w-full text-base" disabled={!canSave} onClick={save}>
              Spremi i podsjeti me
            </Button>
            {!canSave ? (
              <p className="text-center text-sm text-muted">
                {!name.trim()
                  ? "Upišite naziv lijeka."
                  : times.length === 0
                    ? "Odaberite barem jedno doba dana."
                    : "Odaberite barem jedan dan."}
              </p>
            ) : null}
          </>
        )}

        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="w-full text-center text-sm text-muted underline-offset-4 hover:underline"
        >
          {more ? "Sakrij dodatno" : "Još postavki (rok, bilješka)"}
        </button>

        {more ? (
          <div className="space-y-4 pb-4">
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
            <div className="space-y-2">
              <Label>Boja na rasporedu</Label>
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
            <div className="space-y-2">
              <Label htmlFor="med-expiry">Rok trajanja</Label>
              <Input
                id="med-expiry"
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
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
                <p className="text-sm font-medium text-ink">Alarm uključen</p>
                <p className="text-xs text-muted">Isključite ako pauzirate terapiju</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>
        ) : null}

        {initial && onDelete ? (
          <Button variant="danger" className="w-full" onClick={() => onDelete(initial.id)}>
            Obriši lijek
          </Button>
        ) : null}
      </div>

      {forPerson && dirty ? (
        <div className="border-t border-line bg-paper px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            size="lg"
            className="h-14 w-full text-base"
            disabled={!canSave}
            onClick={save}
          >
            Spremi postavke
          </Button>
        </div>
      ) : null}
    </div>
  );
}

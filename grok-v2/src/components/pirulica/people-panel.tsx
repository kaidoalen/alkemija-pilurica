import { useState } from "react";
import { ChevronLeft, Plus, UserRound, X } from "lucide-react";
import { nid } from "@/lib/pirulica/ids";
import {
  assignMedToPerson,
  catalogMeds,
  medKey,
  photosOf,
  removePerson,
  setCurrentPerson,
  type Snapshot,
  unassignMedFromPerson,
  upsertPerson,
} from "@/lib/pirulica/store";
import { daysLeftLabel, formatStock, stockWarning } from "@/lib/pirulica/stock";
import type { Med } from "@/lib/pirulica/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhotoStrip } from "./photo-strip";

export function PeoplePanel({
  snap,
  viewId,
  onViewId,
  onEditMed,
}: {
  snap: Snapshot;
  viewId: string | null;
  onViewId: (id: string | null) => void;
  onEditMed: (med: Med) => void;
}) {
  const [newName, setNewName] = useState("");
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<Med | null>(null);
  const [qty, setQty] = useState("");
  const catalog = catalogMeds(snap);
  const person = snap.people.find((p) => p.id === viewId) ?? null;

  function addPerson() {
    const name = newName.trim();
    if (!name) return;
    const id = nid();
    upsertPerson({ id, name, createdAt: Date.now() });
    setCurrentPerson(id);
    setNewName("");
    onViewId(id);
    setPicking(false);
    setPending(null);
  }

  function openPerson(id: string) {
    setCurrentPerson(id);
    onViewId(id);
    setPicking(false);
    setPending(null);
    setQty("");
  }

  function parseQty(raw: string): number | null {
    const t = raw.trim();
    if (!t) return null;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.round(n));
  }

  function confirmAssign() {
    if (!pending || !person) return;
    assignMedToPerson(pending.id, person.id, parseQty(qty));
    setPending(null);
    setQty("");
    setPicking(false);
  }

  if (person) {
    const mine = snap.meds.filter((m) => m.personId === person.id);
    const mineKeys = new Set(mine.map(medKey));
    const available = catalog.filter((m) => !mineKeys.has(medKey(m)));
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onViewId(null);
              setPicking(false);
              setPending(null);
            }}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-ink shadow-[var(--shadow-card)]"
            aria-label="Natrag na osobe"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="min-w-0">
            <h2 className="font-display text-2xl tracking-[-0.03em]">{person.name}</h2>
            <p className="text-sm text-muted text-pretty">
              Stisnite lijek da uredite kako ga {person.name} uzima i kad da ga podsjeti.
            </p>
          </div>
        </div>

        {mine.length === 0 ? (
          <div className="rounded-[24px] bg-surface px-5 py-8 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm text-muted text-pretty">
              {person.name} još nema lijekova. Dodajte iz kataloga.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {mine.map((med) => {
              const warn = stockWarning(med);
              const left = daysLeftLabel(med);
              const stock = formatStock(med);
              return (
                <li key={med.id}>
                  <div className="flex items-stretch gap-1">
                    <button
                      type="button"
                      onClick={() => onEditMed(med)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-[22px] bg-surface px-4 py-4 text-left shadow-[var(--shadow-card)]"
                    >
                      <PhotoStrip photos={photosOf(med)} color={med.color} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{med.name}</span>
                        <span className="mt-0.5 block text-sm tabular-nums text-muted">
                          {med.times.join("  ·  ") || "nema satnice"}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {warn === "out"
                            ? "nema zalihe"
                            : warn === "low" && left
                              ? left
                              : stock
                                ? stock
                                : `${med.tabletsPerDose} odjednom`}
                        </span>
                      </span>
                    </button>
                    {snap.meds.filter((m) => medKey(m) === medKey(med)).length > 1 ? (
                      <button
                        type="button"
                        onClick={() => unassignMedFromPerson(med.id, person.id)}
                        className="grid size-11 shrink-0 self-center place-items-center rounded-full text-muted"
                        aria-label={`Makni ${med.name}`}
                      >
                        <X className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {catalog.length === 0 ? (
          <p className="text-sm text-muted text-pretty">Prvo upišite lijek u tabu Lijekovi.</p>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setPending(null);
              setPicking((v) => !v);
            }}
          >
            <Plus className="size-4" />
            {picking ? "Zatvori popis" : "Dodaj lijek ovoj osobi"}
          </Button>
        )}

        {pending ? (
          <div className="space-y-2 rounded-[20px] bg-cream px-4 py-4">
            <p className="text-sm text-ink text-pretty">
              Koliko komada {pending.name} ima {person.name}?
            </p>
            <div className="flex gap-2">
              <Input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="numeric"
                placeholder="npr. 20"
                className="h-12 tabular-nums text-base"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmAssign();
                }}
              />
              <Button type="button" className="h-12" onClick={confirmAssign}>
                Spremi
              </Button>
            </div>
          </div>
        ) : picking ? (
          available.length ? (
            <ul className="space-y-1">
              {available.map((med) => (
                <li key={med.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setQty("");
                      setPending(med);
                    }}
                    className="flex w-full items-center gap-3 rounded-[18px] bg-surface px-3 py-3 text-left shadow-[var(--shadow-card)]"
                  >
                    <PhotoStrip photos={photosOf(med)} color={med.color} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{med.name}</span>
                      <span className="block truncate text-xs text-muted">{med.form || "lijek"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Svi definirani lijekovi su već dodani.</p>
          )
        ) : null}

        {snap.people.length > 1 ? (
          <button
            type="button"
            onClick={() => {
              removePerson(person.id);
              onViewId(null);
            }}
            className="w-full py-2 text-center text-sm text-clay"
          >
            Ukloni {person.name}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl tracking-[-0.03em]">Osobe</h2>
        <p className="text-sm text-muted text-pretty">
          Stisnite ime — otvaraju se lijekovi koje ta osoba uzima.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="npr. Mama"
          autoComplete="off"
          className="h-12 text-base"
          onKeyDown={(e) => {
            if (e.key === "Enter") addPerson();
          }}
        />
        <Button type="button" variant="outline" className="h-12" onClick={addPerson}>
          <Plus className="size-4" />
          Dodaj
        </Button>
      </div>

      <ul className="space-y-2">
        {snap.people.map((p) => {
          const n = snap.meds.filter((m) => m.personId === p.id).length;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => openPerson(p.id)}
                className="flex w-full items-center gap-3 rounded-[22px] bg-surface px-4 py-4 text-left shadow-[var(--shadow-card)]"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-cream text-ink">
                  <UserRound className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium text-ink">{p.name}</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {n === 0
                      ? "nema lijekova"
                      : n === 1
                        ? "1 lijek — stisnite da otvorite"
                        : `${n} lijeka — stisnite da otvorite`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

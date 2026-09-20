import { useState } from "react";
import { Plus, UserRound, X } from "lucide-react";
import { nid } from "@/lib/pirulica/ids";
import {
  assignMedToPerson,
  catalogMeds,
  medKey,
  photosOf,
  removePerson,
  setCurrentPerson,
  setPersonStock,
  type Snapshot,
  unassignMedFromPerson,
  upsertPerson,
} from "@/lib/pirulica/store";
import { daysLeftLabel, stockWarning } from "@/lib/pirulica/stock";
import type { Med } from "@/lib/pirulica/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhotoStrip } from "./photo-strip";

export function PeoplePanel({
  snap,
  onEditMed,
}: {
  snap: Snapshot;
  onEditMed: (med: Med) => void;
}) {
  const [newName, setNewName] = useState("");
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [pending, setPending] = useState<{ personId: string; med: Med } | null>(null);
  const [qty, setQty] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const catalog = catalogMeds(snap);

  function addPerson() {
    const name = newName.trim();
    if (!name) return;
    const id = nid();
    upsertPerson({ id, name, createdAt: Date.now() });
    setCurrentPerson(id);
    setNewName("");
  }

  function parseQty(raw: string): number | null {
    const t = raw.trim();
    if (!t) return null;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.round(n));
  }

  function confirmAssign() {
    if (!pending) return;
    assignMedToPerson(pending.med.id, pending.personId, parseQty(qty));
    setPending(null);
    setQty("");
    setOpenFor(null);
  }

  function saveDraft(med: Med) {
    if (!(med.id in drafts)) return;
    setPersonStock(med.id, parseQty(drafts[med.id] ?? ""));
    setDrafts((cur) => {
      const next = { ...cur };
      delete next[med.id];
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl tracking-[-0.03em]">Osobe</h2>
        <p className="text-sm text-muted text-pretty">
          Isti lijek može dobiti više osoba. Za svaku upiši koliko komada ima.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="npr. Mama"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") addPerson();
          }}
        />
        <Button type="button" variant="outline" onClick={addPerson}>
          <Plus className="size-4" />
          Dodaj
        </Button>
      </div>

      <ul className="space-y-3">
        {snap.people.map((person) => {
          const mine = snap.meds.filter((m) => m.personId === person.id);
          const mineKeys = new Set(mine.map(medKey));
          const available = catalog.filter((m) => !mineKeys.has(medKey(m)));
          const picking = openFor === person.id;
          const on = person.id === snap.settings.currentPersonId;
          const asking = pending?.personId === person.id;
          return (
            <li
              key={person.id}
              className="rounded-[24px] bg-surface px-4 py-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentPerson(person.id)}
                  className={`grid size-11 shrink-0 place-items-center rounded-full ${
                    on ? "bg-ink text-surface" : "bg-cream text-ink"
                  }`}
                  aria-label={person.name}
                >
                  <UserRound className="size-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{person.name}</p>
                  <p className="text-xs text-muted">
                    {mine.length
                      ? `${mine.length} ${mine.length === 1 ? "lijek" : "lijeka"}`
                      : "nema dodijeljenih lijekova"}
                  </p>
                </div>
                {snap.people.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removePerson(person.id)}
                    className="grid size-11 place-items-center rounded-full text-clay"
                    aria-label={`Ukloni ${person.name}`}
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>

              {mine.length ? (
                <ul className="mt-3 space-y-1.5">
                  {mine.map((med) => {
                    const warn = stockWarning(med);
                    const left = daysLeftLabel(med);
                    return (
                      <li key={med.id}>
                        <div className="flex items-center gap-2 rounded-[14px] bg-cream px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => onEditMed(med)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <PhotoStrip photos={photosOf(med)} color={med.color} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm text-ink">{med.name}</span>
                              <span className="block truncate text-xs text-muted">
                                {warn === "low" && left
                                  ? left
                                  : warn === "out"
                                    ? "nema zalihe"
                                    : med.times.join(" · ") || med.form}
                              </span>
                            </span>
                          </button>
                          <Input
                            value={drafts[med.id] ?? (med.stock == null ? "" : String(med.stock))}
                            onChange={(e) =>
                              setDrafts((cur) => ({ ...cur, [med.id]: e.target.value }))
                            }
                            onBlur={() => saveDraft(med)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                            inputMode="numeric"
                            placeholder="kom"
                            aria-label={`Komada za ${person.name}`}
                            className="h-9 w-16 shrink-0 px-2 text-center tabular-nums"
                          />
                          {snap.meds.filter((m) => medKey(m) === medKey(med)).length > 1 ? (
                            <button
                              type="button"
                              onClick={() => unassignMedFromPerson(med.id, person.id)}
                              className="grid size-9 shrink-0 place-items-center rounded-full text-muted"
                              aria-label={`Makni ${med.name}`}
                            >
                              <X className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {catalog.length === 0 ? (
                <p className="mt-3 text-xs text-muted text-pretty">
                  Prvo definiraj lijek u tabu Lijekovi.
                </p>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => {
                    setPending(null);
                    setOpenFor(picking ? null : person.id);
                  }}
                >
                  <Plus className="size-4" />
                  {picking ? "Zatvori popis" : "Dodaj lijek"}
                </Button>
              )}

              {asking ? (
                <div className="mt-3 space-y-2 rounded-[16px] bg-cream px-3 py-3">
                  <p className="text-sm text-ink text-pretty">
                    Koliko komada {pending.med.name} ima {person.name}?
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      inputMode="numeric"
                      placeholder="npr. 20"
                      className="tabular-nums"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmAssign();
                      }}
                    />
                    <Button type="button" onClick={confirmAssign}>
                      Spremi
                    </Button>
                  </div>
                </div>
              ) : picking ? (
                available.length ? (
                  <ul className="mt-2 space-y-1">
                    {available.map((med) => (
                      <li key={med.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setQty("");
                            setPending({ personId: person.id, med });
                          }}
                          className="flex w-full items-center gap-2 rounded-[14px] px-2 py-2 text-left"
                        >
                          <PhotoStrip photos={photosOf(med)} color={med.color} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-ink">{med.name}</span>
                            <span className="block truncate text-xs text-muted">
                              {med.form || "lijek"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted">Svi definirani lijekovi su već dodani.</p>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

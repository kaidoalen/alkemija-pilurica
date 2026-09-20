import { Plus } from "lucide-react";
import { medKey, photosOf } from "@/lib/pirulica/store";
import { WEEKDAYS, type Med, type Person } from "@/lib/pirulica/types";
import { Button } from "@/components/ui/button";
import { PhotoStrip } from "./photo-strip";

export function MedsPanel({
  meds,
  allMeds,
  people,
  onAdd,
  onEdit,
}: {
  meds: Med[];
  allMeds: Med[];
  people: Person[];
  onAdd: () => void;
  onEdit: (med: Med) => void;
}) {
  const names = new Map(people.map((p) => [p.id, p.name]));
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl tracking-[-0.03em]">Lijekovi</h2>
          <p className="text-sm text-muted text-pretty">
            Ovdje definiraš lijek. U tabu Osobe ga dodaješ osobi.
          </p>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="size-4" />
          Novi
        </Button>
      </div>

      {meds.length === 0 ? (
        <div className="rounded-[24px] bg-surface px-5 py-8 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted text-pretty">
            Unesite broj komada, koliko u jednoj dozi i satnice. Isti lijek može uzimati više osoba.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {meds.map((med) => {
            const copies = allMeds.filter((m) => medKey(m) === medKey(med));
            const who = copies.map((m) => {
              const name = names.get(m.personId);
              if (!name) return null;
              return m.stock != null ? `${name} ${m.stock} kom` : name;
            }).filter((n): n is string => Boolean(n));
            return (
              <li key={med.id}>
                <button
                  type="button"
                  onClick={() => onEdit(med)}
                  className="flex w-full items-start gap-3 rounded-[22px] bg-surface px-4 py-4 text-left shadow-[var(--shadow-card)]"
                >
                  <PhotoStrip photos={photosOf(med)} color={med.color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-medium text-ink">{med.name}</p>
                      {!med.active ? (
                        <span className="text-[11px] uppercase tracking-wider text-faint">
                          pauza
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{med.form || "tablete"}</p>
                    <p className="mt-2 text-xs tabular-nums text-faint">
                      {med.times.join("  ·  ")}
                      {` · ${med.tabletsPerDose} u dozi`}
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      {med.days.length === 7
                        ? "Svaki dan"
                        : WEEKDAYS.filter((d) => med.days.includes(d.id))
                            .map((d) => d.short)
                            .join(" ")}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {who.length
                        ? `Osobe: ${who.join(" · ")}`
                        : "Još nije dodan nijednoj osobi."}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { Plus } from "lucide-react";
import { formatExpiry, formatStock, stockWarning } from "@/lib/pirulica/stock";
import { WEEKDAYS, type Med } from "@/lib/pirulica/types";
import { Button } from "@/components/ui/button";
import { colorDot } from "./capsule";

export function MedsPanel({
  meds,
  personName,
  onAdd,
  onEdit,
  onRefill,
}: {
  meds: Med[];
  personName: string;
  onAdd: () => void;
  onEdit: (med: Med) => void;
  onRefill: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl tracking-[-0.03em]">Lijekovi</h2>
          <p className="text-sm text-muted">
            {personName === "Ja" ? "Raspored ostaje na ovom telefonu." : `Za: ${personName}`}
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
            Unesite broj tableta, koliko u jednoj dozi, koliko puta dnevno i satnice. Ili
            fotografirajte kutiju.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {meds.map((med) => {
            const stock = formatStock(med);
            const expiry = formatExpiry(med);
            const warn = stockWarning(med);
            return (
              <li key={med.id}>
                <div className="rounded-[22px] bg-surface px-4 py-4 shadow-[var(--shadow-card)]">
                  <button
                    type="button"
                    onClick={() => onEdit(med)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    {med.photo ? (
                      <img
                        src={med.photo}
                        alt=""
                        className="mt-0.5 size-11 shrink-0 rounded-[12px] object-cover"
                      />
                    ) : (
                      <span
                        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${colorDot[med.color]}`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-medium text-ink">{med.name}</p>
                        {!med.active ? (
                          <span className="text-[11px] uppercase tracking-wider text-faint">
                            pauza
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">
                        {med.dose || "bez doze"}
                        {med.form ? ` · ${med.form}` : ""}
                      </p>
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
                      {stock || expiry ? (
                        <p
                          className={`mt-2 text-xs ${warn === "none" ? "text-faint" : "text-clay"}`}
                        >
                          {[stock, expiry].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </button>
                  {med.packSize ? (
                    <button
                      type="button"
                      onClick={() => onRefill(med.id)}
                      className="mt-3 h-10 w-full rounded-[12px] bg-cream text-sm font-medium text-ink"
                    >
                      Dopuni kutiju
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

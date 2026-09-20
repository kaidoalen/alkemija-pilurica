import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { hr } from "date-fns/locale";
import { CalendarDays, Pill, Settings, Users } from "lucide-react";
import {
  resolveDismiss,
  resolveSnooze,
  resolveTaken,
  startEngine,
  testAlarmNow,
} from "@/lib/pirulica/engine";
import { dueUnacked, nextUpcoming, planWindow } from "@/lib/pirulica/schedule";
import {
  applyAppUpdate,
  catalogMeds,
  currentPerson,
  hydrateFromStorage,
  listenForOldPilurica,
  markTaken,
  personMeds,
  removeCatalogMed,
  removeMed,
  saveCatalogMed,
  seedExamples,
  setCurrentPerson,
  upsertMed,
  usePilurica,
  type Snapshot,
} from "@/lib/pirulica/store";
import {
  dismissWhatsNew,
  needsStaleRefresh,
  needsWhatsNew,
} from "@/lib/pirulica/version";
import type { Med } from "@/lib/pirulica/types";
import { cn } from "@/lib/utils";
import { AlarmOverlay } from "./alarm-overlay";
import { CapsuleMark } from "./capsule";
import { MedForm } from "./med-form";
import { MedsPanel } from "./meds-panel";
import { OldPullOverlay } from "./old-pull-overlay";
import { PeoplePanel } from "./people-panel";
import { SettingsPanel } from "./settings-panel";
import { TodayPanel } from "./today-panel";
import { RefreshCard, UpdateNotice } from "./update-banner";
import { LockArm, needsLockArm } from "./lock-arm";
import { ensureLockAlarms } from "@/lib/pirulica/push-client";

type Tab = "today" | "meds" | "people" | "settings";
type EditMode = "catalog" | "copy";

function findDose(snap: Snapshot, occurrenceId: string) {
  if (snap.ringing?.occurrenceId === occurrenceId) return snap.ringing;
  return (
    dueUnacked(snap.meds, snap.logs, snap.snoozes).find(
      (d) => d.occurrenceId === occurrenceId,
    ) ??
    snap.snoozes.find((d) => d.occurrenceId === occurrenceId) ??
    planWindow(snap.meds, Date.now() - 86_400_000, 4).find(
      (d) => d.occurrenceId === occurrenceId,
    ) ??
    nextUpcoming(snap.meds, snap.logs, snap.snoozes)
  );
}

export function PiluricaApp() {
  const snap = usePilurica();
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("today");
  const [editing, setEditing] = useState<Med | null | undefined>(undefined);
  const [editMode, setEditMode] = useState<EditMode>("catalog");
  const [whatsNew, setWhatsNew] = useState(() => needsWhatsNew());
  const [staleRefresh, setStaleRefresh] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [recoverNote, setRecoverNote] = useState<string | null>(null);
  const [pullOpen, setPullOpen] = useState(false);
  const [viewPersonId, setViewPersonId] = useState<string | null>(null);
  const [lockArm, setLockArm] = useState(() => !needsWhatsNew() && needsLockArm());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateFromStorage();
      if (cancelled) return;
      startEngine();
      setStaleRefresh(needsStaleRefresh());
    })();
    const stopListen = listenForOldPilurica((r) => {
      if (cancelled) return;
      if (r.meds && !r.photos) {
        setRecoverNote("Stigli lijekovi, čekam slike kutija…");
        return;
      }
      setPullOpen(false);
      setRecoverNote(
        r.meds
          ? `Uvezen JSON: ${r.meds} lijekova · ${r.photos} slika · zaliha za ${r.withStock} · satnice za ${r.withTimes}.`
          : "Stara kopija je stigla, ali u njoj nema lijekova.",
      );
      if (r.meds) setTab("meds");
    });
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "alarms" || params.get("tab") === "settings") {
      setTab("settings");
    }
    if (params.get("tab") === "osobe" || params.get("tab") === "people") {
      setTab("people");
    }
    const who = params.get("osoba") || params.get("person");
    if (who) setViewPersonId(who);
    return () => {
      cancelled = true;
      stopListen();
      window.clearInterval(id);
    };
  }, []);

  const dateLabel = useMemo(() => {
    const raw = format(now, "EEEE, d. MMMM", { locale: hr });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [now]);

  const clock = format(now, "HH:mm");
  const person = currentPerson(snap);
  const mine = personMeds(snap);
  const catalog = catalogMeds(snap);

  function takeById(occurrenceId: string) {
    const dose = findDose(snap, occurrenceId);
    if (!dose) return;
    if (snap.ringing?.occurrenceId === occurrenceId) {
      void resolveTaken(dose);
      return;
    }
    markTaken(dose);
  }

  async function runRecover() {
    setRecoverNote(null);
    setPullOpen(true);
  }

  async function runUpdate() {
    setUpdating(true);
    try {
      await applyAppUpdate();
    } finally {
      setUpdating(false);
    }
  }

  function openCatalog(med: Med | null) {
    setEditMode("catalog");
    setEditing(med);
  }

  function openCopy(med: Med) {
    setEditMode("copy");
    setEditing(med);
  }

  function openPerson(id: string) {
    setCurrentPerson(id);
    setViewPersonId(id);
    setEditing(undefined);
    setTab("people");
  }

  if (whatsNew) {
    return (
      <div className="min-h-dvh bg-paper text-ink">
        <UpdateNotice
          onDismiss={() => {
            dismissWhatsNew();
            setWhatsNew(false);
            void ensureLockAlarms().then((ok) => {
              if (!ok && needsLockArm()) setLockArm(true);
            });
          }}
        />
      </div>
    );
  }

  if (lockArm) {
    return (
      <div className="min-h-dvh bg-paper text-ink">
        <LockArm onDone={() => setLockArm(false)} />
      </div>
    );
  }

  if (!snap.hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper text-muted">
        <CapsuleMark size={36} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
        <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CapsuleMark size={22} />
                <p className="font-display text-xl tracking-[-0.03em]">Pilurica</p>
              </div>
              <p className="mt-2 text-sm text-muted">{dateLabel}</p>
              {snap.people.length > 1 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {snap.people.map((p) => {
                    const on = p.id === person.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openPerson(p.id)}
                        className={cn(
                          "h-8 rounded-full px-3 text-xs font-medium",
                          on ? "bg-ink text-surface" : "bg-cream text-muted",
                        )}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <p className="font-display text-3xl tabular-nums leading-none tracking-tight">
              {clock}
            </p>
          </div>
        </header>

        <main className="flex-1 px-5 pb-28">
          {recoverNote ? (
            <p className="mb-5 rounded-[20px] bg-cream px-4 py-3 text-sm text-ink text-pretty">
              {recoverNote}
            </p>
          ) : null}
          {tab === "today" ? (
            <div className="space-y-5">
              {staleRefresh ? (
                <RefreshCard busy={updating} onUpdate={() => void runUpdate()} />
              ) : null}
              <TodayPanel
                snap={snap}
                meds={mine}
                personName={person.name}
                personId={person.id}
                now={now}
                onTaken={takeById}
                onAdd={() => openCatalog(null)}
                onSimulate={() => void testAlarmNow()}
                onRecover={() => void runRecover()}
                onOpenPerson={openPerson}
              />
            </div>
          ) : null}
          {tab === "meds" ? (
            <MedsPanel
              meds={catalog}
              allMeds={snap.meds}
              people={snap.people}
              onAdd={() => openCatalog(null)}
              onEdit={(m) => openCatalog(m)}
              onOpenPerson={openPerson}
            />
          ) : null}
          {tab === "people" ? (
            <PeoplePanel
              snap={snap}
              viewId={viewPersonId}
              onViewId={setViewPersonId}
              onEditMed={openCopy}
            />
          ) : null}
          {tab === "settings" ? (
            <SettingsPanel snap={snap} onSeed={seedExamples} onPullOld={() => void runRecover()} />
          ) : null}
        </main>

        <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-line bg-paper/95 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-[2px]">
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                ["today", "Raspored", CalendarDays],
                ["meds", "Lijekovi", Pill],
                ["people", "Osobe", Users],
                ["settings", "Postavke", Settings],
              ] as const
            ).map(([id, label, Icon]) => {
              const on = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (id === "people" && tab === "people") setViewPersonId(null);
                    setTab(id);
                  }}
                  className={cn(
                    "flex h-12 flex-col items-center justify-center gap-0.5 rounded-[14px] text-[11px] font-medium",
                    on ? "bg-cream text-ink" : "text-muted",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.7} />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {editing !== undefined ? (
        <MedForm
          initial={editing}
          people={snap.people}
          personId={person.id}
          hideOwner={editMode === "catalog"}
          onClose={() => setEditing(undefined)}
          onSave={(med) => {
            if (editMode === "catalog") saveCatalogMed(editing, med);
            else upsertMed(med);
            setEditing(undefined);
            setTab(editMode === "copy" ? "people" : "today");
          }}
          onDelete={
            editing
              ? (id) => {
                  if (editMode === "catalog" && editing) removeCatalogMed(editing);
                  else removeMed(id);
                  setEditing(undefined);
                }
              : undefined
          }
        />
      ) : null}

      {pullOpen ? (
        <OldPullOverlay
          onDone={(r) => {
            setPullOpen(false);
            setRecoverNote(
              `Uvezen JSON: ${r.meds} lijekova · ${r.photos} slika · zaliha za ${r.withStock} · satnice za ${r.withTimes}.`,
            );
            setTab("meds");
          }}
          onClose={() => setPullOpen(false)}
        />
      ) : null}

      {snap.ringing ? (
        <AlarmOverlay
          dose={snap.ringing}
          now={now}
          onTaken={() => void resolveTaken(snap.ringing!)}
          onSnooze={(minutes) => void resolveSnooze(snap.ringing!, minutes)}
          onMissed={() => void resolveDismiss(snap.ringing!)}
        />
      ) : null}
    </div>
  );
}

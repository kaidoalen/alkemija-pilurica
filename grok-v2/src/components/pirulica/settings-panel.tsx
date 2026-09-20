import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CalendarPlus,
  Check,
  CloudDownload,
  Download,
  Lock,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Upload,
  Volume2,
} from "lucide-react";
import { HowTo } from "@/components/pirulica/how-to";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { unlockAudio } from "@/lib/pirulica/audio";
import { buildIcs, shareOrDownloadIcs } from "@/lib/pirulica/calendar";
import { testAlarmIn, testAlarmNow } from "@/lib/pirulica/engine";
import { nid } from "@/lib/pirulica/ids";
import {
  getHealth,
  isInstalled,
  requestNotificationPermission,
} from "@/lib/pirulica/notifications";
import {
  applyAppUpdate,
  currentPerson,
  exportPayload,
  importPayload,
  patchSettings,
  personMeds,
  removePerson,
  setCurrentPerson,
  type Snapshot,
  upsertPerson,
} from "@/lib/pirulica/store";
import { UPUTE } from "@/lib/pirulica/upute";
import { APP_VERSION } from "@/lib/pirulica/version";
import type { PushHealth } from "@/lib/pirulica/types";

function StatusRow({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span
        className={`mt-0.5 grid size-6 place-items-center rounded-full ${
          ok ? "bg-pine/12 text-pine" : "bg-clay/12 text-clay"
        }`}
      >
        {ok ? <Check className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
      </span>
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-muted text-pretty">{hint}</p>
      </div>
    </div>
  );
}

export function SettingsPanel({
  snap,
  onSeed,
  onPullOld,
}: {
  snap: Snapshot;
  onSeed: () => void;
  onPullOld: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [health, setHealth] = useState<PushHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [testLabel, setTestLabel] = useState<string | null>(null);
  const [newPerson, setNewPerson] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const person = currentPerson(snap);
  const mine = personMeds(snap);

  async function refresh() {
    setHealth(await getHealth());
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, []);

  const notifOk = health?.notification === "granted";
  const pushOk = Boolean(health?.push);
  const installed = health?.installed ?? isInstalled();

  async function enable() {
    setBusy(true);
    try {
      await unlockAudio();
      await requestNotificationPermission();
      const { subscribePush } = await import("@/lib/pirulica/push-client");
      await subscribePush();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    try {
      await unlockAudio();
      await testAlarmNow();
      setTestLabel("Zvoni sada. Ako ne čuješ — isključi tihi način.");
    } finally {
      setBusy(false);
    }
  }

  async function runTest(seconds: number) {
    setBusy(true);
    try {
      await testAlarmIn(seconds);
      setTestLabel(
        seconds <= 8
          ? "Zaključaj telefon. Alarm za 5 sekundi."
          : "Možeš zaključati. Alarm za 2 minute.",
      );
    } finally {
      setBusy(false);
    }
  }

  function addPerson() {
    const name = newPerson.trim();
    if (!name) return;
    const id = nid();
    upsertPerson({ id, name, createdAt: Date.now() });
    setCurrentPerson(id);
    setNewPerson("");
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pilurica-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
    setNote("JSON kopija je spremljena.");
  }

  async function onImport(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const result = await importPayload(parsed);
      setNote(
        result.ok
          ? "Kopija je uvezena — lijekovi i slike kutija."
          : result.error,
      );
    } catch {
      setNote("Datoteka nije valjani JSON.");
    }
  }

  async function writeCalendar() {
    const ics = buildIcs(mine);
    const how = await shareOrDownloadIcs(ics);
    setNote(
      how === "shared"
        ? "Otvori datoteku u kalendaru."
        : "Preuzeta je .ics datoteka — uvezi je u kalendar.",
    );
  }

  async function refreshApp() {
    setBusy(true);
    setNote("Spremam kopiju i učitavam verziju 2.0…");
    try {
      await applyAppUpdate();
    } catch {
      setBusy(false);
      setNote("Ažuriranje nije uspjelo. Zapisi ostaju.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl tracking-[-0.03em]">Postavke</h2>
        <p className="text-xs text-faint tabular-nums">v{APP_VERSION}</p>
      </div>

      <HowTo />

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-ink">Osobe</h3>
        <div className="flex flex-wrap gap-2">
          {snap.people.map((p) => {
            const on = p.id === person.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setCurrentPerson(p.id)}
                className={`h-11 rounded-full px-4 text-sm ${
                  on ? "bg-ink text-surface" : "bg-surface text-ink shadow-[var(--shadow-card)]"
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Input
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            placeholder="npr. Mama"
            autoComplete="off"
          />
          <Button type="button" variant="outline" onClick={addPerson}>
            Dodaj
          </Button>
        </div>
        {snap.people.length > 1 ? (
          <Button variant="danger" className="w-full" onClick={() => removePerson(person.id)}>
            Ukloni {person.name}
          </Button>
        ) : null}
      </section>

      <section className="rounded-[24px] bg-surface px-4 py-2 shadow-[var(--shadow-card)]">
        <StatusRow
          ok={notifOk}
          label="Obavijesti"
          hint={notifOk ? "Dozvoljene." : "Bez ovoga nema alarma."}
        />
        <div className="h-px bg-line" />
        <StatusRow
          ok={pushOk}
          label="Pozadina"
          hint={pushOk ? "Radi i kad je ekran ugašen." : "Uključi za noćne doze."}
        />
        <div className="h-px bg-line" />
        <StatusRow
          ok={installed}
          label="Početni zaslon"
          hint={installed ? "Pokreće se kao aplikacija." : UPUTE.install}
        />
      </section>

      {!notifOk || !pushOk ? (
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void enable()}>
          <Bell className="size-4" />
          {busy ? "Uključujem…" : "Uključi alarme"}
        </Button>
      ) : (
        <p className="rounded-[20px] bg-pine/10 px-4 py-3 text-sm text-pine">{UPUTE.alarm}</p>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-ink">Proba alarma</h3>
        <Button
          variant="clay"
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={() => void runNow()}
        >
          <Volume2 className="size-4" />
          Zvoni sada
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void runTest(5)}>
            <Volume2 className="size-4" />
            Za 5 s
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void runTest(120)}>
            <Lock className="size-4" />
            Za 2 min
          </Button>
        </div>
        {testLabel ? <p className="text-sm text-clay text-pretty">{testLabel}</p> : null}
      </section>

      <section className="space-y-1 rounded-[24px] bg-surface px-4 py-2 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Zvuk alarma</p>
            <p className="text-xs text-muted">Dok ne uzmete ili ne ugasite</p>
          </div>
          <Switch
            checked={snap.settings.soundEnabled}
            onCheckedChange={(v) => patchSettings({ soundEnabled: v })}
          />
        </div>
        <div className="h-px bg-line" />
        <div className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Vibracija</p>
          </div>
          <Switch
            checked={snap.settings.vibrateEnabled}
            onCheckedChange={(v) => patchSettings({ vibrateEnabled: v })}
          />
        </div>
        <div className="h-px bg-line" />
        <div className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Odgađanje</p>
          </div>
          <div className="flex gap-1">
            {([15, 30] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => patchSettings({ snoozeMinutes: n })}
                className={`h-9 min-w-9 rounded-full px-2 text-sm tabular-nums ${
                  snap.settings.snoozeMinutes === n ? "bg-ink text-surface" : "bg-cream text-ink"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-ink">Kalendar</h3>
        <Button variant="outline" className="w-full" onClick={() => void writeCalendar()}>
          <CalendarPlus className="size-4" />
          Upiši satnice u kalendar
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-ink">Kopija</h3>
        <Button variant="clay" className="w-full" disabled={busy} onClick={onPullOld}>
          <Smartphone className="size-4" />
          Preuzmi iz stare Pilurice
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={downloadJson}>
            <Download className="size-4" />
            Izvezi JSON
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" />
            Uvezi
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => void onImport(e.target.files?.[0])}
        />
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => void refreshApp()}
        >
          <RefreshCw className="size-4" />
          {busy ? "Ažuriram…" : "Ažuriraj"}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => void refreshApp()}
        >
          <CloudDownload className="size-4" />
          Preuzmi novu verziju
        </Button>
        <p className="text-xs text-muted text-pretty">
          Ažuriraj osvježi predmemoriju. Zapisi ostaju. Ne brišite podatke stranice.
        </p>
      </section>

      {note ? <p className="rounded-[16px] bg-cream px-4 py-3 text-sm text-ink">{note}</p> : null}

      {snap.meds.length === 0 ? (
        <Button variant="outline" className="w-full" onClick={onSeed}>
          Dodaj primjer terapije
        </Button>
      ) : null}

      <p className="pb-2 text-xs text-faint text-pretty">
        {UPUTE.disclaimer} Verzija {APP_VERSION}.
      </p>
    </div>
  );
}

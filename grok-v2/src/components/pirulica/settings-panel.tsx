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
import { unlockAudio } from "@/lib/pirulica/audio";
import { buildIcs, shareOrDownloadIcs } from "@/lib/pirulica/calendar";
import { testAlarmIn, testAlarmNow } from "@/lib/pirulica/engine";
import { nid } from "@/lib/pirulica/ids";
import {
  detectOem,
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
import { APP_VERSION } from "@/lib/pirulica/version";
import type { PushHealth } from "@/lib/pirulica/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const OEM_STEPS: Record<ReturnType<typeof detectOem>, { title: string; steps: string[] }> = {
  samsung: {
    title: "Samsung — ovo najčešće gasi alarm",
    steps: [
      "Postavke → Baterija → Pozadinska ograničenja → Nikad ne spavajuće aplikacije → dodaj Chrome (ili Piluricu ako je instalirana).",
      "Isključi „Stavi neiskorištene aplikacije na spavanje”.",
      "Obavijesti za Chrome/Piluricu: dozvoli, zvuk uključen, „Pop-up na zaključanom zaslonu”.",
    ],
  },
  xiaomi: {
    title: "Xiaomi / Redmi / POCO",
    steps: [
      "Dodijeli Autostart Chromeu ili Pilurici.",
      "Baterija → Bez ograničenja (ne štednja, ne uravnoteženo).",
      "Zaključaj aplikaciju u Recents da je MIUI ne ubije.",
    ],
  },
  huawei: {
    title: "Huawei / Honor",
    steps: [
      "Pokretanje aplikacije → ručno upravljanje → sve tri dozvole uključene.",
      "Baterija → Pokretanje aplikacije → Pilurica/Chrome bez ograničenja.",
    ],
  },
  oppo: {
    title: "OPPO / OnePlus / vivo / Realme",
    steps: [
      "Baterija → Isključi visoku štednju za Chrome/Piluricu.",
      "Uključi Autostart i dozvoli pokretanje u pozadini.",
    ],
  },
  other: {
    title: "Android — baterija i Doze",
    steps: [
      "Postavke → Aplikacije → Chrome (ili Pilurica) → Baterija → Bez ograničenja.",
      "Isključi štednju baterije dok računaš na noćne doze.",
      "Obavijesti: dozvoljene, zvuk uključen, ne u „tihi” kanal.",
    ],
  },
};

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
  const oem = detectOem();
  const guide = OEM_STEPS[oem];
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
      setTestLabel("Alarm zvoni sada. Ugasi ga s Uzmi ili Ugasi. Ako ništa ne čuješ — isključi tihi način i podigni zvuk.");
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
          ? "Zaključaj telefon sada. Alarm zvoni za 5 sekundi."
          : "Možeš zaključati telefon. Alarm ide za 2 minute — i iz pozadine.",
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
    setNote("JSON kopija je spremljena. Koristi je prije brisanja preglednika ili prijenosa.");
  }

  async function onImport(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const result = importPayload(parsed);
      setNote(result.ok ? "Kopija je uvezena. Osobe, lijekovi i zapisi su tu." : result.error);
    } catch {
      setNote("Datoteka nije valjani JSON.");
    }
  }

  async function writeCalendar() {
    const ics = buildIcs(mine);
    const how = await shareOrDownloadIcs(ics);
    setNote(
      how === "shared"
        ? "Otvori datoteku u Kalendaru ili Google Kalendaru da se satnice upišu."
        : "Preuzeta je .ics datoteka — uvezi je u kalendar mobitela ili Google Kalendar.",
    );
  }

  async function refreshApp() {
    setBusy(true);
    setNote("Spremam kopiju i učitavam verziju 2.0…");
    try {
      await applyAppUpdate();
    } catch {
      setBusy(false);
      setNote("Ažuriranje nije uspjelo. Pokušajte ponovo — zapisi ostaju.");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl tracking-[-0.03em]">Postavke</h2>
          <p className="text-xs text-faint tabular-nums">v{APP_VERSION}</p>
        </div>
        <p className="mt-1 text-sm text-muted text-pretty">
          Više osoba na istom telefonu. Alarm u pozadini nije pouzdan na svakom uređaju —
          ujutro držite aplikaciju otvorenom.
        </p>
      </div>

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
          label="Dozvola za obavijesti"
          hint={notifOk ? "Chrome smije prikazati alarm." : "Bez ovoga alarm ne postoji."}
        />
        <div className="h-px bg-line" />
        <StatusRow
          ok={pushOk}
          label="Pozadinski push"
          hint={
            pushOk
              ? "Poslužitelj budi telefon i kad je ekran ugašen."
              : "Uključi da se alarm ne izgubi u Doze načinu."
          }
        />
        <div className="h-px bg-line" />
        <StatusRow
          ok={installed}
          label="Na početnom zaslonu"
          hint={
            installed
              ? "Pokreće se kao aplikacija, ne kao kartica."
              : "Android: ⋮ → Instaliraj aplikaciju. iPhone: Safari → Dijeli → Dodaj na početni zaslon."
          }
        />
      </section>

      {!notifOk || !pushOk ? (
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void enable()}>
          <Bell className="size-4" />
          {busy ? "Uključujem…" : "Uključi sigurne alarme"}
        </Button>
      ) : (
        <p className="rounded-[20px] bg-pine/10 px-4 py-3 text-sm text-pine">
          Slojevi su aktivni: lokalni timer, service worker i visokoprioritetni push.
        </p>
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
        <p className="text-xs text-muted text-pretty">
          Moraš čuti piskanje i glas koji kaže „Vrijeme za piluricu”. Ako je telefon na
          tihom, uključi zvuk — web-alarm ne probija zvonce kao pravi sat.
        </p>
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

      <section className="rounded-[24px] bg-cream px-4 py-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
          <Smartphone className="size-4" />
          {guide.title}
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted text-pretty">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="space-y-1 rounded-[24px] bg-surface px-4 py-2 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Zvuk alarma</p>
            <p className="text-xs text-muted">Petlja dok ne uzmete ili ne ugasite</p>
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
            <p className="text-xs text-muted">Jači uzorak, kao pravi alarm</p>
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
            <p className="text-xs text-muted">Zadano iz obavijesti</p>
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
        <p className="text-xs text-muted text-pretty">
          Odobrenjem se satnice izvoze u .ics — otvori ih u Google Kalendaru ili kalendaru
          mobitela.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-ink">Kopija i ažuriranje</h3>
        <Button
          variant="clay"
          className="w-full"
          disabled={busy}
          onClick={onPullOld}
        >
          <Smartphone className="size-4" />
          Preuzmi iz stare Pilurice
        </Button>
        <p className="text-xs text-muted text-pretty">
          Otvara staru Piluricu na Postavkama. Tamo <strong>Izvezi JSON kopiju</strong>, pa ovdje
          odaberi tu datoteku — slike kutija, količine, satnice, ponavljanja i zalihe.
        </p>
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
          Ažuriraj sprema kopiju koju nova verzija sama pokupi — zapisi i slike ostaju.
          Ako ikona na početnom zaslonu i dalje otvara staru kopiju, pritisnite Preuzmi
          novu verziju. Svakih 15 dana program se treba osvježiti. Ne brišite podatke
          stranice.
        </p>
      </section>

      {note ? <p className="rounded-[16px] bg-cream px-4 py-3 text-sm text-ink">{note}</p> : null}

      {snap.meds.length === 0 ? (
        <Button variant="outline" className="w-full" onClick={onSeed}>
          Dodaj primjer terapije
        </Button>
      ) : null}

      <p className="pb-2 text-xs text-faint text-pretty">
        Ovo nije medicinski savjet. O lijekovima se savjetujte s liječnikom ili ljekarnikom.
        Web ne može koristiti Androidov AlarmManager — zato ujutro držite Piluricu otvorenom.
        Verzija {APP_VERSION}.
      </p>
    </div>
  );
}

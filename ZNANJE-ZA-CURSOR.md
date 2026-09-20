# Cijelo znanje — Pilurica 2.3 — za Cursor Hub

OBJAVI ODMAH https://alkemija.com/app/
Ne čekaj potvrdu. Ne iframeaj Grok. Ne crtaj novi program. Naziv SAMO **Pilurica**.

Hub: https://cursor.com/codebase/alen-duka/tmp-73f26e436c5fb419
Repo: https://github.com/kaidoalen/alkemija-pilurica
Kod: folder **`grok-v2/`** — preuzmi i spoji. IndexedDB ne diraj.

---

## Što je program

Podsjetnik za tablete. Jedan telefon, više osoba. Radi u pregledniku i kao PWA.
Jezik: hrvatski. Nije medicinski savjet.

Živo:
- program: https://alkemija.com/app/
- landing: https://alkemija.com/pilurica/  (otvara program, NE vraćaj „MOLIMO OTVORITI“)
- stari dump: https://alkemija.com/app/izvoz.html  **NE BRISATI**

Objava: build Hub projekta → `wp-content/plugins/pilurica/app/`
`izvoz.html` ostaje pored `index.html`. U `pilurica.php` je u no-cache uz `index.html`.

Stara Dexie baza: `lijekovi-podsjetnik` (isti origin). **Ne briši. Spoji, ne zamijeni.**

---

## Tabovi

1. **Raspored** — današnje doze, Uzmi, sljedeća doza, JSON uvoz, proba alarma
2. **Lijekovi** — katalog: jedan zapis po nazivu, ne kopije po osobi
3. **Osobe** — osobe + dodjela lijekova iz kataloga
4. **Postavke** — alarm, PWA, JSON izvoz/uvoz, kalendar ICS

Najava verzije (`UpdateNotice`) ide **odmah na početku**, prije rasporeda, dok se ne stisne U redu. Verzija: **2.3**. Ključ: `pilurica-seen-version`.

---

## Model lijekova i osoba

- `medKey(med) = name.trim().toLowerCase()` — **bez gramaže**. Gramažu ne traži, ne prikazuj kao obavezno polje. `dose` ostaje u tipu zbog starog JSON-a, ali UI je prazan.
- **Lijekovi** prikazuje `catalogMeds()` — jedinstveni nazivi. Na kartici: osobe i njihov broj komada (`Mama 14 kom · Ivo 8 kom`).
- **Osobe**: isti lijek može dobiti više osoba. `assignMedToPerson(medId, personId, stock)` radi **kopiju** s `stock` te osobe. Satnice i zaliha su **po osobi**. Naziv, slike, oblik, `tabletsPerDose`, rok se šire kroz `saveCatalogMed` — **stock se NE širi**.
- Kad osoba **napiše** broj komada (polje u Osobama), `setPersonStock` mijenja **samo nju**.
- **Uzmi** skida komade samo toj osobi (`markTaken` po `med.id`).
- Ako ostavi prazno, količina se ne prati.
- **Ne traži kutiju / packSize.** Samo komada + u jednoj dozi.

### Upozorenje zalihe

Redovna potrošnja: `tabletsPerDose * times.length * days.length / 7`.
Ako `stock / perDay <= 3` → `low`. Ako `stock <= 0` → `out`.
Banner na Rasporedu + notifikacija **jednom dnevno** (`showStockNotification`, tag `pilurica-stock-{id}-{datum}`).

### JSON uvoz (izvor istine)

Ako uvezeš JSON, imaš slike, doze (satnice), ostatak količine i satnice.
Nema usera „Alen“. Ime osobe uzmi iz JSON-a. **Izbaci „Ja“ ako nije definiran** (`dropUndefinedJa`).
Stari Dexie: `patients → people`, `medicines.clockTimes / remainingTablets / tabletsInBox / tabletsPerDose / timesPerDay / ean / expiresOn`, `photos` (sve, ne samo box), `doseLogs → logs`.
Gumb **Uvezi JSON kopiju** otvara `https://alkemija.com/app/izvoz.html` i sluša `postMessage` `pilurica-stara-kopija`. Fallback: ručni JSON (v1 i v2).

---

## Slike

- Kamera (`capture=environment`) i **Galerija** (`accept=image/*` multiple, bez capture).
- Sve vezane slike: kutija, blister, tableta (`photos[]` + `photo` prva).
- Prva slika predloži **samo naziv i oblik**. Gramažu skener ne traži.

---

## Alarm (ne smije preskočiti na Androidu)

Trostruko:
1. `setTimeout` u otvorenom tabu (`engine.ts`)
2. service worker iz IndexedDB rasporeda (`idb.ts` + `sw.js`)
3. web-push visoke hitnosti

Alarm **svira dok** Uzmi / 15 min / 30 min / Ugasi.
`requireInteraction: true`, vibrate. SW **ne cachea HTML**. `SKIP_WAITING`.
Proba: Web Audio + WAV + govor „Vrijeme za piluricu“. Mora se čuti.

Ako šuti: zvuk uključen, Chrome/Pilurica u bateriji bez ograničenja.

---

## Datoteke u grok-v2 (spoji ove)

```
src/lib/pirulica/
  engine.ts audio.ts store.ts idb.ts schedule.ts stock.ts
  notifications.ts scan.ts image.ts calendar.ts push-client.ts
  types.ts upute.ts version.ts ids.ts
src/components/pirulica/
  app.tsx alarm-overlay.tsx update-banner.tsx
  today-panel.tsx meds-panel.tsx people-panel.tsx
  med-form.tsx settings-panel.tsx old-pull-overlay.tsx
  how-to.tsx photo-strip.tsx capsule.tsx
public/sw.js
public/izvoz.html     — već uživo, ne zamijeni SPA fallbackom
public/upute.json
src/lib/upute.ts      — iste kratke upute u programu i na /pilurica/
```

Upute (`UPUTE`) su kratke. JSON uvoz NIJE korak u „Kako koristiti“.

---

## Pravila koja se ne smiju prekršiti

- Naziv SAMO Pilurica.
- Ne iframeaj Grok preview.
- Ne crtaj novi UI u WordPressu.
- Ne briši IndexedDB `lijekovi-podsjetnik`.
- Ne briši `/app/izvoz.html`.
- /pilurica/ otvara program — ne vraćaj stari landing.
- Zapisi ostaju pri ažuriranju.

Publish now. Screenshot desktop + mobitel nakon objave.

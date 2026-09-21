# Pilurica — sve odluke, od najstarijeg do najnovijeg

Jedno mjesto za sve chatove. Donja pravila vrijede. Ako se staro i novo sudare, **vrijedi najnovije**.

Hub: Cursor `alen-duka`. Repo: [kaidoalen/alkemija-pilurica](https://github.com/kaidoalen/alkemija-pilurica). Kod: `grok-v2/`.
Živo: https://alkemija.com/app/ i https://alkemija.com/pilurica/
Dump: https://alkemija.com/app/izvoz.html — **NE BRISATI**.
Stara Dexie: `lijekovi-podsjetnik`. IndexedDB ne diraj. Spoji, ne zamijeni.
Naziv SAMO **Pilurica**. Ne iframeaj Grok. Ne crtaj novi UI.

Verzija u kodu: **2.5**. Ključ: `pilurica-seen-version`.
Prvi zaslon = **Raspored**. Osoba **Ja** već postoji.

---

## Što je program (ne mijenja se)

Podsjetnik za tablete za odrasle. Jedan telefon, više osoba. PWA, hrvatski.
Nije medicinski savjet.

Tabovi: **Raspored · Lijekovi · Osobe · Postavke**.

Jedan lijek može koristiti više osoba. Satnica i zaliha su **po osobi**.
Isti naziv lijeka uz jednu osobu **samo jednom** (`dedupePersonMeds`).
Gramažu **ne traži**. `dose` ostaje zbog starog JSON-a.

JSON uvoz: slike, satnice, ostatak količine. Ime osobe iz JSON-a.
**Nema lijeka Alen.** Alen je osoba. `medicineNameOf` + `dropPersonNamedMeds`.
**Izbaci Ja** ako JSON definira prave osobe (`dropUndefinedJa`).

PostMessage: `{ type: "pilurica-stara-kopija", payload }`.
Gumb **Uvezi JSON kopiju** nestaje čim ima lijekova (`snap.meds.length > 0`).

---

## Kronologija rješenja (staro → novo)

### 1. Uvoz, slike, osobe

- Povući **sve** vezane slike lijeka (kutija, blister, tableta), ne samo prvu.
- Tab **Osobe**. Lijekovi se dodjeljuju iz taba **Lijekovi** (katalog).
- Galerija + kamera, više slika.
- xAI vision čita kutiju (`readBoxLabel`) — samo naziv i oblik.
- Najava ažuriranja na početku (kasnije **skinuta** s punog ekrana — vidi 11).
- Jedan lijek, dvije osobe: svaka piše **svoje** komade. Alarm zalihe 3 dana prije (`stock / perDay <= 3`).
- Ako ostavi prazno, količina se ne prati. Ne traži kutiju / packSize.

### 2. Penzioner unosi lijek

Tri koraka: naziv ili slika → kako uzima → kad da zvoni.
Veliki gumbi, sticky **Spremi postavke**.
Stisni ime osobe → njezini lijekovi. Stisni lijek → uredi tu kopiju.
Ime osobe je **uvijek link** na njezine postavke.

### 3. Alarm mora zvoniiti

Eskalacija: 2 zvona → odgoda 15 min → 3 → 15 min → 4…
Trostruko: `setTimeout` + SW IndexedDB + web-push.
Radi **zaključan**, **tihi način** (mediji, ne zvono), **sleep** (keep-alive + Media Session).
Obavijest na lock screen + badge na ikoni.
`requireInteraction: true`. SW ne cachea HTML.
Kad se program **otvori**, ne sviraj odmah — dovoljno Uzmi / Odgodi.

### 4. Satnica, ne unaprijed

Vremena poredana po satu (`sortTimes`).
Alarm **točno** u satnici ili odgodi. Nema ranijih alarma.
Lijek se **ne uzima unaprijed** (`canTakeDose`: `at <= now`).
Broj uzimanja dijeli dan: prvo i zadnje **istog dana**, default 08:00–20:00.

- 2× → 08:00, 20:00
- 3× → 08:00, 14:00, 20:00
- 4× → 08:00, 12:00, 16:00, 20:00

Sat se može pomaknuti ručno (`shiftHour`). Nema noćne tablete u 2 ujutro.

### 5. Odrasla logika razmaka

Isti lijek: sljedeća tableta **najmanje 3 sata** nakon prethodne (`MIN_GAP_MS`).
Sljedeća najkasnije u okviru dana / 24 h od prethodne — **ne izmišljaj** dodatne doze.
Prazni `days` = svaki dan (`medDays` → `[0..6]`), da sljedeća nije „za 71 h“.
`dueUnacked`: za svaki lijek **samo trenutna** satnica (20:00, ne 08:00 u 22:00).

### 6. Uzmi / Uzeto / odklik

**Uzeto** se zapisuje **samo** kad se stisne **Uzmi**.
Zadnja 4 uzimanja (osobe: **Povijest uzimanja**, do 30).
Zadnje se može odkliknuti → odmah **Uzmi sada** (stock se vraća, `unmarkTaken`).
Lista uzetih: **najnovije gore**.

### 7. Promjena satnice

Staro: skini Uzeto sa starog termina.
**Novo (vrijedi):** već uzeta ostaju u povijesti. Novi termini se **prilagode**:
koliko je danas uzeto, toliko je potrošeno od novog broja.
Ostali termini ravnomjerno do večeri, ≥ 3 h nakon zadnje tablete.
Stari sat koji više nije u rasporedu ostaje u povijesti, ne kao novi alarm.
Odgode starog termina se brišu.

### 8. Raspored — što se vidi

Na Rasporedu:
- što još treba uzeti (po satu)
- za **svaki lijek** samo **zadnja 3 uzimanja u zadnjih 24 sata**, najnovije gore

Starija uzimanja su u **Povijest uzimanja** kod osobe.
Najnovije Uzeto na Rasporedu se još može odkliknuti.

Kad JSON već uvezen: nema kartice **Preuzmi / Uvezi** na naslovu.
**Simuliraj alarm** je na dnu, mali. Zvuk: nježna melodija (music-box), ne beep.

### 9. Ekran se ne smije ugasiti

Ne blokiraj Raspored punim ekranom (`UpdateNotice` / crni alarm).
`hydrated` ne smije ostaviti prazan kružić. SSR odmah crta Raspored.
Ako hydrate padne, i dalje pokaži program.
Alarm kad je program otvoren: **kartica** Uzmi / 15 / 30, **ne crni sloj** preko svega.

### 10. JSON Alen

Nema lijeka imenom osobe. Čisti se pri spremanju (`dropPersonNamedMeds`).

---

## Što sada vrijedi (sažetak za Hub)

| Tema | Pravilo |
|---|---|
| Tabovi | Raspored, Lijekovi, Osobe, Postavke |
| Katalog | jedan naziv, kopije po osobi za stock/satnicu |
| Gramaža | ne traži |
| JSON | slike + satnice + zaliha; Alen = osoba; Ja samo ako nema drugih |
| Uzmi | piše Uzeto, skida stock toj osobi |
| Odklik | vraća stock i Uzmi sada |
| Satnica | 08–20 ravnomjerno, ručno pomicanje sata, sort po satu |
| Razmak | min 3 h istog lijeka; ne uzimaj unaprijed |
| Raspored | ostalo + zadnja 3 uzimanja / lijek / 24 h |
| Osobe | lijekovi osobe + Povijest uzimanja |
| Alarm | mediji, lock, sleep, push, SW; na otvorenom programu kartica, ne crni overlay |
| Zaliha | upozori 3 dana prije, po osobi |
| Update | banner, ne full-screen; zapisi ostaju |

---

## Datoteke (spoji iz grok-v2/)

```
src/lib/pirulica/
  engine.ts audio.ts store.ts idb.ts schedule.ts stock.ts
  notifications.ts scan.ts image.ts calendar.ts push-client.ts
  types.ts upute.ts version.ts ids.ts logic.test.ts
src/components/pirulica/
  app.tsx alarm-overlay.tsx update-banner.tsx last-takes.tsx
  today-panel.tsx meds-panel.tsx people-panel.tsx
  med-form.tsx settings-panel.tsx old-pull-overlay.tsx
  how-to.tsx photo-strip.tsx capsule.tsx lock-arm.tsx
public/sw.js
public/izvoz.html
public/upute.json
```

Testovi: `src/lib/pirulica/logic.test.ts` — raspored, 3 h, Uzeto, 08–20, zadnja 3 u 24 h.

---

## Pravila koja se ne smiju prekršiti

- Naziv SAMO Pilurica.
- Ne iframeaj Grok preview.
- Ne crtaj novi UI u WordPressu.
- Ne briši IndexedDB `lijekovi-podsjetnik`.
- Ne briši `/app/izvoz.html`.
- /pilurica/ otvara program.
- Zapisi ostaju pri ažuriranju.
- Ne prekrivaj Raspored punim ekranom.

Publish now na https://alkemija.com/app/ i https://alkemija.com/pilurica/

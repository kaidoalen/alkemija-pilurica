# OBJAVI ODMAH — Pilurica 2.1

Ne čekaj potvrdu. Publish now.

Kod je **u Cursor Hubu**, ne u Groku:
- Hub: https://cursor.com/codebase/alen-duka/tmp-73f26e436c5fb419
- Agent: https://cursor.com/agents/bc-5df97b1b-c46e-4b45-80ea-c7e1bee59d88
- Živi program: https://alkemija.com/app/
- Landing: https://alkemija.com/pilurica/  (već šalje na /app/)

Grok je napravio v2 jer **Android često preskoči alarm** i jer treba **preuzeti podatke iz stare baze**. Ugradi to u **ovaj** Cursor projekt. Ne crtaj novi program. Ne iframeaj Grok. Naziv SAMO **Pilurica**.

## Uzmi sav izvor

Folder **`grok-v2/`** je cijeli Grok v2. Preuzmi ga i spoji u Hub.

```
grok-v2/src/lib/pirulica/     engine, audio, store (uvoz stare baze), idb, schedule, stock, push
grok-v2/src/components/pirulica/  app, alarm-overlay, old-pull-overlay, today, settings, med-form
grok-v2/public/izvoz.html     dump IndexedDB lijekovi-podsjetnik
grok-v2/public/sw.js          SKIP_WAITING, ne cacheaj HTML
```

Mapiranje na stari program (Dexie `lijekovi-podsjetnik`):
- patients → people
- medicines.clockTimes / remainingTablets / tabletsInBox / tabletsPerDose / timesPerDay / ean / expiresOn
- photos (kind=box, slot=0) → photo kutije
- doseLogs → logs
- **Ne brisati IndexedDB.** Spoji, ne zamijeni.

## Mora (v2.1)

1. **Uvezi JSON kopiju** — u JSON-u su slike kutija, doze, preostala količina i satnice. Nema korisničkog računa / nema usera Alen.
2. Kratke upute (5 koraka + Otvori program) u Postavkama i na https://alkemija.com/pilurica/. Ne vraćaj MOLIMO landing, ne radi samo redirect.
3. Ne briši IndexedDB `lijekovi-podsjetnik`.
4. Ne briši https://alkemija.com/app/izvoz.html
5. Naziv SAMO Pilurica. Ne iframeaj Grok.

## Mora (v2)

1. Alarm zvoni dok se ne pritisne **Uzmi** / **15 min** / **30 min** / **Ugasi**.
2. Trostruko buđenje: `setTimeout` u otvorenom tabu + service worker iz IndexedDB + web-push. `requireInteraction: true`, vibrate. SW **ne** cachea HTML.
3. Proba alarma: odmah, glasno (Web Audio + WAV + govor „Vrijeme za piluricu“).
4. Fotka kutije predloži naziv i gramažu.
5. Zaliha pada na Uzmi. Upozorenje ispod 3 dana i na rok.
6. Više osoba na jednom mobitelu.
7. Ažuriraj JSON. Kalendar ICS. PWA na isti link.
8. Gumb **Preuzmi iz stare Pilurice** otvara `https://alkemija.com/app/izvoz.html` i sluša `postMessage` tipa `pilurica-stara-kopija`. Ako ne stigne, JSON uvoz (verzija 1).

## Već uživo — NE DIRATI

- `https://alkemija.com/app/izvoz.html` — pravi dump. Datoteka je u pluginu `pilurica/app/izvoz.html`. **Ne zamjenjuj SPA fallbackom. Ne briši.**
- U `pilurica.php` je `izvoz.html` u no-cache uz `index.html`. Ostavi.
- https://alkemija.com/pilurica/ više nije landing „MOLIMO OTVORITI NA MOBITELU“ — otvara program. Ne vraćaj landing.
- IndexedDB `lijekovi-podsjetnik` se **ne briše**.

## Objava

Isti link: https://alkemija.com/app/
Build Hub projekta, kopiraj u `wp-content/plugins/pilurica/app/` (tako se servira /app/).
`izvoz.html` ostaje pored `index.html`.
Publish now. Screenshot desktop + mobitel nakon objave.

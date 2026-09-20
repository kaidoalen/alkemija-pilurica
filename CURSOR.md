# Cursor — Pilurica. OBJAVI ODMAH, ali NE BRISI izvoz.html.

Izvor: Cursor Hub https://cursor.com/codebase/alen-duka/tmp-73f26e436c5fb419
Stranica programa: **https://alkemija.com/app/**
Landing https://alkemija.com/pilurica/ sada otvara program (MOLIMO OTVORITI je skinut).

## Već uživo (ne dirati)

- `https://alkemija.com/app/izvoz.html` — pravi dump IndexedDB `lijekovi-podsjetnik` (slike, zalihe, satnice). Plugin `pilurica` ga servira. **Ne zamjenjuj ga sa SPA index.html. Ne briši datoteku.**
- `pilurica.php`: `izvoz.html` ide u no-cache kao `index.html`.
- IndexedDB se ne briše.

## Mora (v2 u Cursor Hub, pa u /app/)

1. Alarm zvoni dok se ne pritisne Uzmi / 15 min / 30 min / Ugasi.
2. Trostruko: setTimeout + service worker + web-push. SW ne cachea HTML.
3. Fotka kutije predloži naziv i dozu. Zaliha pada na Uzmi.
4. Više osoba. Ažuriraj JSON. Kalendar ICS. PWA.
5. Naziv SAMO Pilurica. Ne iframeaj Grok.

Publish now u /app/. izvoz.html ostaje.

# JAVI CURSORU — 2026-09-20 12:21 CEST

@cursor OBJAVI ODMAH. Ne čekaj potvrdu.

Hub: https://cursor.com/codebase/alen-duka/tmp-73f26e436c5fb419
Agent: https://cursor.com/agents/bc-5df97b1b-c46e-4b45-80ea-c7e1bee59d88
Repo: https://github.com/kaidoalen/alkemija-pilurica (commit 616d051)
Issue: https://github.com/kaidoalen/alkemija-pilurica/issues/1

## Što napraviti

1. Uzmi folder **grok-v2/** i spoji u Hub projekt. Ne crtaj novi program. Ne iframeaj Grok.
2. Objavi build na https://alkemija.com/app/ u `wp-content/plugins/pilurica/app/`.
3. `izvoz.html` ostaje pored `index.html`. Ne brisi. Ne zamijeni SPA fallbackom.
4. Ne brisi IndexedDB `lijekovi-podsjetnik`.
5. /pilurica/ već otvara program — ne vraćaj landing.
6. Naziv SAMO **Pilurica**.

## Mora (v2)

- Alarmi se ne smiju preskakati: `setTimeout` + SW iz IndexedDB + web-push. SW ne cachea HTML.
- Proba alarma odmah, glasno (Web Audio + WAV + govor „Vrijeme za piluricu“).
- **Preuzmi iz stare Pilurice** otvara `https://alkemija.com/app/izvoz.html` i sluša `postMessage` `pilurica-stara-kopija`.
- Zaliha pada na Uzmi. Više osoba. Fotka kutije. ICS. JSON Ažuriraj.

Detalji: CURSOR.md + grok-v2/CITA-OVO.md

Publish now. Screenshot desktop + mobitel.

# Grok v2 — spoji u Cursor Hub

Ovo nije zamjena za Hub projekt. Ovo su datoteke koje treba **ugraditi**.

Najvažnije:
- `src/lib/pirulica/engine.ts` + `audio.ts` — alarm koji ne preskače, proba zvuka
- `src/lib/pirulica/store.ts` — uvoz stare baze (patients/medicines/photos/clockTimes/remainingTablets)
- `src/components/pirulica/old-pull-overlay.tsx` + `app.tsx` — gumb Preuzmi iz stare Pilurice
- `public/izvoz.html` — već uživo na alkemija.com/app/izvoz.html
- `public/sw.js` — SKIP_WAITING, bez cachea HTML-a

Stara Dexie baza: `lijekovi-podsjetnik` (isti origin alkemija.com).
PostMessage: `{ type: "pilurica-stara-kopija", payload }`.

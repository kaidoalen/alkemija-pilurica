# Grok v2.3 — spoji u Cursor Hub

Ovo nije zamjena za Hub. Ovo su datoteke koje treba **ugraditi**.
Cijelo znanje: ../ZNANJE-ZA-CURSOR.md

Verzija 2.3:
- Tabovi Raspored / Lijekovi (katalog) / Osobe / Postavke
- Isti lijek više osoba, stock po osobi, setPersonStock, assignMedToPerson(..., stock)
- Upozorenje + notifikacija 3 dana prije nestanka (stock.ts + engine.checkStockAlerts)
- Kamera + galerija (med-form.tsx)
- Bez gramaže u UI i skeneru
- UpdateNotice odmah na startu (update-banner.tsx, version 2.3)
- JSON uvoz + dropUndefinedJa (store.ts)
- Alarm: engine.ts + audio.ts + sw.js

Stara Dexie: `lijekovi-podsjetnik`. PostMessage: `{ type: "pilurica-stara-kopija", payload }`.
izvoz.html već uživo — ne zamijeni SPA fallbackom.

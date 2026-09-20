# Grok v2.4 — spoji u Cursor Hub i OBJAVI ODMAH

Ovo nije zamjena za Hub. Ovo su datoteke koje treba **ugraditi**.
Cijelo znanje: ZNANJE-ZA-CURSOR.md

Verzija **2.4**:
- Alarm na MEDIJIMA — svira u tihom načinu i u sleepu (audio.ts keep-alive + Media Session)
- Obavijest na zaključanom zaslonu + broj na ikoni (setAppBadge)
- Zvoni 2×, ponavlja svakih 20 s; odgoda 15 min → 3, pa 4 zvona
- Push retry 0–60 min; cron ne gubi alarm na 5xx
- LockArm: Uključi alarm na zaključanom
- Isti naziv lijeka samo jednom uz jednu osobu (dedupePersonMeds)
- UpdateNotice odmah na startu (version 2.4)

Stara Dexie: `lijekovi-podsjetnik`. PostMessage: `{ type: "pilurica-stara-kopija", payload }`.
izvoz.html već uživo — ne zamijeni SPA fallbackom.
Prvi zaslon = Raspored. Ja već postoji. IndexedDB ne diraj.
Publish now na https://alkemija.com/app/ i https://alkemija.com/pilurica/

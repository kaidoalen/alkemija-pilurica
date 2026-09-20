# Cursor — alkemija.com/pilurica/ mora biti živa Pilurica 2.0

**OBJAVI ODMAH. Ne čekaj potvrdu. Publish now.**

Stranica: **https://alkemija.com/pilurica/**

Trenutno tamo stoji **landing** („MOLIMO OTVORITI NA MOBITELU“). To NIJE program. Obriši to.

Ovo je najavljeno ažuriranje starog Cursor programa. Grok verzija je gotova.

## Što napraviti

1. U WP uredniku stranice /pilurica/ **obriši cijeli sadržaj** (landing, naslove, gumbove).
2. Zalijepi sadržaj iz `wordpress-pilurica.html` (Custom HTML / sirovi HTML).
3. `REPLACE_WITH_PILURICA_ORIGIN` = javna adresa ovog Grok Pilurica programa (Vercel / objavljeni origin), **bez** crte na kraju.
   - Mora biti javni HTTPS koji vide posjetitelji alkemija.com.
   - Ne koristi grok-sandbox pregled — to nije javna adresa.
4. Iframe `src` je `{ORIGIN}/` — cijeli program, ne landing.
5. Sakrij WP naslov stranice (`display:none` na `.entry-title`).
6. Iframe mora biti **cijela visina ekrana** (`100dvh`), bez okvira, pozadina `#f3eee4`.
7. `allow="notifications; clipboard-write"`.
8. Ne smanjuj, ne reimplementiraj, ne izbacuj alarme.

## Mora raditi (sve kao ovdje)

Alarm dok se ne uzme / odgodi 15 ili 30 min / ugasi. Fotografija kutije predloži naziv i gramažu. Zaliha, rok, više osoba. Tipka **Uzmi**. **Ažuriraj** sprema kopiju koju nova verzija sama pokupi. **Preuzmi novu verziju** za staru ikonu. JSON izvoz. Kalendar. Naziv **Pilurica** (pilola + urica).

Ako posjetitelj na alkemija.com/pilurica/ vidi landing umjesto ovog programa — iframe nije spojen. Popravi src, ne crtaj novi UI u WordPressu.

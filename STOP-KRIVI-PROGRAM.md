# STOP — na mobitelu je KRIVI program

Ne čekaj potvrdu. Ne crtaj novi UI.

Živi https://alkemija.com/app/ sada pokazuje **tvoj novi prazan program 2.0.11**:
- prvi zaslon je Osobe, „Nema osoba. Dodajte prvo ime“
- Lijekovi: „Prvo dodajte osobu“
- JS greške: Invalid or unexpected token, innerHTML null
- /wp-json/pilurica/v1/wakes → 400
- nema upisa u 3 koraka (koji lijek / kako uzimate / kad podsjetnik)

To NIJE grok-v2. Penzioner ne može ući. Stari zapisi moraju ostati.

## Što uraditi

1. **Nemoj crtati novi program.** Uzmi folder `grok-v2/` s ovog repoa i SPOJI.
2. Prvi zaslon je **Raspored**, ne Osobe. Osoba „Ja“ već postoji — ne traži ime na startu.
3. IndexedDB `lijekovi-podsjetnik` ne diraj.
4. `izvoz.html` ne briši.
5. /pilurica/ neka vodi na /app/ (Otvori program je OK; ne vraćaj MOLIMO kao jedini sadržaj).
6. Objavi isti link https://alkemija.com/app/

Grok v2 upis (penzioner):
1. Koji lijek (slika ili naziv)
2. Kako uzimate (1/2/3 tablete, koliko komada)
3. Kad da vas podsjetim (Ujutro / Podne / Popodne / Navečer)
Spremi i podsjeti me → odmah Raspored s Uzmi.

Publish now. Screenshot mobitel: Raspored, ne prazne Osobe.

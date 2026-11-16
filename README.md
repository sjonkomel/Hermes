# Hermes

Private web-app (PWA) om kosten en verbruik per voertuig bij te houden:
meerdere voertuigen (auto, motor), brandstof én elektrisch laden (PHEV
ondersteunt beide door elkaar), terugkerende kosten met bedragsperiodes,
afschrijving als maandreserve, onderhoudsreserve-tracker, verbruiksgrafieken
over tijd, en een volledige verkoop-afsluiting met definitieve kosten per km.
Opvolger van de AppSheet "Autokosten"-app.

Het draaiende versienummer staat rechtsonder in de footer (uit `package.json`,
via `__APP_VERSION__`); daarmee controleer je welke versie je browser serveert
krijgt na een deploy.

## Stack

- **Front-end**: React 18 + TypeScript + Vite + Tailwind CSS, Recharts, PWA
- **Backend**: Supabase (Postgres + Auth + Row Level Security), regio Frankfurt
- **Deploy**: GitHub Actions → Bunny.net storage zone → CDN (zelfde patroon als
  de UNSMIS-tracker)

## Quickstart

```bash
cp .env.example .env     # vul VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in
npm install
npm run dev              # development server
npm run typecheck        # strict TypeScript check
npm run build            # productie-build naar dist/
```

## Supabase instellen (eenmalig)

1. Maak een project in Supabase, regio **Frankfurt (eu-central-1)**.
2. Voer `supabase/schema.sql` uit in de SQL Editor (tabellen + RLS-beleid).
3. Maak je gebruiker aan: Authentication → Users → *Add user* (e-mail +
   wachtwoord). Schakel **sign-ups uit** (Authentication → Providers → Email →
   Allow new users to sign up = off) zodat alleen jij toegang hebt.
4. Kopieer Settings → API → Project URL en `anon` key naar `.env`.

## Historie importeren (Google Sheets)

**Auto** (Sheet "Autokosten", tabblad Formulierreacties 1):

```bash
# 1. Exporteer het tabblad als CSV:
#    https://docs.google.com/spreadsheets/d/<sheet-id>/gviz/tq?tqx=out:csv&sheet=Formulierreacties%201
# 2. Genereer het migratiebestand:
npm run migrate:sheet -- sheet-export.csv
# 3. App: Instellingen → Historie importeren → scripts/migration.json
```

**Motor** (eigen eenvoudige sheet: alleen tankbeurten):

```bash
# 1. Exporteer de sheet als CSV (gviz/tq?tqx=out:csv)
# 2. node scripts/migrate-motor.mjs motor-sheet-export.csv
# 3. App: Instellingen → Historie importeren → scripts/migration-motor.json
```

Beide imports zijn op 16-11-2026 gevalideerd. Auto: 403 records, totaal
€40.858,72, gem. €504/maand (81 mnd), €0,558/km incl. afschrijvingsreserve
(€0,315 excl.), 4,56 l/100km, 904 km/maand. Motor: 107 tankbeurten, €2.911,76,
30.142 km, 4,46 l/100km. De cijfers uit de oude AppSheet-app (€480,69/maand,
€0,40/km, restwaarde €5.500) waren momentopnames van eerder in 2025.

## Gegevensmodel

- `vehicles` — met aankoopdatum/-bedrag, start-km, maandreserve-afschrijving,
  verkoopdatum/-prijs. Verkoop sluit het voertuig af; historie blijft.
- `fillups` / `charges` — brandstof en laadsessies, met contextvlaggen
  (bandenseizoen, aanhanger, dakkoffer) voor verbruik-per-categorie.
- `expenses` — losse kostenposten (onderhoud, bandenwissel, APK, …).
- `odometer_readings` — km-metingen voor km/maand-trends.
- `recurring_costs` — terugkerende kosten als periodes: een bedragswijziging
  sluit de oude periode en opent een nieuwe (vervangt het oude Apps Script dat
  op de 1e van de maanden kosten aanmaakte).

Alle statistieken (kosten/maand, verbruik, €/km, restwaarde, kostenverdeling)
worden live berekend; er worden geen afgeleide waarden opgeslagen.

## Deploy (Bunny.net)

Automatisch bij push naar `main` (`.github/workflows/deploy.yml`): build →
storage zone leegen → `dist/` uploaden → CDN-cache purgegen. Repository
secrets (Settings → Secrets and variables → Actions):

- `BUNNY_STORAGE_KEY` — storage zone wachtwoord (Bunny → Storage → Access)
- `BUNNY_API_KEY` — account API-key (Bunny → account settings → API Keys)
- `BUNNY_PULLZONE_ID` — numeriek pull zone ID (Bunny → CDN)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — uit het Supabase-dashboard

Zet in de pull zone de custom error/response regel: 404 → `/index.html`
(SPA-routing).

**Caching-afspraken ( geleerd op 16-11-2026):**

- Zet de pull zone Cache Expiration op **Override: 3 days** (vangnet), zodat
  een falende purge de site nooit langer dan 3 dagen oud houdt.
- De purge in de workflow logt een sha256-vingerafdruk van de gebruikte key,
  de zone-ID en de HTTP-status; een purge-fout is niet-fataal (geel, niet rood).
- Handmatig purgen in het Bunny-dashboard: kies **Purge All** bij de juiste
  pull zone (hostname `hermes81.b-cdn.net`), vul géén URL/tag in.
- De app is een PWA: bij rare oude versies eerst de service worker resetten
  (F12 → Application → Service Workers → Unregister + Clear site data). Het
  footer-versienummer is de snelste controle of de nieuwste versie draait.

## Roadmap

- Purge-401 in de workflow oplossen (key-sha256 in deploy-log vergelijken met
  lokaal `printf '%s' "KEY" | sha256sum`)
- Motor aanvullen: aanschafgegevens via Voertuigen → Wijzig…, en nieuwe
  terugkerende periodes (afschrijving, wegenbelasting) met ingangsdatum
- Foto-invoer met cijfer-OCR (kilometerstand/pomp) voor snelle invoer
- Dexie-offlinecache met sync-wachtrij voor invoer zonder bereik
- Export/rapportages (XLSX/PDF)

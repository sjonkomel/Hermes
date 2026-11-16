# Hermes

Private web-app (PWA) om kosten en verbruik per voertuig bij te houden:
meerdere voertuigen (auto, motor), brandstof én elektrisch laden, terugkerende
kosten met bedragsperiodes, afschrijving als maandreserve, en een volledige
verkoop-afsluiting met definitieve kosten per km. Opvolger van de AppSheet
"Autokosten"-app.

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

## Historie importeren (Google Sheet)

```bash
# 1. Exporteer het "Formulierreacties 1"-tabblad als CSV:
#    https://docs.google.com/spreadsheets/d/<sheet-id>/gviz/tq?tqx=out:csv&sheet=Formulierreacties%201
# 2. Genereer het migratiebestand:
npm run migrate:sheet -- sheet-export.csv
# 3. App: Instellingen → Historie importeren → scripts/migration.json
```

Het script drukt een validatie-samenvatting af (aantallen, sommen per
categorie, km-bereik). Controleer na de import het dashboard tegen de oude
AppSheet-cijfers: gem. €480,69/maand, €0,40/km, 21,95 l/100km, 924 km/maand.

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

## Roadmap

- Foto-invoer met cijfer-OCR (kilometerstand/pomp) voor snelle invoer
- Dexie-offlinecache met sync-wachtrij voor invoer zonder bereik
- Export/rapportages (XLSX/PDF)

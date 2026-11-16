# Changelog

Alle opvallende wijzigingen aan dit project worden in dit bestand gedocumenteerd.
Indeling volgt [Keep a Changelog](https://keepachangelog.com/), versie volgt
[SemVer](https://semver.org/).

## [0.2.2] — 2026-11-16

### Added

- PWA-iconen: `scripts/gen-icons.mjs` genereert de PNG's (192, 512, maskable
  en apple-touch) bij prebuild/predev, puur Node zonder dependencies.
- Manifest uitgebreid met iconen en `lang: "nl"`; apple-touch-icon in
  `index.html`. Hiermee is de app nu echt installeerbaar op Android/iOS.

## [0.2.1] — 2026-11-16

### Added

- Motormigratie: `scripts/migrate-motor.mjs` + `scripts/migration-motor.json`
  (107 tankbeurten, juli 2023 t/m november 2026, €2.911,76, 4,46 l/100km).
- Grafieken (verbruikshistorie + energiekosten/km) staan boven de tabel op
  Tanken & laden.
- Purge-stap met diagnose in het deploy-log (sha256-vingerafdruk key, zone,
  HTTP-status); purge-fouten zijn niet-fataal (continue-on-error).

## [0.2.0] — 2026-11-16

### Added

- Versienummer in de footer (uit `package.json`, via `__APP_VERSION__`).

## [0.1.0] — 2026-11-16

### Added

- Eerste versie: multi-voertuig kosten- en verbruikregistratie (React + TS +
  Vite + Tailwind, PWA).
- Supabase-backend (Frankfurt) met Auth en Row Level Security.
- Brandstof- én laadregistraties met contextvlaggen (bandenseizoen,
  aanhanger, dakkoffer).
- Terugkerende kosten als periodes met ingangsdatum (wegenbelasting,
  verzekering, afschrijvingsreserve), inclusief bedragswijzigingen.
- Dashboard met kosten/maand per categorie, kostenverdeling, brandstofprijs-
  trend, verbruik per volle tank en restwaarde volgens maandreserve.
- Voertuigverkoop: afsluiting met definitieve afschrijving en €/km; historie
  blijft beschikbaar.
- Migratiescript Google Sheet → app (`npm run migrate:sheet`).
- CI + deploy naar Bunny.net via GitHub Actions.

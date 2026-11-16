# Changelog

Alle opvallende wijzigingen aan dit project worden in dit bestand gedocumenteerd.
Indeling volgt [Keep a Changelog](https://keepachangelog.com/), versie volgt
[SemVer](https://semver.org/).

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

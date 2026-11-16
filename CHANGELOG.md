# Changelog

Alle opvallende wijzigingen aan dit project worden in dit bestand gedocumenteerd.
Indeling volgt [Keep a Changelog](https://keepachangelog.com/), versie volgt
[SemVer](https://semver.org/).

## [1.0.2] — 2026-11-16

### Changed

- Dubbele OCR-pass per foto (Otsu-gebinariseerd + grijscontrast); beide
  resultaten worden geparseerd en samengevoegd: de pass met de beste
  kruiscontrole (liters x prijs = bedrag) wint, ontbrekende velden worden
  aangevuld uit de andere pass.
- 2-decimalen-bedragen op een "Prijs"-regel worden niet meer als totaal
  genomen; een prijs-regel zonder 3 decimalen geldt nu ook als prijs.
- Bij een onvolledig resultaat toont de scan de ruwe OCR-tekst, zodat
  mislezingen zichtbaar en rapporteerbaar zijn.

## [1.0.1] — 2026-11-16

### Changed

- Pompdisplay-verbeteringen: label-gebaseerde parsing (Bedrag € / Liters /
  Prijs €), kruiscontrole liters x prijs = bedrag en afleiding van een
  ontbrekende waarde. Otsu-binarisatie in de preprocessing leest backlit-
  displays met reflectie (o.a. motorkilometerstand) beter. Knop heet nu
  "pompdisplay scannen" i.p.v. "bon scannen".
- Datumveld wordt nu overgenomen uit de foto (EXIF-datum, anders
  bestandsdatum van de camera).

## [1.0.0] — 2026-11-16

### Added

- Foto-invoer bij Tanken & laden: maak een foto van de kilometerstand of de
  pompbon, OCR loopt op het toestel zelf (tesseract.js, pas geladen bij gebruik).
  Herkende km-stand, liters/kWh, totaalbedrag en prijs per eenheid worden
  overgenomen in het formulier. De foto blijft in het geheugen en wordt na de
  scan weggegooid: niets opgeslagen, niets geüpload.

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

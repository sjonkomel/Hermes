#!/usr/bin/env node
// Migratie Google Sheet -> Hermes
// Inlezen:  node scripts/migrate-sheet.mjs <pad-naar-csv>  (default: ./sheet-export.csv)
// Uitvoer:  scripts/migration.json — importeer dit bestand in de app via Instellingen.
//
// Verwacht de CSV zoals geëxporteerd via
//   https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&sheet=Formulierreacties%201
// met kolommen: Tijdstempel, Soort uitgave, Datum, Totaalbedrag, Liters, Vol?,
// Kilometerstand, Omschrijving, Band, Aanhanger, Dakkoffer, Prijs per liter, ...

import { readFileSync, writeFileSync } from "node:fs";

const SHEET_TO_APP = {
  Wegenbelasting: "wegenbelasting",
  Verzekering: "verzekering",
  Onderhoud: "onderhoud",
  Bandenwissel: "bandenwissel",
  Wasstraat: "was",
};

function csvParse(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// "18-2-2020" | "1-3-2026" -> "2020-02-18"
function toISODate(s) {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T]|$)/) ?? s.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// "€ 50,00" | "50" | "82,28" -> 50.0
function toNum(s) {
  if (s == null) return null;
  const cleaned = s.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function truthy(s) {
  return /^(true|ja|1|wel)$/i.test((s ?? "").trim());
}

function dayBefore(iso) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

const input = process.argv[2] ?? "sheet-export.csv";
const rows = csvParse(readFileSync(input, "utf-8"));
const header = rows[0].map((h) => h.trim());
const idx = (name) => header.indexOf(name);
if (idx("Soort uitgave") < 0) {
  console.error("Onverwachte CSV: kolom 'Soort uitgave' ontbreekt. Koppen:", header);
  process.exit(1);
}

const records = rows
  .slice(1)
  .map((r) => ({
    soort: r[idx("Soort uitgave")].trim(),
    datum: toISODate(r[idx("Datum")]),
    bedrag: toNum(r[idx("Totaalbedrag")]),
    liters: toNum(r[idx("Liters")]),
    vol: truthy(r[idx("Vol?")]),
    odo: toNum(r[idx("Kilometerstand")]),
    omschrijving: r[idx("Omschrijving")].trim() || null,
    band: r[idx("Band")].trim().toLowerCase(),
    aanhanger: truthy(r[idx("Aanhanger")]),
    dakkoffer: truthy(r[idx("Dakkoffer")]),
    prijsPerLiter: toNum(r[idx("Prijs per liter")]),
  }))
  .filter((r) => r.soort && r.datum)
  .sort((a, b) => a.datum.localeCompare(b.datum));

const fillups = [];
const expenses = [];
const odometerReadings = [];
const recurring = []; // periodes met vast bedrag per maand
const seenOdo = new Set();

// Terugkerende kosten: bedragsperiodes afleiden uit de maandelijkse regels.
const recurringCategories = ["Wegenbelasting", "Verzekering", "Afschrijving"];
for (const cat of recurringCategories) {
  let prev = null; // laatst geopende periode-object in `recurring`
  for (const r of records.filter((r) => r.soort === cat)) {
    if (!prev || r.bedrag !== prev.amount) {
      if (prev) prev.end_date = dayBefore(r.datum);
      prev = {
        category: SHEET_TO_APP[cat] ?? cat.toLowerCase(),
        amount: r.bedrag,
        start_date: r.datum,
        end_date: null,
      };
      recurring.push(prev);
    }
  }
  // laatste periode loopt door (end_date = null); in de app sluit je af
  // bij verkoop of een nieuwe bedragswijziging
}

for (const r of records) {
  if (r.soort === "Brandstof") {
    fillups.push({
      date: r.datum,
      odo: r.odo,
      liters: r.liters,
      price_per_liter: r.prijsPerLiter,
      total_cost: r.bedrag,
      full_tank: r.vol,
      tire_season: r.band === "winterband" ? "winter" : r.band === "zomerband" ? "zomer" : "4-seizoenen",
      has_trailer: r.aanhanger,
      has_roof_box: r.dakkoffer,
      description: r.omschrijving,
      note: null,
    });
    if (r.odo && !seenOdo.has(r.datum + r.odo)) {
      odometerReadings.push({ date: r.datum, odo: r.odo });
      seenOdo.add(r.datum + r.odo);
    }
  } else if (r.soort === "Kilometerstand") {
    if (r.odo && !seenOdo.has(r.datum + r.odo)) {
      odometerReadings.push({ date: r.datum, odo: r.odo });
      seenOdo.add(r.datum + r.odo);
    }
  } else if (SHEET_TO_APP[r.soort] && !recurringCategories.includes(r.soort)) {
    expenses.push({
      date: r.datum,
      category: SHEET_TO_APP[r.soort],
      amount: r.bedrag,
      description: r.omschrijving,
    });
  }
}

const first = records[0];
const migration = {
  vehicle: {
    name: "Auto (Sheet-import)",
    type: "auto",
    energy: "benzine",
    purchase_date: first.datum,
    purchase_price: 19000, // impliciet: €13.500 afgeschreven + €5.500 restwaarde — pas aan indien gewenst
    start_odo: 78170,
  },
  fillups,
  expenses,
  odometer_readings: odometerReadings,
  recurring_costs: recurring,
};

const out = "scripts/migration.json";
writeFileSync(out, JSON.stringify(migration, null, 2));

// Validatie-samenvatting
const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) ?? 0), 0);
console.log(`Migratiebestand: ${out}`);
console.log(`  records: ${records.length}, fillups: ${fillups.length}, expenses: ${expenses.length}, odo-metingen: ${odometerReadings.length}, terugkerende periodes: ${recurring.length}`);
console.log(`  som brandstof: € ${sum(fillups, (f) => f.total_cost).toFixed(2)} (verwacht 6202.61)`);
console.log(`  som overige kosten: € ${sum(expenses, (e) => e.amount).toFixed(2)} (verwacht 3896.31 onderhoud + 682.40 bandenwissel)`);
console.log(`  km-bereik: ${Math.min(...odometerReadings.map((o) => o.odo))} – ${Math.max(...odometerReadings.map((o) => o.odo))}`);

#!/usr/bin/env node
// Migratie motorsheet -> Hermes (tweede voertuig)
// Inlezen:  node scripts/migrate-motor.mjs <pad-naar-csv>  (default: ./motor-sheet-export.csv)
// Uitvoer:  scripts/migration-motor.json — importeer dit in de app via Instellingen.
//
// Verwacht de CSV zoals geëxporteerd via
//   https://docs.google.com/spreadsheets/d/1BfFxGslrA43cZFsiR84OAHTqe_RJdN9WoOGxaBPa2is/gviz/tq?tqx=out:csv
// met kolommen: Datum, Maand, Jaar, Kilometerstand, ODO, Liters, Verbruik, L/100 km,
//               Geschatte kosten, Bespaard, Wijziging, T.o.v. gemiddelde, Opmerkingen, Service

import { readFileSync, writeFileSync } from "node:fs";

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

// "13-07-2023" | "1-3-2026" -> "2023-07-13"
function toISODate(s) {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// "€ 22,71" -> 22.71
function toNum(s) {
  if (s == null) return null;
  const cleaned = s.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

const input = process.argv[2] ?? "motor-sheet-export.csv";
const rows = csvParse(readFileSync(input, "utf-8"));
const header = rows[0].map((h) => h.trim());
const idx = (name) => header.indexOf(name);
if (idx("Datum") < 0 || idx("Kilometerstand") < 0) {
  console.error("Onverwachte CSV: kolommen 'Datum'/'Kilometerstand' ontbreken. Koppen:", header.slice(0, 14));
  process.exit(1);
}

const fillups = rows
  .slice(1)
  .map((r) => ({
    date: toISODate(r[idx("Datum")]),
    odo: toNum(r[idx("Kilometerstand")]),
    liters: toNum(r[idx("Liters")]),
    total_cost: toNum(r[idx("Geschatte kosten")]),
    description: (r[idx("Opmerkingen")] ?? "").trim() || null,
  }))
  .filter((f) => f.date && f.odo != null && f.liters > 0)
  .map((f) => ({
    ...f,
    price_per_liter: f.total_cost != null && f.liters > 0 ? Number((f.total_cost / f.liters).toFixed(4)) : null,
    full_tank: true,
    tire_season: null,
    has_trailer: false,
    has_roof_box: false,
    note: null,
  }));

fillups.sort((a, b) => a.date.localeCompare(b.date));

const out = {
  vehicle: {
    name: "Motor (Sheet-import)",
    type: "motor",
    energy: "benzine",
    purchase_date: null,
    purchase_price: null,
    start_odo: fillups[0]?.odo ?? null,
  },
  fillups,
  expenses: [],
  odometer_readings: [],
  recurring_costs: [],
};

writeFileSync("scripts/migration-motor.json", JSON.stringify(out, null, 2) + "\n");

// samenvatting
const liters = fillups.reduce((s, f) => s + f.liters, 0);
const cost = fillups.reduce((s, f) => s + (f.total_cost ?? 0), 0);
const km = fillups[fillups.length - 1].odo - fillups[0].odo;
console.log(`tankbeurten: ${fillups.length}`);
console.log(`periode: ${fillups[0].date} t/m ${fillups[fillups.length - 1].date}`);
console.log(`km: ${km}  liters: ${liters.toFixed(2)}  kosten: €${cost.toFixed(2)}`);
console.log(`gem. verbruik: ${(liters / km * 100).toFixed(2)} l/100km  gem. prijs/l: €${(cost / liters).toFixed(3)}`);
console.log("geschreven: scripts/migration-motor.json");

import { Vehicle, VehicleData } from "../types";

export interface MonthlyCost {
  month: string; // YYYY-MM
  total: number;
  byCategory: Record<string, number>;
}

export interface ConsumptionPoint {
  date: string;
  odo: number;
  consumption: number | null; // l/100km of kWh/100km
  unit: "l" | "kWh";
  volume: number; // liters of kWh in het interval
  km: number; // km in het interval
}

export interface VehicleStats {
  firstDate: string | null;
  lastDate: string | null;
  totalKm: number | null;
  monthsActive: number;
  avgKmPerMonth: number | null;
  totalCost: number;
  avgCostPerMonth: number | null;
  costPerKm: number | null;
  // brandstof
  totalLiters: number | null;
  avgPricePerLiter: number | null;
  fuelConsumption: number | null; // l/100km
  // elektrisch
  totalKwh: number | null;
  avgPricePerKwh: number | null;
  chargeConsumption: number | null; // kWh/100km
  monthlyCosts: MonthlyCost[];
  categoryTotals: Record<string, number>;
  consumptionSeries: ConsumptionPoint[];
  fuelPriceSeries: { date: string; price: number }[];
  reservedDepreciation: number; // totaal afgeschreven via maandreserve
  currentValue: number | null; // aankoop - reserve (of verkoopprijs bij verkoop)
  finalDepreciation: number | null; // aankoop - verkoop (na verkoop)
  finalCostPerKm: number | null; // incl. waardevermindering, na verkoop
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthsBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  const m =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  return Math.max(m, 1);
}

/**
 * Verbruik per volle tank: liters tussen twee volle tanks gedeeld door
 * de afgelegde km's daartussen.
 */
function consumptionFromTanks(
  entries: { date: string; odo: number; amount: number; full: boolean }[],
  unit: "l" | "kWh"
): { series: ConsumptionPoint[]; total: number | null } {
  const series: ConsumptionPoint[] = [];
  let lastFullIdx = -1;
  let amountsSinceFull = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    amountsSinceFull += e.amount;
    if (e.full && lastFullIdx >= 0) {
      const km = e.odo - entries[lastFullIdx].odo;
      if (km > 0 && amountsSinceFull > 0) {
        series.push({
          date: e.date,
          odo: e.odo,
          consumption: (amountsSinceFull / km) * 100,
          unit,
          volume: amountsSinceFull,
          km,
        });
      }
    }
    if (e.full) {
      lastFullIdx = i;
      amountsSinceFull = 0;
    }
  }
  // Gewogen gemiddelde: totaal volume / totaal km. Een gemiddelde van de
  // losse interval-verhoudingen wordt scheefgetrokken door intervallen met
  // weinig volume op veel km (gemiste tankbeurten, terugbetalingen, etc.).
  const totalVolume = series.reduce((s, p) => s + p.volume, 0);
  const totalKm = series.reduce((s, p) => s + p.km, 0);
  const total = totalKm > 0 && totalVolume > 0 ? (totalVolume / totalKm) * 100 : null;
  return { series, total };
}

export function computeStats(vehicle: Vehicle, data: VehicleData): VehicleStats {
  const fillups = [...data.fillups].sort((a, b) =>
    a.date === b.date ? a.odo - b.odo : a.date < b.date ? -1 : 1
  );
  const charges = [...data.charges].sort((a, b) => a.date.localeCompare(b.date));
  const expenses = [...data.expenses].sort((a, b) => a.date.localeCompare(b.date));
  const odoReadings = [...data.odometerReadings].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // ---- km-stand
  const odoPoints = [
    ...odoReadings.map((r) => ({ date: r.date, odo: r.odo })),
    ...fillups.map((f) => ({ date: f.date, odo: f.odo })),
    ...charges.filter((c) => c.odo != null).map((c) => ({ date: c.date, odo: c.odo as number })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const startOdo = vehicle.start_odo ?? odoPoints[0]?.odo ?? null;
  const endOdo = odoPoints[odoPoints.length - 1]?.odo ?? null;
  const totalKm =
    startOdo != null && endOdo != null && endOdo > startOdo ? endOdo - startOdo : null;

  // ---- datums
  const allDates = [
    ...fillups.map((f) => f.date),
    ...charges.map((c) => c.date),
    ...expenses.map((e) => e.date),
    ...odoReadings.map((r) => r.date),
  ].sort();
  const firstDate = vehicle.purchase_date ?? allDates[0] ?? null;
  const lastDate = vehicle.sold_at ?? allDates[allDates.length - 1] ?? null;
  const monthsActive =
    firstDate && lastDate ? monthsBetween(firstDate, lastDate) : 0;

  // ---- terugkerende kosten materialiseren (virtuele maandelijkse boekingen)
  const monthlyCosts: MonthlyCost[] = [];
  const addCost = (dateISO: string, category: string, amount: number) => {
    const mk = monthKey(dateISO);
    let m = monthlyCosts.find((x) => x.month === mk);
    if (!m) {
      m = { month: mk, total: 0, byCategory: {} };
      monthlyCosts.push(m);
    }
    m.total += amount;
    m.byCategory[category] = (m.byCategory[category] ?? 0) + amount;
  };

  const today = new Date().toISOString().slice(0, 10);
  const periodEnd = vehicle.sold_at ?? today;

  for (const rc of data.recurringCosts) {
    const end = rc.end_date && rc.end_date < periodEnd ? rc.end_date : periodEnd;
    // Maand-rekenkunde puur numeriek: new Date/toISOString is
    // tijdzone-afhankelijk en liet de cursor in UTC+1 terug springen
    // (oneindige lus, bevroren dashboard).
    const [sy, sm] = rc.start_date.split("-").map(Number);
    const [ey, em] = end.split("-").map(Number);
    let cy = sy, cm = sm;
    while (cy < ey || (cy === ey && cm <= em)) {
      addCost(`${cy}-${String(cm).padStart(2, "0")}-01`, rc.category, rc.amount);
      cm += 1;
      if (cm > 12) { cm = 1; cy += 1; }
    }
  }
  for (const f of fillups) if (f.total_cost != null) addCost(f.date, "brandstof", f.total_cost);
  for (const c of charges) if (c.total_cost != null) addCost(c.date, "laden", c.total_cost);
  for (const e of expenses) addCost(e.date, e.category, e.amount);
  monthlyCosts.sort((a, b) => a.month.localeCompare(b.month));

  const categoryTotals: Record<string, number> = {};
  for (const m of monthlyCosts) {
    for (const [cat, amt] of Object.entries(m.byCategory)) {
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + amt;
    }
  }
  const totalCost = monthlyCosts.reduce((s, m) => s + m.total, 0);

  // ---- brandstof
  const totalLiters = fillups.reduce((s, f) => s + (f.liters ?? 0), 0);
  const litersWithPrice = fillups.filter((f) => f.price_per_liter != null);
  const avgPricePerLiter =
    litersWithPrice.length > 0
      ? litersWithPrice.reduce(
          (s, f) => s + (f.price_per_liter as number) * (f.liters ?? 1),
          0
        ) / litersWithPrice.reduce((s, f) => s + (f.liters ?? 1), 0)
      : null;
  const fuel = consumptionFromTanks(
    fillups.map((f) => ({
      date: f.date,
      odo: f.odo,
      amount: f.liters ?? 0,
      full: f.full_tank,
    })),
    "l"
  );

  // ---- elektrisch
  const totalKwh = charges.reduce((s, c) => s + (c.kwh ?? 0), 0);
  const chargesWithPrice = charges.filter((c) => c.price_per_kwh != null);
  const avgPricePerKwh =
    chargesWithPrice.length > 0
      ? chargesWithPrice.reduce(
          (s, c) => s + (c.price_per_kwh as number) * (c.kwh ?? 1),
          0
        ) / chargesWithPrice.reduce((s, c) => s + (c.kwh ?? 1), 0)
      : null;
  const chargeOdoPoints = charges
    .filter((c) => c.odo != null && c.kwh != null)
    .map((c) => ({ date: c.date, odo: c.odo as number, amount: c.kwh as number, full: true }));
  const elec = consumptionFromTanks(chargeOdoPoints, "kWh");

  // ---- afschrijving / waarde
  const reservedDepreciation = data.recurringCosts
    .filter((rc) => rc.category === "afschrijving")
    .reduce((s, rc) => {
      const end = rc.end_date && rc.end_date < periodEnd ? rc.end_date : periodEnd;
      if (rc.start_date > periodEnd) return s;
      const [sy, sm] = rc.start_date.split("-").map(Number);
      const [ey, em] = end.split("-").map(Number);
      const months = (ey - sy) * 12 + (em - sm) + 1;
      return s + months * rc.amount;
    }, 0);

  const purchase = vehicle.purchase_price;
  const currentValue =
    purchase != null ? Math.max(purchase - reservedDepreciation, 0) : null;
  const finalDepreciation =
    vehicle.sold_at != null && purchase != null && vehicle.sale_price != null
      ? purchase - vehicle.sale_price
      : null;
  // Bij verkoop: werkelijke, definitieve kostenvoering.
  // exploitatie = alle kosten min de afgeschreven reserve, plus het echte
  // waardeverlies (aankoop - verkoop). Eindresultaat per km over de hele levensduur.
  const exploitationCost =
    totalCost -
    reservedDepreciation +
    (purchase != null && vehicle.sale_price != null
      ? purchase - vehicle.sale_price
      : 0);
  const finalCostPerKm =
    vehicle.sold_at != null && totalKm != null && totalKm > 0
      ? exploitationCost / totalKm
      : null;

  return {
    firstDate,
    lastDate,
    totalKm,
    monthsActive,
    avgKmPerMonth: totalKm != null && monthsActive > 0 ? totalKm / monthsActive : null,
    totalCost,
    avgCostPerMonth: monthsActive > 0 ? totalCost / monthsActive : null,
    costPerKm: totalKm != null && totalKm > 0 ? totalCost / totalKm : null,
    totalLiters: totalLiters > 0 ? totalLiters : null,
    avgPricePerLiter,
    fuelConsumption: fuel.total,
    totalKwh: totalKwh > 0 ? totalKwh : null,
    avgPricePerKwh,
    chargeConsumption: elec.total,
    monthlyCosts,
    categoryTotals,
    consumptionSeries: fuel.series,
    fuelPriceSeries: litersWithPrice.map((f) => ({
      date: f.date,
      price: f.price_per_liter as number,
    })),
    reservedDepreciation,
    currentValue,
    finalDepreciation,
    finalCostPerKm,
  };
}

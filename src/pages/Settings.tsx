import { ChangeEvent } from "react";
import { supabase } from "../supabase";
import { useVehicles } from "../lib/data";
import { todayISO } from "../lib/format";

interface MigrationFile {
  vehicle: {
    name: string;
    type: string;
    energy: string;
    purchase_date: string | null;
    purchase_price: number | null;
    start_odo: number | null;
  };
  fillups: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  odometer_readings: Record<string, unknown>[];
  recurring_costs: {
    category: string;
    amount: number;
    start_date: string;
    end_date: string | null;
  }[];
}

export function Settings() {
  const { refresh } = useVehicles();

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !confirm(
        "Historie importeren? Dit voegt een voertuig toe met alle data uit het migratiebestand. Zorg dat dit maar één keer gebeurt."
      )
    )
      return;
    const text = await file.text();
    const json = JSON.parse(text) as MigrationFile;

    const { data: vehicle, error: vErr } = await supabase
      .from("vehicles")
      .insert(json.vehicle)
      .select()
      .single();
    if (vErr || !vehicle) {
      alert("Voertuig aanmaken mislukt: " + vErr?.message);
      return;
    }
    const vid = vehicle.id;

    const insertAll = async (table: string, rows: Record<string, unknown>[]) => {
      if (rows.length === 0) return;
      const payload = rows.map((r) => ({
        ...r,
        vehicle_id: vid,
      }));
      const { error } = await supabase.from(table).insert(payload);
      if (error) alert(`${table}: ${error.message}`);
    };

    await insertAll("fillups", json.fillups.map(dateOnly));
    await insertAll("expenses", json.expenses.map(dateOnly));
    await insertAll("odometer_readings", json.odometer_readings.map(dateOnly));
    const { error: rcErr } = await supabase.from("recurring_costs").insert(
      json.recurring_costs.map((r) => ({
        vehicle_id: vid,
        category: r.category,
        amount: r.amount,
        frequency: "maandelijks",
        start_date: r.start_date,
        end_date: r.end_date,
      }))
    );
    if (rcErr) alert("recurring_costs: " + rcErr.message);

    await refresh();
    alert("Import voltooid. Controleer het dashboard met je oude cijfers.");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="font-medium text-slate-900 mb-2">Historie importeren (Google Sheet-migratie)</h2>
        <p className="text-sm text-slate-600 mb-3">
          Genereer het migratiebestand met{" "}
          <code className="bg-slate-100 px-1 rounded">npm run migrate:sheet</code> (zie README) en
          importeer het hier. Valideer daarna het dashboard tegen de oude cijfers
          (gem. €480,69/maand, €0,40/km, 21,95 l/100km, 924 km/maand).
        </p>
        <input type="file" accept=".json" onChange={importFile} className="text-sm" />
      </section>

      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="font-medium text-slate-900 mb-2">Account</h2>
        <p className="text-sm text-slate-600">
          Accountbeheer (wachtwoord wijzigen) gebeurt via Supabase. Vandaag:{" "}
          {todayISO()}
        </p>
      </section>
    </div>
  );
}

function dateOnly(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) out[k] = k === "date" && typeof v === "string" ? v.slice(0, 10) : v;
  return out;
}

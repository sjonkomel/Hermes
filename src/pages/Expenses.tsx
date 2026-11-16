import { FormEvent, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { useVehicleData, useVehicles } from "../lib/data";
import { eur, dateStr, todayISO } from "../lib/format";
import { ExpenseCategory } from "../types";

const CATEGORIES: ExpenseCategory[] = [
  "onderhoud",
  "bandenwissel",
  "apk",
  "verzekering",
  "wegenbelasting",
  "was",
  "accessoires",
  "boete",
  "parkeren",
  "tol",
  "overig",
];

export function Expenses() {
  const { vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const current = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? vehicles.find((v) => v.active) ?? vehicles[0] ?? null,
    [vehicles, vehicleId]
  );
  const { data, loading, refresh } = useVehicleData(current?.id ?? null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select
          value={current?.id ?? ""}
          onChange={(e) => setVehicleId(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      {current && <ExpenseForm vehicleId={current.id} onSaved={refresh} />}

      {loading ? (
        <div className="text-sm text-slate-500">Laden…</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="px-4 py-2">Datum</th>
                <th className="px-4 py-2">Categorie</th>
                <th className="px-4 py-2">Bedrag</th>
                <th className="px-4 py-2">Omschrijving</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {[...data.expenses]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((e) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="px-4 py-2">{dateStr(e.date)}</td>
                    <td className="px-4 py-2">{e.category}</td>
                    <td className="px-4 py-2">{eur(e.amount)}</td>
                    <td className="px-4 py-2 text-slate-500">{e.description ?? ""}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={async () => {
                          if (confirm("Kostenpost verwijderen?")) {
                            await supabase.from("expenses").delete().eq("id", e.id);
                            await refresh();
                          }
                        }}
                        className="text-xs text-red-500 hover:underline"
                      >
                        verwijder
                      </button>
                    </td>
                  </tr>
                ))}
              {data.expenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-slate-500">
                    Nog geen losse kosten (terugkerende kosten beheer je per voertuig).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExpenseForm({ vehicleId, onSaved }: { vehicleId: string; onSaved: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<ExpenseCategory>("onderhoud");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount.replace(",", "."));
    if (!amt) return;
    setBusy(true);
    const { error } = await supabase.from("expenses").insert({
      vehicle_id: vehicleId,
      date,
      category,
      amount: amt,
      description: description || null,
    });
    setBusy(false);
    if (!error) {
      setAmount("");
      setDescription("");
      onSaved();
    } else {
      alert("Opslaan mislukt: " + error.message);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-3 items-end text-sm">
      <label className="block">
        <span className="text-xs text-slate-500">Datum</span>
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 mt-0.5" />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Categorie</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="w-full border border-slate-300 rounded px-2 py-1.5 mt-0.5 bg-white">
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Bedrag (€)</span>
        <input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 mt-0.5" />
      </label>
      <label className="block grow">
        <span className="text-xs text-slate-500">Omschrijving</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 mt-0.5" />
      </label>
      <button disabled={busy} className="bg-slate-900 text-white px-4 py-1.5 rounded hover:bg-slate-800 disabled:opacity-50">
        + Kostenpost
      </button>
    </form>
  );
}

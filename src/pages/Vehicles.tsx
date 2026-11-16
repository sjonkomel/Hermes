import { FormEvent, useState } from "react";
import { supabase } from "../supabase";
import { useVehicleData, useVehicles } from "../lib/data";
import { eur } from "../lib/format";
import { RecurringCategory, Vehicle, VehicleType, EnergyType } from "../types";

export function Vehicles() {
  const { vehicles, loading, refresh } = useVehicles();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-900">Voertuigen</h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-slate-900 text-white text-sm px-3 py-1.5 rounded hover:bg-slate-800"
        >
          {showForm ? "Annuleren" : "+ Nieuw voertuig"}
        </button>
      </div>

      {showForm && (
        <VehicleForm
          onSaved={async () => {
            setShowForm(false);
            await refresh();
          }}
        />
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Laden…</div>
      ) : (
        <div className="space-y-4">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} onChanged={refresh} />
          ))}
          {vehicles.length === 0 && (
            <div className="bg-white rounded-lg p-6 text-sm text-slate-500">
              Nog geen voertuigen. Voeg je auto of motor toe om te beginnen.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VehicleCard({ vehicle, onChanged }: { vehicle: Vehicle; onChanged: () => void }) {
  const { data, refresh } = useVehicleData(vehicle.id);

  const [editing, setEditing] = useState(false);

  // onderhoudstracker: reserve sinds startdatum vs werkelijk onderhoud
  const MAINT = ["onderhoud", "bandenwissel", "apk"];
  const maintSpent = data.expenses
    .filter((e) => MAINT.includes(e.category))
    .reduce((s, e) => s + e.amount, 0);
  let maintReserved = 0;
  if (vehicle.maintenance_reserve != null) {
    const since = vehicle.maintenance_reserve_since ?? vehicle.purchase_date;
    if (since) {
      const [sy, sm] = since.split("-").map(Number);
      const [ey, em] = (vehicle.sold_at ?? new Date().toISOString().slice(0, 10)).split("-").map(Number);
      maintReserved = Math.max((ey - sy) * 12 + (em - sm), 0) * vehicle.maintenance_reserve;
    }
  }

  const sell = async () => {
    const priceStr = prompt(`Verkoopprijs van "${vehicle.name}" (€):`);
    if (priceStr == null) return;
    const price = parseFloat(priceStr.replace(",", "."));
    const dateStr = prompt("Verkoopdatum (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!dateStr) return;
    await supabase
      .from("vehicles")
      .update({ active: false, sold_at: dateStr, sale_price: price || null })
      .eq("id", vehicle.id);
    // lopende terugkerende kosten afsluiten op de dag vóór verkoop
    const end = new Date(dateStr + "T00:00:00");
    end.setDate(end.getDate() - 1);
    const endISO = end.toISOString().slice(0, 10);
    for (const rc of data.recurringCosts.filter((r) => r.end_date == null)) {
      await supabase.from("recurring_costs").update({ end_date: endISO }).eq("id", rc.id);
    }
    await refresh();
    onChanged();
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-medium text-slate-900">
            {vehicle.name}{" "}
            {!vehicle.active && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded ml-1">verkocht</span>
            )}
          </h3>
          <p className="text-xs text-slate-500">
            {vehicle.type} · {vehicle.energy}
            {vehicle.purchase_date && ` · aankoop ${vehicle.purchase_date}`}
            {vehicle.purchase_price != null && ` voor ${eur(vehicle.purchase_price)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing((s) => !s)} className="text-sm text-sky-700 bg-sky-50 border border-sky-200 px-3 py-1.5 rounded hover:bg-sky-100">
            {editing ? "Annuleer" : "Wijzig…"}
          </button>
          {vehicle.active && (
            <button onClick={sell} className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded hover:bg-amber-100">
              Verkocht…
            </button>
          )}
        </div>
      </div>

      {editing && (
        <VehicleEditForm
          vehicle={vehicle}
          onSaved={async () => {
            setEditing(false);
            onChanged();
          }}
        />
      )}

      {vehicle.maintenance_reserve != null && (
        <div className="border-t border-slate-100 pt-2 text-sm">
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Onderhoudsreserve ({eur(vehicle.maintenance_reserve)}/maand
            {vehicle.maintenance_reserve_since ? ` sinds ${vehicle.maintenance_reserve_since}` : ""})
          </h4>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            <span>
              gereserveerd: <strong>{eur(maintReserved)}</strong>
            </span>
            <span>
              besteed aan onderhoud/apk/banden: <strong>{eur(maintSpent)}</strong>
            </span>
            <span className={maintReserved - maintSpent < 0 ? "text-red-600" : "text-emerald-700"}>
              saldo: <strong>{eur(maintReserved - maintSpent)}</strong>
            </span>
          </div>
        </div>
      )}

      <RecurringList vehicleId={vehicle.id} recurring={data.recurringCosts} onChanged={refresh} />
    </div>
  );
}

function RecurringList({
  vehicleId,
  recurring,
  onChanged,
}: {
  vehicleId: string;
  recurring: { id: string; category: string; amount: number; start_date: string; end_date: string | null }[];
  onChanged: () => void;
}) {
  const [category, setCategory] = useState<RecurringCategory>("verzekering");
  const [amount, setAmount] = useState("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount.replace(",", "."));
    if (!amt) return;
    const sorted = [...recurring].sort((a, b) => b.start_date.localeCompare(a.start_date));
    const sameCat = sorted.find((r) => r.category === category && r.end_date == null);
    if (sameCat) {
      const dayBefore = new Date(start + "T00:00:00");
      dayBefore.setDate(dayBefore.getDate() - 1);
      await supabase
        .from("recurring_costs")
        .update({ end_date: dayBefore.toISOString().slice(0, 10) })
        .eq("id", sameCat.id);
    }
    await supabase.from("recurring_costs").insert({
      vehicle_id: vehicleId,
      category,
      amount: amt,
      frequency: "maandelijks",
      start_date: start,
    });
    setAmount("");
    onChanged();
  };

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        Terugkerende kosten (per maand)
      </h4>
      {recurring
        .filter((r) => r.end_date == null)
        .map((r) => (
          <div key={r.id} className="flex items-center justify-between text-sm">
            <span>
              {r.category}: <strong>{eur(r.amount)}</strong>{" "}
              <span className="text-xs text-slate-400">sinds {r.start_date}</span>
            </span>
            <button
              onClick={async () => {
                const newAmt = prompt(`Nieuw bedrag voor ${r.category} (€):`);
                if (newAmt == null) return;
                const amt = parseFloat(newAmt.replace(",", "."));
                const startDate = prompt("Ingangsdatum (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
                if (!startDate || !amt) return;
                const dayBefore = new Date(startDate + "T00:00:00");
                dayBefore.setDate(dayBefore.getDate() - 1);
                await supabase.from("recurring_costs").update({ end_date: dayBefore.toISOString().slice(0, 10) }).eq("id", r.id);
                await supabase.from("recurring_costs").insert({
                  vehicle_id: vehicleId,
                  category: r.category,
                  amount: amt,
                  frequency: "maandelijks",
                  start_date: startDate,
                });
                onChanged();
              }}
              className="text-xs text-sky-600 hover:underline"
            >
              wijzig bedrag
            </button>
          </div>
        ))}
      {recurring.filter((r) => r.end_date == null).length === 0 && (
        <p className="text-xs text-slate-400">Geen actieve terugkerende kosten.</p>
      )}
      {recurring.some((r) => r.end_date != null) && (
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer">Historie</summary>
          {recurring
            .filter((r) => r.end_date != null)
            .map((r) => (
              <div key={r.id}>
                {r.category}: {eur(r.amount)} ({r.start_date} t/m {r.end_date})
              </div>
            ))}
        </details>
      )}
      <form onSubmit={add} className="flex flex-wrap gap-2 items-end pt-1">
        <select value={category} onChange={(e) => setCategory(e.target.value as RecurringCategory)} className="border border-slate-300 rounded px-2 py-1 text-sm bg-white">
          <option value="verzekering">verzekering</option>
          <option value="wegenbelasting">wegenbelasting</option>
          <option value="afschrijving">afschrijving (maandreserve)</option>
          <option value="apk">apk</option>
          <option value="overig">overig</option>
        </select>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="bedrag/maand" inputMode="decimal" className="border border-slate-300 rounded px-2 py-1 text-sm" />
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm" />
        <button className="text-sm bg-slate-100 border border-slate-300 rounded px-3 py-1 hover:bg-slate-200">
          + periode
        </button>
      </form>
    </div>
  );
}

function VehicleEditForm({ vehicle, onSaved }: { vehicle: Vehicle; onSaved: () => void }) {
  const [name, setName] = useState(vehicle.name);
  const [type, setType] = useState<VehicleType>(vehicle.type);
  const [energy, setEnergy] = useState<EnergyType>(vehicle.energy);
  const [purchaseDate, setPurchaseDate] = useState(vehicle.purchase_date ?? "");
  const [purchasePrice, setPurchasePrice] = useState(vehicle.purchase_price != null ? String(vehicle.purchase_price) : "");
  const [startOdo, setStartOdo] = useState(vehicle.start_odo != null ? String(vehicle.start_odo) : "");
  const [maintReserve, setMaintReserve] = useState(vehicle.maintenance_reserve != null ? String(vehicle.maintenance_reserve) : "");
  const [maintSince, setMaintSince] = useState(vehicle.maintenance_reserve_since ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("vehicles")
      .update({
        name: name.trim(),
        type,
        energy,
        purchase_date: purchaseDate || null,
        purchase_price: purchasePrice ? parseFloat(purchasePrice.replace(",", ".")) : null,
        start_odo: startOdo ? parseInt(startOdo, 10) : null,
        maintenance_reserve: maintReserve ? parseFloat(maintReserve.replace(",", ".")) : null,
        maintenance_reserve_since: maintSince || null,
      })
      .eq("id", vehicle.id);
    setBusy(false);
    if (!error) onSaved();
    else alert("Opslaan mislukt: " + error.message);
  };

  return (
    <form onSubmit={submit} className="bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
      <label className="block md:col-span-2">
        <span className="text-xs text-slate-500">Naam</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Soort</span>
        <select value={type} onChange={(e) => setType(e.target.value as VehicleType)} className={inputCls + " bg-white"}>
          <option value="auto">auto</option>
          <option value="motor">motor</option>
          <option value="overig">overig</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Energie</span>
        <select value={energy} onChange={(e) => setEnergy(e.target.value as EnergyType)} className={inputCls + " bg-white"}>
          <option value="benzine">benzine</option>
          <option value="diesel">diesel</option>
          <option value="ev">elektrisch</option>
          <option value="hybride">hybride (PHEV)</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Aankoopdatum</span>
        <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputCls} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Aankoopbedrag (€)</span>
        <input inputMode="decimal" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className={inputCls} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Km-stand bij ingebruikname</span>
        <input inputMode="numeric" value={startOdo} onChange={(e) => setStartOdo(e.target.value)} className={inputCls} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Onderhoudsreserve (€/maand)</span>
        <input inputMode="decimal" value={maintReserve} onChange={(e) => setMaintReserve(e.target.value)} className={inputCls} />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Reserve geldt sinds</span>
        <input type="date" value={maintSince} onChange={(e) => setMaintSince(e.target.value)} className={inputCls} />
      </label>
      <div className="flex items-end col-span-2 md:col-span-1">
        <button disabled={busy} className="bg-slate-900 text-white px-4 py-1.5 rounded hover:bg-slate-800 disabled:opacity-50">
          Opslaan
        </button>
      </div>
    </form>
  );
}

const inputCls = "w-full border border-slate-300 rounded px-2 py-1.5 mt-0.5";

function VehicleForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<VehicleType>("auto");
  const [energy, setEnergy] = useState<EnergyType>("benzine");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [purchasePrice, setPurchasePrice] = useState("");
  const [startOdo, setStartOdo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("vehicles").insert({
      name,
      type,
      energy,
      purchase_date: purchaseDate || null,
      purchase_price: purchasePrice ? parseFloat(purchasePrice.replace(",", ".")) : null,
      start_odo: startOdo ? parseInt(startOdo, 10) : null,
    });
    setBusy(false);
    if (!error) onSaved();
    else alert("Opslaan mislukt: " + error.message);
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-lg shadow-sm p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
      <label className="block md:col-span-2">
        <span className="text-xs text-slate-500">Naam</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="bijv. Volvo V60" className="w-full border border-slate-300 rounded px-2 py-1.5 mt-0.5" />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Soort</span>
        <select value={type} onChange={(e) => setType(e.target.value as VehicleType)} className="w-full border border-slate-300 rounded px-2 py-1.5 mt-0.5 bg-white">
          <option value="auto">auto</option>
          <option value="motor">motor</option>
          <option value="overig">overig</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Energie</span>
        <select value={energy} onChange={(e) => setEnergy(e.target.value as EnergyType)} className="w-full border border-slate-300 rounded px-2 py-1.5 mt-0.5 bg-white">
          <option value="benzine">benzine</option>
          <option value="diesel">diesel</option>
          <option value="ev">elektrisch</option>
          <option value="hybride">hybride</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Aankoopdatum</span>
        <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 mt-0.5" />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Aankoopbedrag (€)</span>
        <input inputMode="decimal" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 mt-0.5" />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Km-stand bij ingebruikname</span>
        <input inputMode="numeric" value={startOdo} onChange={(e) => setStartOdo(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 mt-0.5" />
      </label>
      <div className="flex items-end">
        <button disabled={busy} className="bg-slate-900 text-white px-4 py-1.5 rounded hover:bg-slate-800 disabled:opacity-50">
          Opslaan
        </button>
      </div>
    </form>
  );
}

import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../supabase";
import { useVehicleData, useVehicles } from "../lib/data";
import { computeStats } from "../lib/stats";
import { eur, dateStr, todayISO } from "../lib/format";
import { Fillup, Charge, TireSeason } from "../types";

export function Refuels() {
  const { vehicles, refresh: refreshVehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const current = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? vehicles.find((v) => v.active) ?? vehicles[0] ?? null,
    [vehicles, vehicleId]
  );
  const { data, loading, refresh } = useVehicleData(current?.id ?? null);
  const stats = useMemo(() => (current ? computeStats(current, data) : null), [current, data]);
  const [formMode, setFormMode] = useState<null | "fuel" | "charge">(null);

  const isEv = current?.energy === "ev";
  const isHybrid = current?.energy === "hybride";
  // PHEV: tankbeurten én laadsessies door elkaar in dit overzicht
  const entries = current
    ? isEv
      ? data.charges
      : isHybrid
      ? [...data.fillups, ...data.charges]
      : data.fillups
    : [];

  const consumptionByEntry = useMemo(() => {
    const map = new Map<string, string>();
    const sorted = [...entries].sort((a, b) =>
      a.date === b.date ? (a.odo ?? 0) - (b.odo ?? 0) : a.date < b.date ? -1 : 1
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const amount = "liters" in cur ? cur.liters : cur.kwh;
      if (amount && (cur.odo ?? 0) > (prev.odo ?? 0)) {
        const km = (cur.odo as number) - (prev.odo as number);
        if (km > 0) {
          const unit = "liters" in cur ? "l" : "kWh";
          map.set(cur.id, `${((amount / km) * 100).toFixed(1)} ${unit}/100km`);
        }
      }
    }
    return map;
  }, [entries]);

  if (!current) {
    return <div className="text-sm text-slate-500">Voeg eerst een voertuig toe.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select
          value={current.id}
          onChange={(e) => setVehicleId(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        {stats && (
          <span className="text-xs text-slate-500">
            {!isEv &&
              `gem. ${stats.fuelConsumption?.toFixed(1) ?? "–"} l/100km · gem. ${eur(stats.avgPricePerLiter, 3)}/l`}
            {!isEv && isHybrid && data.charges.length > 0 && " · "}
            {(isEv || isHybrid) &&
              data.charges.length > 0 &&
              `gem. ${stats.chargeConsumption?.toFixed(1) ?? "–"} kWh/100km · gem. ${eur(stats.avgPricePerKwh, 3)}/kWh`}
          </span>
        )}
        <div className="flex gap-2">
          {!isEv && (
            <button
              onClick={() => setFormMode((m) => (m === "fuel" ? null : "fuel"))}
              disabled={current.sold_at != null}
              className="bg-slate-900 text-white text-sm px-3 py-1.5 rounded hover:bg-slate-800 disabled:opacity-40"
            >
              {formMode === "fuel" ? "Annuleren" : "+ Tankbeurt"}
            </button>
          )}
          {(isEv || isHybrid) && (
            <button
              onClick={() => setFormMode((m) => (m === "charge" ? null : "charge"))}
              disabled={current.sold_at != null}
              className="bg-sky-700 text-white text-sm px-3 py-1.5 rounded hover:bg-sky-800 disabled:opacity-40"
            >
              {formMode === "charge" ? "Annuleren" : "+ Laadsessie"}
            </button>
          )}
        </div>
      </div>

      {formMode && (
        <EntryForm
          vehicleId={current.id}
          isEv={formMode === "charge"}
          lastOdo={lastOdo(entries)}
          onSaved={async () => {
            setFormMode(null);
            await refresh();
            await refreshVehicles();
          }}
        />
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Laden…</div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-lg p-6 text-sm text-slate-500">Nog geen registraties.</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="px-4 py-2">Datum</th>
                <th className="px-4 py-2">km-stand</th>
                <th className="px-4 py-2">{isEv ? "kWh" : isHybrid ? "Liters/kWh" : "Liters"}</th>
                <th className="px-4 py-2">{isEv ? "Prijs/kWh" : isHybrid ? "Prijs/l of /kWh" : "Prijs/l"}</th>
                <th className="px-4 py-2">Totaal</th>
                <th className="px-4 py-2">Verbruik</th>
                <th className="px-4 py-2">Context</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {[...entries]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((entry) => {
                  const isFill = "liters" in entry;
                  const f = entry as Fillup;
                  const c = entry as Charge;
                  const cons = consumptionByEntry.get(entry.id) ?? null;
                  return (
                    <tr key={entry.id} className="border-b border-slate-100">
                      <td className="px-4 py-2">{dateStr(entry.date)}</td>
                      <td className="px-4 py-2">{entry.odo ?? "–"}</td>
                      <td className="px-4 py-2">{isFill ? f.liters ?? "–" : c.kwh ?? "–"}</td>
                      <td className="px-4 py-2">
                        {isFill
                          ? f.price_per_liter != null
                            ? eur(f.price_per_liter, 3)
                            : "–"
                          : c.price_per_kwh != null
                          ? eur(c.price_per_kwh, 3)
                          : "–"}
                      </td>
                      <td className="px-4 py-2">{entry.total_cost != null ? eur(entry.total_cost) : "–"}</td>
                      <td className="px-4 py-2">{cons != null ? cons : "–"}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {[
                          entry.tire_season,
                          entry.has_trailer && "aanhangwagen",
                          entry.has_roof_box && "dakkoffer",
                          isFill ? f.description : c.location_type,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={async () => {
                            const table = isFill ? "fillups" : "charges";
                            if (confirm("Registratie verwijderen?")) {
                              await supabase.from(table).delete().eq("id", entry.id);
                              await refresh();
                            }
                          }}
                          className="text-xs text-red-500 hover:underline"
                        >
                          verwijder
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function lastOdo(entries: (Fillup | Charge)[]): number | null {
  const withOdo = entries.filter((e) => e.odo != null) as { odo: number }[];
  return withOdo.length ? withOdo[withOdo.length - 1].odo : null;
}

function EntryForm({
  vehicleId,
  isEv,
  lastOdo,
  onSaved,
}: {
  vehicleId: string;
  isEv: boolean;
  lastOdo: number | null;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [odo, setOdo] = useState<string>(lastOdo != null ? String(lastOdo) : "");
  const [amount, setAmount] = useState(""); // liters of kWh
  const [unitPrice, setUnitPrice] = useState(""); // prijs per liter/kWh
  const [totalCost, setTotalCost] = useState("");
  const [fullTank, setFullTank] = useState(true);
  const [season, setSeason] = useState<TireSeason>("winter");
  const [trailer, setTrailer] = useState(false);
  const [roofBox, setRoofBox] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const a = parseFloat(amount.replace(",", ".")) || 0;
  const p = parseFloat(unitPrice.replace(",", ".")) || 0;
  const t = parseFloat(totalCost.replace(",", ".")) || 0;
  const computedTotal = a > 0 && p > 0 ? a * p : t;
  const computedPrice = a > 0 && t > 0 ? t / a : p;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const odoNum = parseInt(odo, 10);
    const payload = {
      vehicle_id: vehicleId,
      date,
      odo: isEv ? odoNum || null : odoNum,
      total_cost: computedTotal > 0 ? Number(computedTotal.toFixed(2)) : null,
      tire_season: season,
      has_trailer: trailer,
      has_roof_box: roofBox,
    };
    const { error } = isEv
      ? await supabase.from("charges").insert({
          ...payload,
          kwh: a > 0 ? a : null,
          price_per_kwh: computedPrice > 0 ? Number(computedPrice.toFixed(4)) : null,
          location_type: description === "thuis" ? "thuis" : description === "publiek" ? "publiek" : null,
          note: description || null,
        })
      : await supabase.from("fillups").insert({
          ...payload,
          liters: a > 0 ? a : null,
          price_per_liter: computedPrice > 0 ? Number(computedPrice.toFixed(4)) : null,
          full_tank: fullTank,
          description: description || null,
        });
    // bij elke entry een odometer-meting aanmaken (voor km/maand-trends)
    if (!error && odoNum > 0) {
      await supabase.from("odometer_readings").insert({
        vehicle_id: vehicleId,
        date,
        odo: odoNum,
      });
    }
    setBusy(false);
    if (!error) onSaved();
    else alert("Opslaan mislukt: " + error.message);
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-lg shadow-sm p-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Field label="Datum">
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Kilometerstand">
          <input inputMode="numeric" required={!isEv} value={odo} onChange={(e) => setOdo(e.target.value)} className={inputCls} />
        </Field>
        <Field label={isEv ? "kWh" : "Liters"}>
          <input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
        </Field>
        <Field label={isEv ? "Prijs per kWh (optioneel)" : "Prijs per liter (optioneel)"}>
          <input
            inputMode="decimal"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="wordt berekend"
            className={inputCls}
          />
        </Field>
        <Field label="Totaalbedrag">
          <input inputMode="decimal" required value={totalCost} onChange={(e) => setTotalCost(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Bandenseizoen">
          <select value={season} onChange={(e) => setSeason(e.target.value as TireSeason)} className={inputCls}>
            <option value="winter">winter</option>
            <option value="zomer">zomer</option>
            <option value="4-seizoenen">4-seizoenen</option>
          </select>
        </Field>
        <Field label={isEv ? "Locatie" : "Omschrijving"}>
          {isEv ? (
            <select value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls}>
              <option value="">–</option>
              <option value="thuis">thuis</option>
              <option value="publiek">publiek</option>
            </select>
          ) : (
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
          )}
        </Field>
        <Field label="Context">
          <div className="flex gap-3 pt-1 text-xs">
            {!isEv && (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={fullTank} onChange={(e) => setFullTank(e.target.checked)} /> volle tank
              </label>
            )}
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={trailer} onChange={(e) => setTrailer(e.target.checked)} /> aanhanger
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={roofBox} onChange={(e) => setRoofBox(e.target.checked)} /> dakkoffer
            </label>
          </div>
        </Field>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {computedTotal > 0 && `totaal: ${eur(computedTotal)}`}
          {a > 0 && t > 0 && ` · prijs: ${eur(computedPrice, 3)}`}
        </span>
        <button disabled={busy} className="bg-slate-900 text-white text-sm px-4 py-1.5 rounded hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
    </form>
  );
}

const inputCls = "w-full border border-slate-300 rounded px-2 py-1.5";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

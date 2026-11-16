import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { useVehicleData, useVehicles } from "../lib/data";
import { computeStats } from "../lib/stats";
import { eur, num, dateStr } from "../lib/format";

const COLORS = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#eab308", "#14b8a6", "#f43f5e"];

export function Dashboard() {
  const { vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const current = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? vehicles.find((v) => v.active) ?? vehicles[0] ?? null,
    [vehicles, vehicleId]
  );
  const { data, loading } = useVehicleData(current?.id ?? null);
  const stats = useMemo(() => (current ? computeStats(current, data) : null), [current, data]);

  if (vehicles.length === 0 && !loading) {
    return (
      <div className="bg-white rounded-lg p-6 text-sm text-slate-600">
        Nog geen voertuigen. Voeg je eerste voertuig toe onder{" "}
        <a href="/voertuigen" className="text-sky-600 underline">Voertuigen</a>.
      </div>
    );
  }
  if (!current || !stats) return <div className="text-sm text-slate-500">Laden…</div>;

  const pieData = Object.entries(stats.categoryTotals)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const monthly = stats.monthlyCosts.slice(-24).map((m) => ({
    month: m.month,
    ...m.byCategory,
  }));
  const categories = Array.from(new Set(stats.monthlyCosts.flatMap((m) => Object.keys(m.byCategory))));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {vehicles.map((v) => (
            <button
              key={v.id}
              onClick={() => setVehicleId(v.id)}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                v.id === current.id
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:border-slate-500"
              }`}
            >
              {v.name}
              {!v.active && " (verkocht)"}
            </button>
          ))}
        </div>
        {current.sold_at && (
          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">
            Verkocht op {dateStr(current.sold_at)}
            {stats.finalCostPerKm != null && ` · definitief ${eur(stats.finalCostPerKm, 3)}/km`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Card label="Gem. kosten / maand" value={eur(stats.avgCostPerMonth)} />
        <Card label="Gem. km / maand" value={num(stats.avgKmPerMonth, 0)} />
        <Card
          label="Kosten per km"
          value={eur(stats.costPerKm, 3)}
          sub={stats.costPerKmExReserve != null ? `excl. reserve: ${eur(stats.costPerKmExReserve, 3)}/km` : undefined}
        />
        <Card
          label={current.energy === "ev" ? "Verbruik (kWh/100km)" : "Verbruik (l/100km)"}
          value={
            current.energy === "ev"
              ? num(stats.chargeConsumption)
              : num(stats.fuelConsumption)
          }
          sub={
            current.energy === "hybride" && stats.chargeConsumption != null
              ? `elektrisch: ${num(stats.chargeConsumption, 1)} kWh/100km`
              : undefined
          }
        />
        <Card
          label="Gem. prijs / liter"
          value={stats.avgPricePerLiter != null ? eur(stats.avgPricePerLiter, 3) : "–"}
        />
        <Card
          label="Huidige waarde"
          value={current.sale_price != null ? eur(current.sale_price) : eur(stats.currentValue)}
          sub={
            current.sold_at == null
              ? `gereserveerd: ${eur(stats.reservedDepreciation)}`
              : undefined
          }
        />
        <Card
          label="Onderhoudssaldo"
          value={eur(stats.maintenance.saldo)}
          sub={`gereserveerd ${eur(stats.maintenance.reserved)} · besteed ${eur(stats.maintenance.spent)}`}
        />
      </div>

      <ChartCard title="Kosten per maand (laatste 24) — per categorie">
        <BarChart data={monthly}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => eur(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {categories.map((c, i) => (
            <Bar key={c} dataKey={c} stackId="a" fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ChartCard>

      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard title="Kostenverdeling per categorie">
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => eur(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ChartCard>

        {stats.fuelPriceSeries.length > 0 && (
          <ChartCard title="Brandstofprijs per liter">
            <LineChart data={stats.fuelPriceSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => eur(v, 2)}
              />
              <Tooltip formatter={(v: number) => eur(v, 3)} />
              <Line type="monotone" dataKey="price" stroke="#f97316" dot={false} />
            </LineChart>
          </ChartCard>
        )}
      </div>

      {(stats.totalKwh != null || stats.totalLiters != null) && (
        <div className="bg-white rounded-lg p-4 text-sm text-slate-700">
          Energie totaal:{" "}
          {stats.totalLiters != null && <strong>{num(stats.totalLiters, 0)} liter</strong>}
          {stats.totalLiters != null && stats.totalKwh != null && " · "}
          {stats.totalKwh != null && <strong>{num(stats.totalKwh, 0)} kWh</strong>}
          {stats.avgPricePerKwh != null && ` · gem. ${eur(stats.avgPricePerKwh, 3)}/kWh`}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactElement }) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-700 mb-3">{title}</h3>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

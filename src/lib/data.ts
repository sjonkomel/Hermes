import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Vehicle, VehicleData, Fillup, Charge, Expense, OdometerReading, RecurringCost } from "../types";

export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error) setVehicles((data as unknown as Vehicle[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { vehicles, loading, refresh };
}

export function useVehicleData(vehicleId: string | null) {
  const [data, setData] = useState<VehicleData>({
    fillups: [],
    charges: [],
    expenses: [],
    odometerReadings: [],
    recurringCosts: [],
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!vehicleId) {
      setData({ fillups: [], charges: [], expenses: [], odometerReadings: [], recurringCosts: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    const [f, c, e, o, r] = await Promise.all([
      supabase.from("fillups").select("*").eq("vehicle_id", vehicleId).order("date"),
      supabase.from("charges").select("*").eq("vehicle_id", vehicleId).order("date"),
      supabase.from("expenses").select("*").eq("vehicle_id", vehicleId).order("date"),
      supabase.from("odometer_readings").select("*").eq("vehicle_id", vehicleId).order("date"),
      supabase.from("recurring_costs").select("*").eq("vehicle_id", vehicleId).order("start_date"),
    ]);
    setData({
      fillups: (f.data as unknown as Fillup[]) ?? [],
      charges: (c.data as unknown as Charge[]) ?? [],
      expenses: (e.data as unknown as Expense[]) ?? [],
      odometerReadings: (o.data as unknown as OdometerReading[]) ?? [],
      recurringCosts: (r.data as unknown as RecurringCost[]) ?? [],
    });
    setLoading(false);
  }, [vehicleId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, refresh };
}

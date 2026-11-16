export type VehicleType = "auto" | "motor" | "overig";
export type EnergyType = "benzine" | "diesel" | "ev" | "hybride";
export type TireSeason = "zomer" | "winter" | "4-seizoenen";

export interface Vehicle {
  id: string;
  name: string;
  type: VehicleType;
  energy: EnergyType;
  purchase_date: string | null;
  purchase_price: number | null;
  start_odo: number | null;
  residual_value: number | null;
  maintenance_reserve: number | null;
  maintenance_reserve_since: string | null;
  active: boolean;
  sold_at: string | null;
  sale_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface Fillup {
  id: string;
  vehicle_id: string;
  date: string;
  odo: number;
  liters: number | null;
  price_per_liter: number | null;
  total_cost: number | null;
  full_tank: boolean;
  tire_season: TireSeason | null;
  has_trailer: boolean;
  has_roof_box: boolean;
  description: string | null;
  note: string | null;
}

export interface Charge {
  id: string;
  vehicle_id: string;
  date: string;
  odo: number | null;
  kwh: number | null;
  price_per_kwh: number | null;
  total_cost: number | null;
  location_type: "thuis" | "publiek" | null;
  tire_season: TireSeason | null;
  has_trailer: boolean;
  has_roof_box: boolean;
  note: string | null;
}

export type ExpenseCategory =
  | "onderhoud"
  | "bandenwissel"
  | "apk"
  | "verzekering"
  | "wegenbelasting"
  | "was"
  | "accessoires"
  | "boete"
  | "parkeren"
  | "tol"
  | "overig";

export interface Expense {
  id: string;
  vehicle_id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
}

export interface OdometerReading {
  id: string;
  vehicle_id: string;
  date: string;
  odo: number;
}

export type RecurringCategory =
  | "wegenbelasting"
  | "verzekering"
  | "afschrijving"
  | "apk"
  | "overig";

export interface RecurringCost {
  id: string;
  vehicle_id: string;
  category: RecurringCategory;
  amount: number;
  frequency: "maandelijks" | "per_kwartaal" | "jaarlijks";
  start_date: string;
  end_date: string | null;
}

export interface VehicleData {
  fillups: Fillup[];
  charges: Charge[];
  expenses: Expense[];
  odometerReadings: OdometerReading[];
  recurringCosts: RecurringCost[];
}

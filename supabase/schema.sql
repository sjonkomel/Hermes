-- Hermes: databasemodel (Supabase / Postgres)
-- Voer dit uit in de Supabase SQL Editor (of via supabase/migrations).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- vehicles
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null default 'auto' check (type in ('auto','motor','overig')),
  energy text not null default 'benzine' check (energy in ('benzine','diesel','ev','hybride')),
  purchase_date date,
  purchase_price numeric(12,2),
  start_odo integer,
  residual_value numeric(12,2),          -- doel-restwaarde (afschrijvingsreserve)
  maintenance_reserve numeric(12,2) default 50,  -- onderhoudsreserve per maand
  maintenance_reserve_since date,                -- start van de onderhoudsreserve
  active boolean not null default true,
  sold_at date,
  sale_price numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- fillups
create table if not exists public.fillups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  date date not null,
  odo integer not null,
  liters numeric(10,3),
  price_per_liter numeric(8,4),
  total_cost numeric(10,2),
  full_tank boolean not null default true,
  tire_season text check (tire_season in ('zomer','winter','4-seizoenen')),
  has_trailer boolean not null default false,
  has_roof_box boolean not null default false,
  description text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- charges (elektrisch laden)
create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  date date not null,
  odo integer,
  kwh numeric(10,3),
  price_per_kwh numeric(8,4),
  total_cost numeric(10,2),
  location_type text check (location_type in ('thuis','publiek')),
  tire_season text,
  has_trailer boolean not null default false,
  has_roof_box boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- expenses (losse kosten)
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  date date not null,
  category text not null check (category in
    ('onderhoud','bandenwissel','apk','verzekering','wegenbelasting','was','accessoires','boete','parkeren','tol','overig')),
  amount numeric(12,2) not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- odometer_readings
create table if not exists public.odometer_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  date date not null,
  odo integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- recurring_costs
-- Vervangt het Apps Script "1e van de maand": bedragswijziging = nieuwe periode.
create table if not exists public.recurring_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  category text not null check (category in ('wegenbelasting','verzekering','afschrijving','apk','overig')),
  amount numeric(12,2) not null,
  frequency text not null default 'maandelijks' check (frequency in ('maandelijks','per_kwartaal','jaarlijks')),
  start_date date not null,
  end_date date,          -- null = loopt nog (of tot verkoopdatum)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fillups_vehicle_idx on public.fillups (vehicle_id, date);
create index if not exists charges_vehicle_idx on public.charges (vehicle_id, date);
create index if not exists expenses_vehicle_idx on public.expenses (vehicle_id, date);
create index if not exists odometer_vehicle_idx on public.odometer_readings (vehicle_id, date);
create index if not exists recurring_vehicle_idx on public.recurring_costs (vehicle_id, start_date);

-- Bestaande database: deze twee regels zijn toevoegingen (safe, idempotent).
alter table public.vehicles add column if not exists maintenance_reserve numeric(12,2) default 50;
alter table public.vehicles add column if not exists maintenance_reserve_since date;

-- user_id wordt automatisch de ingelogde gebruiker (frontend stuurt hem niet mee;
-- de RLS-check draait alsnog en auth.uid() is niet te vervalsen).
alter table public.vehicles            alter column user_id set default auth.uid();
alter table public.fillups            alter column user_id set default auth.uid();
alter table public.charges            alter column user_id set default auth.uid();
alter table public.expenses           alter column user_id set default auth.uid();
alter table public.odometer_readings  alter column user_id set default auth.uid();
alter table public.recurring_costs    alter column user_id set default auth.uid();

-- ---------------------------------------------------------------- RLS: alleen de eigenaar
alter table public.vehicles enable row level security;
alter table public.fillups enable row level security;
alter table public.charges enable row level security;
alter table public.expenses enable row level security;
alter table public.odometer_readings enable row level security;
alter table public.recurring_costs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['vehicles','fillups','charges','expenses','odometer_readings','recurring_costs'] loop
    execute format(
      'create policy %I_select on public.%I for select using (auth.uid() = user_id);', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert with check (auth.uid() = user_id);', t, t);
    execute format(
      'create policy %I_update on public.%I for update using (auth.uid() = user_id);', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete using (auth.uid() = user_id);', t, t);
  end loop;
end $$;

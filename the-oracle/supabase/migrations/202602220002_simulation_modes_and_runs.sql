-- Simulation runs + timeline nodes for dual simulation modes.
-- Safe to run repeatedly.

create extension if not exists pgcrypto;

create table if not exists public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Simulation',
  mode text not null check (mode in ('auto_future', 'manual_step')),
  horizon_preset text not null check (horizon_preset in ('whole_life', '10_years', '1_year', '1_week')),
  status text not null default 'active' check (status in ('active', 'ended')),
  current_day integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  baseline_metrics jsonb not null default '{}'::jsonb,
  latest_metrics jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_simulation_runs_profile_id_updated_at
  on public.simulation_runs (profile_id, updated_at desc);

create table if not exists public.simulation_nodes (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulation_runs(id) on delete cascade,
  profile_id uuid not null references auth.users(id) on delete cascade,
  seq integer not null,
  simulated_date date not null,
  action_type text not null check (
    action_type in ('auto_projection', 'manual_predefined', 'manual_custom', 'system')
  ),
  action_label text not null,
  action_details text null,
  story text not null,
  changelog jsonb not null default '[]'::jsonb,
  metric_deltas jsonb not null default '{}'::jsonb,
  metrics_snapshot jsonb not null default '{}'::jsonb,
  next_options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (simulation_id, seq)
);

create index if not exists idx_simulation_nodes_simulation_id_seq
  on public.simulation_nodes (simulation_id, seq desc);

create index if not exists idx_simulation_nodes_profile_id_created_at
  on public.simulation_nodes (profile_id, created_at desc);

alter table public.simulation_runs enable row level security;
alter table public.simulation_nodes enable row level security;

drop policy if exists simulation_runs_owner_select on public.simulation_runs;
drop policy if exists simulation_runs_owner_insert on public.simulation_runs;
drop policy if exists simulation_runs_owner_update on public.simulation_runs;
drop policy if exists simulation_runs_owner_delete on public.simulation_runs;

create policy simulation_runs_owner_select
  on public.simulation_runs
  for select
  using (auth.uid() = profile_id);

create policy simulation_runs_owner_insert
  on public.simulation_runs
  for insert
  with check (auth.uid() = profile_id);

create policy simulation_runs_owner_update
  on public.simulation_runs
  for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create policy simulation_runs_owner_delete
  on public.simulation_runs
  for delete
  using (auth.uid() = profile_id);

drop policy if exists simulation_nodes_owner_select on public.simulation_nodes;
drop policy if exists simulation_nodes_owner_insert on public.simulation_nodes;
drop policy if exists simulation_nodes_owner_update on public.simulation_nodes;
drop policy if exists simulation_nodes_owner_delete on public.simulation_nodes;

create policy simulation_nodes_owner_select
  on public.simulation_nodes
  for select
  using (auth.uid() = profile_id);

create policy simulation_nodes_owner_insert
  on public.simulation_nodes
  for insert
  with check (auth.uid() = profile_id);

create policy simulation_nodes_owner_update
  on public.simulation_nodes
  for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create policy simulation_nodes_owner_delete
  on public.simulation_nodes
  for delete
  using (auth.uid() = profile_id);

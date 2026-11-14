-- Odyssey caregiver dashboard schema
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- People: the traveler (blind user, role 'user') and the caregiver.
-- A caregiver's id must equal their auth.users id so RLS can recognise them.
create table if not exists public.profiles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text not null check (role in ('user', 'caregiver')),
  created_at timestamptz not null default now()
);

-- One row per FaceTime call. ended_at is null while the call is live.
create table if not exists public.calls (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  summary    text
);
create index if not exists calls_started_at_idx on public.calls (started_at desc);

-- Transcript lines.
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  call_id    uuid not null references public.calls (id) on delete cascade,
  role       text not null check (role in ('user', 'agent')),
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_call_idx on public.messages (call_id, created_at);

-- Haptic glasses events: obstacle (ultrasonic), left/right (guidance buzz), found (target found).
create table if not exists public.alerts (
  id          uuid primary key default gen_random_uuid(),
  call_id     uuid references public.calls (id) on delete cascade,
  type        text not null check (type in ('obstacle', 'left', 'right', 'found')),
  distance_cm integer,
  created_at  timestamptz not null default now()
);
create index if not exists alerts_created_at_idx on public.alerts (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The Node agent writes with the service role key, which bypasses RLS.
-- Signed-in caregivers can read everything and write call summaries.
-- Anonymous visitors see nothing.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.calls    enable row level security;
alter table public.messages enable row level security;
alter table public.alerts   enable row level security;

create or replace function public.is_caregiver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'caregiver'
  );
$$;

drop policy if exists "caregivers read profiles" on public.profiles;
create policy "caregivers read profiles" on public.profiles
  for select to authenticated using (public.is_caregiver() or id = auth.uid());

drop policy if exists "caregivers read calls" on public.calls;
create policy "caregivers read calls" on public.calls
  for select to authenticated using (public.is_caregiver());

drop policy if exists "caregivers update calls" on public.calls;
create policy "caregivers update calls" on public.calls
  for update to authenticated using (public.is_caregiver()) with check (public.is_caregiver());

drop policy if exists "caregivers read messages" on public.messages;
create policy "caregivers read messages" on public.messages
  for select to authenticated using (public.is_caregiver());

drop policy if exists "caregivers read alerts" on public.alerts;
create policy "caregivers read alerts" on public.alerts
  for select to authenticated using (public.is_caregiver());

-- ---------------------------------------------------------------------------
-- Realtime: stream inserts/updates to the dashboard.
-- ---------------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.calls;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.alerts;   exception when duplicate_object then null; end;
end $$;

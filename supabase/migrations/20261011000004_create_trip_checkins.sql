-- Migration 04: Create trip_checkins and legacy checkins tables with consent constraints and RLS
create table if not exists public.trip_checkins (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  checked_in_at timestamptz not null default now(),
  location_consent boolean not null default false,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  location jsonb,
  message text default 'I''m safe',
  type text default 'manual' check (type in ('manual', 'auto', 'im_safe', 'location_update', 'low_battery_warning', 'sos_alert', 'safe_arrival', 'status_update')),
  battery_level integer,
  is_charging boolean,
  created_at timestamptz not null default now()
);

-- Foreign key ensuring trip belongs to the same authenticated user
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_trip_checkins_trip_user'
  ) then
    alter table public.trip_checkins 
      add constraint fk_trip_checkins_trip_user 
      foreign key (trip_id, user_id) 
      references public.trips(id, user_id) 
      on delete cascade;
  end if;
end $$;

-- Enforce consent constraint: latitude & longitude only allowed if location_consent is true
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_checkin_location_consent'
  ) then
    alter table public.trip_checkins
      add constraint chk_checkin_location_consent
      check (location_consent = true or (latitude is null and longitude is null));
  end if;
end $$;

-- Indexes for trip_checkins
create index if not exists idx_trip_checkins_trip_id on public.trip_checkins(trip_id);
create index if not exists idx_trip_checkins_user_id on public.trip_checkins(user_id);
create index if not exists idx_trip_checkins_checked_at on public.trip_checkins(checked_in_at desc);

-- Enable RLS for trip_checkins
alter table public.trip_checkins enable row level security;

-- Policies for trip_checkins
drop policy if exists "Users can view own trip checkins" on public.trip_checkins;
create policy "Users can view own trip checkins"
  on public.trip_checkins for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own trip checkins" on public.trip_checkins;
create policy "Users can insert own trip checkins"
  on public.trip_checkins for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trips t
      where t.id = trip_checkins.trip_id
        and t.user_id = auth.uid()
        and t.status = 'active'
    )
    and (
      location_consent = true
      or (latitude is null and longitude is null)
    )
  );

-- Legacy checkins table (for backward compatibility with existing callers)
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  type text default 'manual',
  battery_level integer,
  is_charging boolean,
  location jsonb,
  message text,
  note text,
  created_at timestamptz not null default now()
);

-- Enable RLS for legacy checkins
alter table public.checkins enable row level security;

drop policy if exists "Users can view own checkins" on public.checkins;
create policy "Users can view own checkins"
  on public.checkins for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own checkins" on public.checkins;
create policy "Users can insert own checkins"
  on public.checkins for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trips t
      where t.id = checkins.trip_id
        and t.user_id = auth.uid()
    )
  );

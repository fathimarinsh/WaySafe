-- =====================================================================
-- WaySafe - Master Supabase Database Schema & Row-Level Security (RLS)
-- =====================================================================
-- Run this script in your Supabase Dashboard:
-- 1. Go to https://supabase.com/dashboard -> Your Project -> SQL Editor
-- 2. Click "New query", paste this file's contents, and click "Run"
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES TABLE
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Policies for Profiles
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-profile creation trigger when new user signs up in auth.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, created_at, updated_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'display_name', ''),
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. CONTACTS TABLE
-- ---------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  phone text not null,
  relationship text default 'Emergency Contact',
  is_primary boolean default false,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_contacts_id_user unique (id, user_id)
);

-- Ensure unique constraint exists for composite foreign keys on existing tables
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_contacts_id_user'
  ) then
    alter table public.contacts add constraint uq_contacts_id_user unique (id, user_id);
  end if;
end $$;

-- Indexes for contacts
create index if not exists idx_contacts_user_id on public.contacts(user_id);
create index if not exists idx_contacts_created_at on public.contacts(created_at desc);

-- Enable RLS
alter table public.contacts enable row level security;

-- Policies for contacts
drop policy if exists "Users can view own contacts" on public.contacts;
create policy "Users can view own contacts"
  on public.contacts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own contacts" on public.contacts;
create policy "Users can insert own contacts"
  on public.contacts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own contacts" on public.contacts;
create policy "Users can update own contacts"
  on public.contacts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own contacts" on public.contacts;
create policy "Users can delete own contacts"
  on public.contacts for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 3. TRIPS TABLE
-- ---------------------------------------------------------------------
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  trip_name text,
  title text, -- compatibility alias
  start_location jsonb,
  destination jsonb not null,
  departure_time timestamptz,
  estimated_arrival timestamptz,
  trusted_contact_id uuid references public.contacts(id) on delete set null,
  location_sharing_consent boolean not null default false,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'cancelled')),
  transport_mode text default 'transit',
  emergency_notes text,
  initial_battery integer,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_check_in_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint uq_trips_id_user unique (id, user_id)
);

-- Migrations for existing deployments:
alter table public.trips add column if not exists trip_name text;
alter table public.trips add column if not exists title text;
alter table public.trips add column if not exists start_location jsonb;
alter table public.trips add column if not exists departure_time timestamptz;
alter table public.trips add column if not exists estimated_arrival timestamptz;
alter table public.trips add column if not exists trusted_contact_id uuid references public.contacts(id) on delete set null;
alter table public.trips add column if not exists location_sharing_consent boolean not null default false;
alter table public.trips add column if not exists status text not null default 'planned';
alter table public.trips add column if not exists started_at timestamptz;
alter table public.trips add column if not exists completed_at timestamptz;
alter table public.trips add column if not exists last_check_in_at timestamptz;

-- Ensure unique constraint exists for composite foreign keys on existing tables
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_trips_id_user'
  ) then
    alter table public.trips add constraint uq_trips_id_user unique (id, user_id);
  end if;
end $$;

-- Enforce trusted contact ownership constraint: trusted contact MUST belong to same user
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_trips_trusted_contact_user'
  ) then
    alter table public.trips 
      add constraint fk_trips_trusted_contact_user 
      foreign key (trusted_contact_id, user_id) 
      references public.contacts(id, user_id) 
      on delete set null;
  end if;
end $$;

-- Helpful Indexes
create index if not exists idx_trips_user_id on public.trips(user_id);
create index if not exists idx_trips_user_status on public.trips(user_id, status);
create index if not exists idx_trips_created_at on public.trips(created_at desc);

-- Enable RLS
alter table public.trips enable row level security;

-- Policies for Trips
drop policy if exists "Users can view own trips" on public.trips;
create policy "Users can view own trips"
  on public.trips for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own trips" on public.trips;
create policy "Users can insert own trips"
  on public.trips for insert
  with check (
    auth.uid() = user_id
    and (
      trusted_contact_id is null
      or exists (
        select 1 from public.contacts c
        where c.id = trips.trusted_contact_id and c.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can update own trips" on public.trips;
create policy "Users can update own trips"
  on public.trips for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      trusted_contact_id is null
      or exists (
        select 1 from public.contacts c
        where c.id = trips.trusted_contact_id and c.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users can delete own trips" on public.trips;
create policy "Users can delete own trips"
  on public.trips for delete
  using (auth.uid() = user_id);

-- Enforce status transition restrictions at database level
create or replace function public.validate_trip_status_transition()
returns trigger as $$
begin
  -- Prevent user_id tampering
  if new.user_id <> old.user_id then
    raise exception 'Cannot reassign trip ownership';
  end if;

  if old.status is distinct from new.status then
    -- Completed and Cancelled are terminal states
    if old.status = 'completed' then
      raise exception 'Trip is already completed and cannot transition to %', new.status;
    end if;

    if old.status = 'cancelled' then
      raise exception 'Trip is already cancelled and cannot transition to %', new.status;
    end if;

    -- Cannot jump from planned directly to completed without starting
    if old.status = 'planned' and new.status = 'completed' then
      raise exception 'Cannot complete a planned trip that has not been started';
    end if;

    -- Cannot revert active trip back to planned
    if old.status = 'active' and new.status = 'planned' then
      raise exception 'Cannot revert an active trip back to planned';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_validate_trip_status on public.trips;
create trigger trg_validate_trip_status
  before update on public.trips
  for each row
  execute function public.validate_trip_status_transition();

-- ---------------------------------------------------------------------
-- 4. TRIP CHECKINS TABLE
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 5. LEGACY CHECKINS TABLE (Backward compatibility)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 6. SECURITY LOCKDOWN & LEAST-PRIVILEGE GRANTS
-- ---------------------------------------------------------------------
revoke all on public.profiles from anon, public;
revoke all on public.contacts from anon, public;
revoke all on public.trips from anon, public;
revoke all on public.trip_checkins from anon, public;
revoke all on public.checkins from anon, public;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert on public.trip_checkins to authenticated;
grant select, insert on public.checkins to authenticated;

grant all on public.profiles to service_role;
grant all on public.contacts to service_role;
grant all on public.trips to service_role;
grant all on public.trip_checkins to service_role;
grant all on public.checkins to service_role;

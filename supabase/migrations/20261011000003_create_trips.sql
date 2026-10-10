-- Migration 03: Create trips table, ownership foreign keys, status trigger, and RLS policies
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

-- Enforce trusted contact ownership constraint
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

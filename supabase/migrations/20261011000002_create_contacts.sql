-- Migration 02: Create contacts table, indexes, and RLS policies
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

-- Indexes
create index if not exists idx_contacts_user_id on public.contacts(user_id);
create index if not exists idx_contacts_created_at on public.contacts(created_at desc);

-- Enable RLS
alter table public.contacts enable row level security;

-- Policies
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

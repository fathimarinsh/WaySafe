-- Migration 05: Comprehensive RLS Verification & Security Lockdown
-- Ensures every public table containing user data has RLS enabled with no public bypasses

-- 1. Ensure RLS is enabled across all tables
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.trips enable row level security;
alter table public.trip_checkins enable row level security;
alter table public.checkins enable row level security;

-- 2. Revoke all default public permissions (Principle of Least Privilege)
revoke all on public.profiles from anon, public;
revoke all on public.contacts from anon, public;
revoke all on public.trips from anon, public;
revoke all on public.trip_checkins from anon, public;
revoke all on public.checkins from anon, public;

-- 3. Grant specific permissions only to authenticated users (evaluated strictly via RLS policies)
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert on public.trip_checkins to authenticated;
grant select, insert on public.checkins to authenticated;

-- 4. Grant service_role full administrative access for background maintenance
grant all on public.profiles to service_role;
grant all on public.contacts to service_role;
grant all on public.trips to service_role;
grant all on public.trip_checkins to service_role;
grant all on public.checkins to service_role;

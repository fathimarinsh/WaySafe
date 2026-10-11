-- Migration 06: Emergency Trip QR Code & Public Sharing
-- Adds random unguessable share_token, expiry, revocation, consent settings, and security definer query function

alter table public.trips add column if not exists share_token text unique;
alter table public.trips add column if not exists share_token_expires_at timestamptz;
alter table public.trips add column if not exists share_settings jsonb default '{"share_location": true, "share_contact": true, "share_eta": true, "display_name": ""}'::jsonb;
alter table public.trips add column if not exists share_revoked boolean default false;

create index if not exists idx_trips_share_token on public.trips(share_token);

-- Security Definer function to return sanitized emergency trip information for public QR scanning
create or replace function public.get_public_emergency_trip(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
  v_contact record;
  v_latest_checkin record;
  v_profile record;
  v_result jsonb;
  v_settings jsonb;
  v_traveller_name text;
begin
  if p_share_token is null or trim(p_share_token) = '' then
    return null;
  end if;

  select * into v_trip
  from public.trips
  where share_token = p_share_token;

  if not found then
    return null;
  end if;

  -- Check if expired, revoked, or trip ended
  if v_trip.share_revoked = true then
    return jsonb_build_object(
      'expired', true,
      'status', 'revoked',
      'reason', 'This emergency trip sharing link has been revoked by the traveler.'
    );
  end if;

  if v_trip.status in ('completed', 'cancelled') then
    return jsonb_build_object(
      'expired', true,
      'status', v_trip.status,
      'completed_at', v_trip.completed_at,
      'reason', 'This emergency trip has concluded safely. Live emergency telemetry is deactivated.'
    );
  end if;

  if v_trip.share_token_expires_at is not null and now() > v_trip.share_token_expires_at then
    return jsonb_build_object(
      'expired', true,
      'status', 'expired',
      'reason', 'This emergency sharing link has expired.'
    );
  end if;

  v_settings := coalesce(v_trip.share_settings, '{"share_location": true, "share_contact": true, "share_eta": true}'::jsonb);

  -- Determine display name (prefer consent setting display_name, fallback to profile, then generic)
  select full_name into v_profile from public.profiles where id = v_trip.user_id;
  v_traveller_name := coalesce(nullif(v_settings->>'display_name', ''), v_profile.full_name, 'WaySafe Traveler');

  -- Fetch contact only if explicit consent is granted and contact is linked
  if (v_settings->>'share_contact')::boolean is not false and v_trip.trusted_contact_id is not null then
    select name, phone, relationship into v_contact
    from public.contacts
    where id = v_trip.trusted_contact_id and user_id = v_trip.user_id;
  end if;

  -- Fetch last location only if explicit consent is granted and user agreed to location sharing
  if (v_settings->>'share_location')::boolean is not false and v_trip.location_sharing_consent is true then
    select latitude, longitude, checked_in_at into v_latest_checkin
    from public.trip_checkins
    where trip_id = v_trip.id and latitude is not null and longitude is not null
    order by checked_in_at desc
    limit 1;
  end if;

  -- Construct strictly sanitized public response
  v_result := jsonb_build_object(
    'expired', false,
    'id', v_trip.id,
    'trip_name', coalesce(v_trip.trip_name, v_trip.title, 'Emergency Travel Journey'),
    'traveller_name', v_traveller_name,
    'start_location', v_trip.start_location,
    'destination', v_trip.destination,
    'status', v_trip.status,
    'departure_time', v_trip.departure_time,
    'estimated_arrival', case when (v_settings->>'share_eta')::boolean is not false then v_trip.estimated_arrival else null end,
    'started_at', v_trip.started_at,
    'last_check_in_at', v_trip.last_check_in_at,
    'transport_mode', v_trip.transport_mode,
    'emergency_notes', v_trip.emergency_notes,
    'share_expires_at', v_trip.share_token_expires_at
  );

  if v_contact.name is not null then
    v_result := jsonb_set(v_result, '{emergency_contact}', jsonb_build_object(
      'name', v_contact.name,
      'phone', v_contact.phone,
      'relationship', v_contact.relationship
    ));
  end if;

  if v_latest_checkin.latitude is not null then
    v_result := jsonb_set(v_result, '{last_location}', jsonb_build_object(
      'latitude', v_latest_checkin.latitude,
      'longitude', v_latest_checkin.longitude,
      'recorded_at', v_latest_checkin.checked_in_at
    ));
  end if;

  return v_result;
end;
$$;

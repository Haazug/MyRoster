-- v2.2.5. Run once in the Supabase SQL editor. Access is only through authenticated server endpoints.
create table if not exists public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique,
 subscription jsonb not null,
 preferences jsonb not null default '{"checkin":true,"doors":true,"due":true,"disembark":true,"cancelled":true}'::jsonb,
 language text not null default 'en' check (language in ('en','pt','it','fr','es')),
 vapid_public_key text not null,
 last_checked_at timestamptz not null default '1970-01-01',
 updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_dispatch on public.push_subscriptions(last_checked_at);
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id);
create table if not exists public.push_deliveries (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 booking_id text not null, scheduled_at bigint not null, stage text not null,
 lease uuid not null, leased_at timestamptz not null default now(),
 sent_at timestamptz, attempts integer not null default 1,
 next_attempt_at timestamptz not null default now(),
 unique(subscription_id,booking_id,scheduled_at,stage)
);
create table if not exists public.push_dispatch_state (
 id integer primary key check(id=1), last_success_at timestamptz
);
insert into public.push_dispatch_state(id) values(1) on conflict do nothing;
alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
alter table public.push_dispatch_state enable row level security;
revoke all on public.push_subscriptions,public.push_deliveries,public.push_dispatch_state from public,anon,authenticated;
grant all on public.push_subscriptions,public.push_deliveries,public.push_dispatch_state to service_role;

-- Atomic renewable lease + current booking validation. Concurrent cron calls cannot claim the same reminder.
create or replace function public.claim_push_delivery(sub_id uuid,trip_id text,departure_at bigint,event_stage text)
returns uuid language plpgsql security definer set search_path=public as $$
declare lease_id uuid:=gen_random_uuid(); claimed uuid; sub public.push_subscriptions; booking jsonb; due_stage text; delta bigint;
begin
 select * into sub from public.push_subscriptions where id=sub_id;
 if not found then return null; end if;
 if event_stage='test' then
  if departure_at<>(floor(extract(epoch from now())/60)*60000)::bigint or trip_id<>'test' then return null; end if;
 else
  if event_stage not in ('checkin','doors','due','disembark','cancelled') or sub.preferences->event_stage='false'::jsonb then return null; end if;
  select b into booking from public.user_data d,
   lateral jsonb_array_elements(case when jsonb_typeof(d.value)='array' then d.value else '[]'::jsonb end) b
   where d.user_id=sub.user_id and d.key='myroster.bookings' and b->>'id'=trip_id limit 1;
  if booking is null or booking->>'scheduledAt' is distinct from departure_at::text then return null; end if;
  if coalesce(booking->>'takeoffAt','') not in ('','0') or coalesce(booking->>'endedAt','') not in ('','0') or booking->>'status'='completed' then return null; end if;
  if booking->>'status'='cancelled' and coalesce(booking->>'cancellationReason','')<>'missed-departure' then return null; end if;
  -- Preserve legacy actual starts, while a preflight startedAt is not departure evidence.
  if not (booking ? 'takeoffAt') and coalesce(booking->>'startedAt','') not in ('','0') and coalesce(booking->>'status','') not in ('scheduled','delayed') then return null; end if;
  delta:=(extract(epoch from now())*1000)::bigint-departure_at;
  if delta < -3600000 or delta > 86400000 then return null; end if;
  due_stage:=case when delta>=10800000 then 'cancelled' when delta>=1500000 then 'disembark' when delta>=0 then 'due' when delta>=-1800000 then 'doors' else 'checkin' end;
  if event_stage<>due_stage then return null; end if;
 end if;
 insert into public.push_deliveries as delivery(subscription_id,booking_id,scheduled_at,stage,lease)
  values(sub_id,trip_id,departure_at,event_stage,lease_id)
  on conflict(subscription_id,booking_id,scheduled_at,stage) do update
   set lease=excluded.lease,leased_at=now(),attempts=delivery.attempts+1
   where delivery.sent_at is null and delivery.attempts<5 and delivery.leased_at<now()-interval '2 minutes' and delivery.next_attempt_at<=now()
  returning lease into claimed;
 return claimed;
end; $$;
revoke all on function public.claim_push_delivery(uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.claim_push_delivery(uuid,text,bigint,text) to service_role;

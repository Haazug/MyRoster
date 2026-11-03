create table if not exists public.custom_airlines(
 id uuid primary key default gen_random_uuid(),
 owner uuid not null references auth.users(id) on delete cascade,
 owner_name text check (owner_name is null or char_length(owner_name)<=40),
 name text not null check (char_length(name) between 2 and 40),
 initials text not null check (initials ~ '^[A-Z0-9]{1,3}$'),
 shape text not null default 'circle' check (shape in ('circle','square','shield','diamond')),
 color1 text not null check (color1 ~ '^#[0-9a-fA-F]{6}$'),
 color2 text not null check (color2 ~ '^#[0-9a-fA-F]{6}$'),
 hub text not null check (hub ~ '^[A-Z]{3}$'),
 routes jsonb not null check (jsonb_typeof(routes)='array' and jsonb_array_length(routes) between 1 and 60),
 hidden boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.saved_airlines(
 user_id uuid not null references auth.users(id) on delete cascade,
 airline_id uuid not null references public.custom_airlines(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,airline_id)
);
create table if not exists public.airline_reports(
 airline_id uuid not null references public.custom_airlines(id) on delete cascade,
 reporter uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(airline_id,reporter)
);
alter table public.custom_airlines enable row level security;
alter table public.saved_airlines enable row level security;
alter table public.airline_reports enable row level security;

drop policy if exists ca_select on public.custom_airlines;
drop policy if exists ca_insert on public.custom_airlines;
drop policy if exists ca_update on public.custom_airlines;
drop policy if exists ca_delete on public.custom_airlines;
drop policy if exists sa_own on public.saved_airlines;
drop policy if exists ar_insert on public.airline_reports;
create policy ca_select on public.custom_airlines for select to anon,authenticated using (hidden=false or owner=auth.uid());
create policy ca_insert on public.custom_airlines for insert to authenticated with check (owner=auth.uid() and hidden=false);
create policy ca_update on public.custom_airlines for update to authenticated using (owner=auth.uid() and hidden=false) with check (owner=auth.uid() and hidden=false);
create policy ca_delete on public.custom_airlines for delete to authenticated using (owner=auth.uid());
create policy sa_own on public.saved_airlines for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy ar_insert on public.airline_reports for insert to authenticated with check (reporter=auth.uid());

grant select on public.custom_airlines to anon,authenticated;
grant insert,update,delete on public.custom_airlines to authenticated;
grant select,insert,update,delete on public.saved_airlines to authenticated;
grant insert on public.airline_reports to authenticated;

create or replace function public.custom_airlines_limit() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (select count(*) from public.custom_airlines where owner=new.owner)>=5 then raise exception 'limit'; end if;
 return new;
end $$;
drop trigger if exists custom_airlines_limit on public.custom_airlines;
create trigger custom_airlines_limit before insert on public.custom_airlines for each row execute function public.custom_airlines_limit();

create or replace function public.airline_reports_hide() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (select count(*) from public.airline_reports where airline_id=new.airline_id)>=3 then
  update public.custom_airlines set hidden=true where id=new.airline_id;
 end if;
 return null;
end $$;
drop trigger if exists airline_reports_hide on public.airline_reports;
create trigger airline_reports_hide after insert on public.airline_reports for each row execute function public.airline_reports_hide();

-- Run AFTER the v2.2.5 migration, deployment and server environment setup.
-- This scheduler belongs in Supabase; no paid Vercel cron plan is required.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- First create these TWO secrets in Supabase → Vault:
-- myroster_push_url   = https://YOUR-PRODUCTION-DOMAIN/api/push/dispatch
-- myroster_push_token = the EXACT value of PUSH_CRON_SECRET on your server
-- Do not put the VAPID private key here; it stays in the hosting environment.

-- Prevent duplicate cron jobs if this block is run again.
do $$
declare job bigint;
begin
 if not exists(select 1 from vault.decrypted_secrets where name='myroster_push_url')
  or not exists(select 1 from vault.decrypted_secrets where name='myroster_push_token') then
  raise exception 'Create myroster_push_url and myroster_push_token in Vault first';
 end if;
 for job in select jobid from cron.job where jobname='myroster-push-every-minute' loop
  perform cron.unschedule(job);
 end loop;
end;
$$;

select cron.schedule(
 'myroster-push-every-minute',
 '* * * * *',
 $task$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='myroster_push_url' limit 1),
  headers := jsonb_build_object(
   'Content-Type','application/json',
   'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='myroster_push_token' limit 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 55000
 );
 $task$
);

-- Check after 1–2 minutes:
-- select * from public.push_dispatch_state;
-- select jobname,active,schedule from cron.job where jobname='myroster-push-every-minute';
-- For HTTP responses: select status_code,created from net._http_response order by created desc limit 5;
-- To stop reminders: select cron.unschedule('myroster-push-every-minute');

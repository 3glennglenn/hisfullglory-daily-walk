-- Push notifications, part 2: the schedule. Hosted project only; it needs pg_cron, pg_net and
-- Vault, which the local test database does not have. Approved by the founder on 2026-10-14
-- ("akkoord week 1"); its hosted history lists it as version 20261014195308, name push_schedule.
-- Apply after 010 and after deploying supabase/functions/push-sender
-- (without JWT verification: the shared secret below protects it).
--
-- Three Vault secrets are created by hand, never in this repository:
--   push_vapid_public, push_vapid_private  (the Web Push key pair; the public half is also
--                                           in src/config.ts, which is fine: it is public)
--   push_cron_secret                       (a random string shared by this job and the sender)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- What the sender needs, read from Vault. Only the service role may call it.
create or replace function public.push_settings() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
  'vapid_public',(select decrypted_secret from vault.decrypted_secrets where name='push_vapid_public'),
  'vapid_private',(select decrypted_secret from vault.decrypted_secrets where name='push_vapid_private'),
  'cron_secret',(select decrypted_secret from vault.decrypted_secrets where name='push_cron_secret'),
  'contact','mailto:support@hisfullglory.com')
$$;
revoke all on function public.push_settings() from public,anon,authenticated;
grant execute on function public.push_settings() to service_role;

-- Every five minutes: ask the sender to send what is due.
select cron.unschedule(jobid) from cron.job where jobname='push-sender';
select cron.schedule('push-sender','*/5 * * * *',$job$
 select net.http_post(
  url:='https://fccwqguqhnbayuowmamy.supabase.co/functions/v1/push-sender',
  headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',
   (select decrypted_secret from vault.decrypted_secrets where name='push_cron_secret')),
  body:='{}'::jsonb)
$job$);

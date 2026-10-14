-- Push notifications: a daily reminder for the Daily Walk and "someone prayed for you".
-- From the research of 2026-10-14; approved by the founder that day ("akkoord week 1").
-- Forward-only and safe to apply twice; apply after 009. Applied to the hosted project on
-- 2026-10-14; its history lists it as version 20261014195226, name push. It was written as 009,
-- but 009_rls_auto_enable_grants (branch lock-rls-auto-enable) reached the hosted project first.
--
-- A notification never contains what anyone wrote: the texts are fixed in
-- supabase/functions/push-sender. Guests can have a daily reminder; "someone prayed for you"
-- needs an account. The sender runs every five minutes (011_push_schedule.sql, hosted only).
begin;
create table if not exists public.push_subscriptions(
 -- Only the push services browsers use, so the sender never posts anywhere else.
 endpoint text primary key check(char_length(endpoint)<=1000 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com)/'),
 p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{60,120}$'),
 auth text not null check(auth ~ '^[A-Za-z0-9_-]{16,44}$'),
 user_id uuid references auth.users on delete cascade,
 daily boolean not null default true,
 reminder_time time not null default '07:30' check(reminder_time between '05:00' and '22:00'),
 time_zone text not null default 'UTC' check(char_length(time_zone) between 1 and 64),
 prayed_for boolean not null default false check(not prayed_for or user_id is not null),
 last_daily_on date,
 last_prayed_for_at timestamptz,
 last_test_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists push_user on public.push_subscriptions(user_id) where user_id is not null;
create table if not exists public.push_outbox(
 id uuid primary key default gen_random_uuid(),
 endpoint text not null references public.push_subscriptions on delete cascade,
 kind text not null check(kind in('prayed_for','test')),
 created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;
revoke all on public.push_subscriptions,public.push_outbox from public,anon,authenticated;

-- Turning reminders on or changing them, for guests and signed-in users alike.
create or replace function public.save_push_subscription(sub_endpoint text,sub_p256dh text,sub_auth text,wants_daily boolean,at_time time,zone text,wants_prayed_for boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'Unknown time zone';end if;
 if wants_prayed_for and auth.uid() is null then raise exception 'Sign in to hear when someone prays for you';end if;
 insert into public.push_subscriptions(endpoint,p256dh,auth,user_id,daily,reminder_time,time_zone,prayed_for)
 values(sub_endpoint,sub_p256dh,sub_auth,auth.uid(),wants_daily,at_time,zone,wants_prayed_for)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,user_id=excluded.user_id,
  daily=excluded.daily,reminder_time=excluded.reminder_time,time_zone=excluded.time_zone,
  prayed_for=excluded.prayed_for,updated_at=now();
end $$;

create or replace function public.remove_push_subscription(sub_endpoint text) returns void language sql security definer set search_path='' as $$
 delete from public.push_subscriptions where endpoint=sub_endpoint
$$;

-- "Send me a test", at most once every ten minutes per device.
create or replace function public.request_test_push(sub_endpoint text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.push_subscriptions set last_test_at=now()
 where endpoint=sub_endpoint and (last_test_at is null or last_test_at<now()-interval '10 minutes');
 if not found then return false;end if;
 insert into public.push_outbox(endpoint,kind) values(sub_endpoint,'test');
 return true;
end $$;

-- Someone pressed "praying" on a prayer: tell its author, at most once an hour per device.
create or replace function public.queue_prayed_for(author uuid,reactor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if author is null or author=reactor then return;end if;
 with marked as(
  update public.push_subscriptions set last_prayed_for_at=now()
  where user_id=author and prayed_for and (last_prayed_for_at is null or last_prayed_for_at<now()-interval '1 hour')
  returning endpoint
 ) insert into public.push_outbox(endpoint,kind) select endpoint,'prayed_for' from marked;
end $$;
create or replace function public.push_after_prayer_reaction() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.queue_prayed_for((select p.user_id from public.community_posts p where p.id=new.post_id and p.post_type='prayer'),new.user_id);
 return new;
end $$;
create or replace function public.push_after_wall_reaction() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.queue_prayed_for((select p.user_id from public.prayer_posts p where p.id=new.post_id and p.post_type='prayer'),new.user_id);
 return new;
end $$;
drop trigger if exists push_prayed_for on public.community_reactions;
create trigger push_prayed_for after insert on public.community_reactions for each row when(new.reaction='praying') execute function public.push_after_prayer_reaction();
drop trigger if exists push_prayed_for on public.prayer_reactions;
create trigger push_prayed_for after insert on public.prayer_reactions for each row execute function public.push_after_wall_reaction();

-- For the sender only: what is due now. Daily reminders go out in the half hour after the
-- chosen time, once a day in the reader's own time zone. Claimed rows are marked or removed,
-- so a second run does not send them again.
create or replace function public.claim_push_batch() returns table(endpoint text,p256dh text,auth text,kind text) language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
begin
 return query
 with due as(
  update public.push_subscriptions s set last_daily_on=(now() at time zone s.time_zone)::date
  where s.daily
   and (s.last_daily_on is null or s.last_daily_on<(now() at time zone s.time_zone)::date)
   and (now() at time zone s.time_zone)::time>=s.reminder_time
   and (now() at time zone s.time_zone)::time<s.reminder_time+interval '30 minutes'
  returning s.endpoint,s.p256dh,s.auth
 ),queued as(
  delete from public.push_outbox o returning o.endpoint,o.kind
 )
 select d.endpoint,d.p256dh,d.auth,'daily'::text from due d
 union all
 select s.endpoint,s.p256dh,s.auth,q.kind from queued q join public.push_subscriptions s on s.endpoint=q.endpoint;
end $$;
-- A push service said this device is gone (HTTP 404 or 410).
create or replace function public.drop_push_subscription(sub_endpoint text) returns void language sql security definer set search_path='' as $$
 delete from public.push_subscriptions where endpoint=sub_endpoint
$$;

revoke all on function public.save_push_subscription(text,text,text,boolean,time,text,boolean),public.remove_push_subscription(text),
 public.request_test_push(text),public.queue_prayed_for(uuid,uuid),public.push_after_prayer_reaction(),public.push_after_wall_reaction(),
 public.claim_push_batch(),public.drop_push_subscription(text) from public,anon,authenticated;
grant execute on function public.save_push_subscription(text,text,text,boolean,time,text,boolean),public.remove_push_subscription(text),
 public.request_test_push(text) to anon,authenticated;
grant execute on function public.claim_push_batch(),public.drop_push_subscription(text) to service_role;
commit;

-- claim_push_batch from 010 emptied the outbox with a DELETE without WHERE. Supabase's API
-- refuses such a statement (pg_safeupdate), so push-sender got a 400 and sent nothing.
-- Same function, with an explicit "where true".
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
  delete from public.push_outbox o where true returning o.endpoint,o.kind
 )
 select d.endpoint,d.p256dh,d.auth,'daily'::text from due d
 union all
 select s.endpoint,s.p256dh,s.auth,q.kind from queued q join public.push_subscriptions s on s.endpoint=q.endpoint;
end $$;
revoke all on function public.claim_push_batch() from public,anon,authenticated;
grant execute on function public.claim_push_batch() to service_role;

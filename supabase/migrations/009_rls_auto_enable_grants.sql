-- Takes the API's EXECUTE grant away from public.rls_auto_enable(). Forward-only and safe to apply
-- twice; apply after 008. Changes no function body, no other function and no event trigger.
-- Applied to the hosted project on 2026-10-14 with the founder's approval; its history lists it as
-- version 20261014193724, name rls_auto_enable_grants. It was written as 008, but 008_word_filter
-- (branch word-filter) reached the hosted project eleven minutes earlier, so this is 009.
--
-- Where the function comes from: no migration in this repo creates it. The hosted project has had
-- it, with the event trigger `ensure_rls` (on ddl_command_end), since before migration 001: their
-- object ids are lower than those of every function 001 creates. Its body is, word for word, the
-- "Auto-enable RLS for new tables" example in Supabase's Row Level Security guide: after every
-- CREATE TABLE, CREATE TABLE AS or SELECT INTO it enables RLS on the new tables in `public`.
-- A database built only from these files therefore has neither the function nor the trigger,
-- which is why this migration skips the revoke when the function is missing.
--
-- Why revoke: the function is SECURITY DEFINER, owned by postgres, and kept Postgres's default
-- EXECUTE grant to PUBLIC, so the security advisor (lints 0028 and 0029) lists it as callable by
-- guests and signed-in users at /rest/v1/rpc/rls_auto_enable. A direct call only gets an error,
-- because PL/pgSQL runs a function returning event_trigger only when an event trigger fires it,
-- and the function can only switch RLS on, never off. No API caller needs it, so the grant goes.
-- service_role only had it through PUBLIC and loses it too; nothing calls it directly.
--
-- The event trigger keeps working: Postgres checks no EXECUTE privilege when an event trigger
-- fires its function, and the owner keeps its own rights. tests/rls-auto-enable-schema.test.mjs
-- checks the grants, the direct call and the trigger on PGlite with the hosted definition.
do $$
begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;

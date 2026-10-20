-- The terms version people accept. The legal texts the founder approved on 2026-10-19 (pull
-- request #27) change what a person agrees to (minimum age, links, reports reviewed by a
-- person), so everyone who accepted the earlier version 2026-10-07 is asked once to accept
-- the new one before publishing again (GATE-02, GATE-03).
-- Forward-only and safe to apply twice; apply after 013. Founder approval: 2026-10-20
-- ("akkoord migratie 014"); to be applied to the hosted project with the hosted name
-- terms_version. Apply it right after the pull request that sets TERMS_VERSION to
-- 2026-10-19 (branch terms-014) is on main and its production build is live, never
-- before: this file makes the database expect the new
-- version, so an app that still sends 2026-10-07 can no longer accept the rules. Applied
-- long after, a new app could not accept them either.
--
-- What this file does:
--  1. Adds public.current_terms_version(), the one place in the database that names the
--     version in force: the founder's approval date, 2026-10-19. It takes no input and reads
--     no table. Anyone may call it (anon and authenticated), because the version is printed
--     on the public terms page anyway.
--  2. Redefines public.accept_community_terms(terms_version text) and public.require_terms()
--     with the same signatures, messages and grants as in 001, comparing with
--     public.current_terms_version() instead of the literal '2026-10-07'. After this, an
--     acceptance of the old version is refused ('Current terms and authentication required')
--     and an account that accepted only the old version gets 'Accept current community rules
--     before publishing' until it accepts the new one.
--     public.legacy_terms_guard() and every other caller of require_terms (posts, prayer
--     updates, support requests, topics, Circles, chat, prayer wall) are not touched: they
--     call require_terms, so they follow the new version at once.
--
-- No data changes. Old community_terms rows stay as the record of what was accepted when.
-- The app constant TERMS_VERSION (src/platform/auth.tsx) and termsVersion
-- (site/src/data/legal.ts) must hold the same date; tests/terms-version-schema.test.mjs and
-- site/tests/legal.test.ts keep them equal. A later terms change needs a new migration like
-- this one, with the new date in current_terms_version().
-- Runbook: docs/MIGRATIONS.md, 014 terms version
begin;

create or replace function public.current_terms_version() returns text language sql immutable security definer set search_path='' as $$select '2026-10-19'::text$$;
revoke all on function public.current_terms_version() from public,anon,authenticated;
grant execute on function public.current_terms_version() to anon,authenticated;

create or replace function public.accept_community_terms(terms_version text) returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or terms_version is distinct from public.current_terms_version() then raise exception 'Current terms and authentication required';end if;
insert into public.community_terms(user_id,version) values(auth.uid(),terms_version) on conflict do nothing;end $$;
create or replace function public.require_terms() returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not exists(select 1 from public.community_terms where user_id=auth.uid() and version=public.current_terms_version()) then raise exception 'Accept current community rules before publishing';end if;end $$;

-- Same grants as 001 (create or replace keeps them; stated again so this file stands alone).
revoke all on function public.accept_community_terms(text),public.require_terms() from public,anon,authenticated;
grant execute on function public.accept_community_terms(text) to authenticated;

commit;

-- Account deletion, which the App Store and Google Play both require. Forward-only and safe to
-- apply twice; apply after 006. Not applied to the hosted project without the founder's approval.
--
-- Deleting the auth user removes everything the server holds for it: every foreign key to
-- auth.users cascades (checked on the hosted project on 2026-10-14: profiles, legacy chat and
-- prayer tables, community posts, reactions, reports, blocks, terms, memberships, votes, limits,
-- support requests, Circles and Circle memberships). Two consequences the app states before the
-- user confirms: replies other people wrote under the user's posts go with those posts, and
-- Circles the user owns close, because a Circle's owner cannot change in v1.
-- The user's access token stays valid until it expires, so the app signs out right after.
begin;
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 delete from auth.users where id=auth.uid();
end $$;
revoke all on function public.delete_my_account() from public,anon,authenticated;
grant execute on function public.delete_my_account() to authenticated;
commit;

-- Word filter. The App Store asks apps with user content for a way to filter objectionable
-- material before it is posted (guideline 1.2); reporting and blocking already exist.
-- Forward-only and safe to apply twice; apply after 007. The founder approved it on
-- 2026-10-14 ("akkoord week 1").
--
-- Words people commonly read in older Bible translations (whore, ass, piss, bastard, cock,
-- hell, damn) are deliberately not on the list, and neither are words survivors need to be
-- able to use (rape, abuse). Terms match whole words only, case-insensitively, so a word
-- inside another word is never caught. Add terms with
--   insert into public.blocked_terms(term) values ('...') on conflict do nothing;
begin;
create table if not exists public.blocked_terms(
 term text primary key check(term ~ '^[a-z][a-z '' -]*[a-z]$' and char_length(term) between 2 and 40)
);
alter table public.blocked_terms enable row level security;
revoke all on public.blocked_terms from public,anon,authenticated;
insert into public.blocked_terms(term) values
 ('fuck'),('fucks'),('fucked'),('fucker'),('fucking'),('motherfucker'),
 ('shit'),('shitty'),('bullshit'),('bitch'),('bitches'),('cunt'),('dick'),('pussy'),
 ('slut'),('asshole'),('twat'),('wanker'),
 ('nigger'),('niggers'),('nigga'),('faggot'),('faggots'),('fag'),('retard'),('retarded'),
 ('kike'),('spic'),('chink'),('tranny'),
 ('porn'),('porno'),('pornhub'),('blowjob'),('handjob'),('dildo'),
 ('kill yourself'),('kys')
on conflict do nothing;

create or replace function public.has_blocked_term(value text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.blocked_terms b where lower(coalesce(value,'')) ~ ('\m'||b.term||'\M'))
$$;
revoke all on function public.has_blocked_term(text) from public,anon,authenticated;

-- The columns to check are the trigger's arguments. The message is what the app shows.
create or replace function public.reject_blocked_terms() returns trigger language plpgsql security definer set search_path='' as $$
declare col text;
begin
 foreach col in array tg_argv loop
  if public.has_blocked_term(to_jsonb(new)->>col) then
   raise exception 'This contains language that is not allowed in the community. Please rephrase it.' using errcode='P0001';
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.reject_blocked_terms() from public,anon,authenticated;

drop trigger if exists blocked_terms_guard on public.community_posts;
create trigger blocked_terms_guard before insert or update of body,display_name,prayer_updates on public.community_posts
 for each row execute function public.reject_blocked_terms('body','display_name','prayer_updates');
drop trigger if exists blocked_terms_guard on public.chat_messages;
create trigger blocked_terms_guard before insert or update of body,display_name on public.chat_messages
 for each row execute function public.reject_blocked_terms('body','display_name');
drop trigger if exists blocked_terms_guard on public.prayer_posts;
create trigger blocked_terms_guard before insert or update of body,display_name on public.prayer_posts
 for each row execute function public.reject_blocked_terms('body','display_name');
drop trigger if exists blocked_terms_guard on public.profiles;
create trigger blocked_terms_guard before insert or update of display_name on public.profiles
 for each row execute function public.reject_blocked_terms('display_name');
drop trigger if exists blocked_terms_guard on public.circles;
create trigger blocked_terms_guard before insert or update of name,description,application_question on public.circles
 for each row execute function public.reject_blocked_terms('name','description','application_question');
drop trigger if exists blocked_terms_guard on public.circle_memberships;
create trigger blocked_terms_guard before insert or update of display_name,answer on public.circle_memberships
 for each row execute function public.reject_blocked_terms('display_name','answer');
drop trigger if exists blocked_terms_guard on public.support_requests;
create trigger blocked_terms_guard before insert or update of title,story,display_name,beneficiary_relationship on public.support_requests
 for each row execute function public.reject_blocked_terms('title','story','display_name','beneficiary_relationship');
commit;

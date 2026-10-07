-- Apply AFTER schema.sql. Additive, rerunnable; never drops existing content.
begin;
create table if not exists public.community_terms(user_id uuid not null references auth.users on delete cascade,version text not null,accepted_at timestamptz not null default now(),primary key(user_id,version));
create table if not exists public.community_posts(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 display_name text not null,is_anonymous boolean not null default false,
 body text not null check(char_length(btrim(body)) between 3 and 2000),
 post_type text not null check(post_type in('reflection','testimony','memory','encouragement','prayer')),
 source_path text check(source_path is null or source_path ~ '^/(bible/[a-z0-9-]+/[1-9][0-9]*(/[1-9][0-9]*)?|grow/[a-z0-9-]+)$'),
 prayer_status text check(prayer_status in('Active','Waiting','Answered','Archived')),
 moderation_state text not null default 'visible' check(moderation_state in('visible','pending_review','hidden','removed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz);
create table if not exists public.community_reactions(post_id uuid not null references public.community_posts on delete cascade,user_id uuid not null references auth.users on delete cascade,reaction text not null check(reaction in('amen','helped','praying')),created_at timestamptz not null default now(),primary key(post_id,user_id,reaction));
create table if not exists public.community_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid not null references auth.users on delete cascade,target_kind text not null check(target_kind in('post','chat','prayer','support')),target_id uuid not null,category text not null check(category in('harassment','hate','sexual content','scam','spam','dangerous advice','private information','other')),note text not null default '' check(char_length(note)<=1000),status text not null default 'open' check(status in('open','reviewing','resolved','dismissed')),created_at timestamptz not null default now(),resolved_at timestamptz,unique(reporter_id,target_kind,target_id));
create table if not exists public.user_blocks(id uuid not null unique default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,blocked_id uuid not null references auth.users on delete cascade,action text not null check(action in('block','mute')),created_at timestamptz not null default now(),primary key(user_id,blocked_id),check(user_id<>blocked_id));
alter table public.user_blocks add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists block_opaque_id on public.user_blocks(id);
create table if not exists public.community_posting_limits(user_id uuid primary key references auth.users on delete cascade,last_post_at timestamptz not null,last_body text not null);
create table if not exists public.moderation_audit(id uuid primary key default gen_random_uuid(),target_kind text not null,target_id uuid not null,actor text not null default current_user,old_state text,new_state text,note text not null default '',created_at timestamptz not null default now());
create index if not exists posts_feed on public.community_posts(created_at desc,id desc) where moderation_state='visible' and deleted_at is null;
create index if not exists posts_source on public.community_posts(source_path,created_at desc,id desc);
create index if not exists reports_queue on public.community_reports(status,created_at);
alter table public.community_terms enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_reports enable row level security;
alter table public.user_blocks enable row level security;
alter table public.community_posting_limits enable row level security;
alter table public.moderation_audit enable row level security;
revoke all on public.community_terms,public.community_posts,public.community_reactions,public.community_reports,public.user_blocks,public.community_posting_limits,public.moderation_audit from public,anon,authenticated;
drop policy if exists terms_self on public.community_terms;
create policy terms_self on public.community_terms for select to authenticated using(user_id=auth.uid());
drop policy if exists reports_self on public.community_reports;
create policy reports_self on public.community_reports for select to authenticated using(reporter_id=auth.uid());
drop policy if exists blocks_self on public.user_blocks;
create policy blocks_self on public.user_blocks for select to authenticated using(user_id=auth.uid());
grant select on public.community_terms,public.community_reports to authenticated;

create or replace function public.accept_community_terms(terms_version text) returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or terms_version<>'2026-10-07' then raise exception 'Current terms and authentication required';end if;
insert into public.community_terms(user_id,version) values(auth.uid(),terms_version) on conflict do nothing;end $$;
create or replace function public.require_terms() returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not exists(select 1 from public.community_terms where user_id=auth.uid() and version='2026-10-07') then raise exception 'Accept current community rules before publishing';end if;end $$;
create or replace function public.legacy_terms_guard() returns trigger language plpgsql security definer set search_path='' as $$begin perform public.require_terms();return new;end $$;
drop trigger if exists aaa_terms_guard on public.chat_messages;
create trigger aaa_terms_guard before insert on public.chat_messages for each row execute function public.legacy_terms_guard();
drop trigger if exists aaa_terms_guard on public.prayer_posts;
create trigger aaa_terms_guard before insert on public.prayer_posts for each row execute function public.legacy_terms_guard();
create or replace function public.author_is_blocked(author_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.user_blocks b where b.user_id=auth.uid() and b.blocked_id=author_id)$$;
-- RLS needs a callable content predicate, never an author-UUID block oracle.
create or replace function public.legacy_content_visible(content_kind text,content_id uuid) returns boolean language sql stable security definer set search_path='' as $$
select case when content_kind='chat' then exists(select 1 from public.chat_messages m join public.chat_rooms r on r.id=m.room_id and r.is_active where m.id=content_id and m.deleted_at is null and not m.is_hidden and not public.author_is_blocked(m.user_id)) when content_kind='prayer' then exists(select 1 from public.prayer_posts p where p.id=content_id and p.deleted_at is null and not p.is_hidden and not public.author_is_blocked(p.user_id)) else false end $$;
drop policy if exists chat_read on public.chat_messages;
create policy chat_read on public.chat_messages for select to anon,authenticated using(public.legacy_content_visible('chat',id));
drop policy if exists prayer_read on public.prayer_posts;
create policy prayer_read on public.prayer_posts for select to anon,authenticated using(public.legacy_content_visible('prayer',id));

create or replace function public.publish_community_post(post_body text,post_kind text,passage_path text default null,anonymous boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare author_name text; result uuid; latest public.community_posting_limits;
begin perform public.require_terms();perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
select display_name into author_name from public.profiles where id=auth.uid();if author_name is null then raise exception 'Profile required';end if;
select * into latest from public.community_posting_limits where user_id=auth.uid();
if latest.last_post_at>clock_timestamp()-interval '30 seconds' or latest.last_body=btrim(post_body) then raise exception 'Please wait or avoid duplicate posts';end if;
insert into public.community_posts(user_id,display_name,is_anonymous,body,post_type,source_path,prayer_status) values(auth.uid(),case when anonymous then 'Anonymous' else author_name end,anonymous,btrim(post_body),post_kind,passage_path,case when post_kind='prayer' then 'Active' end) returning id into result;
insert into public.community_posting_limits values(auth.uid(),clock_timestamp(),btrim(post_body)) on conflict(user_id) do update set last_post_at=excluded.last_post_at,last_body=excluded.last_body;return result;end $$;
create or replace function public.read_community_feed(source_filter text default null,kind_filter text default null,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,display_name text,body text,post_type text,source_path text,created_at timestamptz,is_owner boolean,prayer_status text,amen_count bigint,helped_count bigint,praying_count bigint)
language sql stable security definer set search_path='' as $$
select p.id,p.display_name,p.body,p.post_type,p.source_path,p.created_at,p.user_id=auth.uid(),p.prayer_status,
(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='amen'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='helped'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='praying')
from public.community_posts p where p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)
and (source_filter is null or p.source_path=source_filter) and (kind_filter is null or p.post_type=kind_filter)
and (before_time is null or (p.created_at,p.id)<(before_time,before_id)) order by p.created_at desc,p.id desc limit 20 $$;
create or replace function public.delete_community_post(post_id uuid) returns void language plpgsql security definer set search_path='' as $$begin if auth.uid() is null then raise exception 'Authentication required';end if;update public.community_posts set deleted_at=clock_timestamp() where id=post_id and user_id=auth.uid();if not found then raise exception 'Own contribution required';end if;end $$;
create or replace function public.react_community_post(post_id uuid,reaction_name text) returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not exists(select 1 from public.community_posts where id=post_id and deleted_at is null and moderation_state='visible' and not public.author_is_blocked(user_id)) then raise exception 'Visible contribution and sign in required';end if;
delete from public.community_reactions where community_reactions.post_id=react_community_post.post_id and user_id=auth.uid() and reaction=reaction_name;
if not found then insert into public.community_reactions values(post_id,auth.uid(),reaction_name,clock_timestamp());end if;end $$;
create or replace function public.update_public_prayer(post_id uuid,new_status text,update_body text default '') returns void language plpgsql security definer set search_path='' as $$
begin perform public.require_terms();if new_status not in('Active','Waiting','Answered','Archived') or (new_status='Answered' and char_length(btrim(update_body))<3) or char_length(update_body)>1000 then raise exception 'Valid status and answer required';end if;
update public.community_posts set prayer_status=new_status,updated_at=clock_timestamp(),body=case when btrim(update_body)='' then body else body||E'\n\n'||new_status||': '||btrim(update_body) end where id=post_id and user_id=auth.uid() and post_type='prayer' and deleted_at is null and moderation_state='visible';if not found then raise exception 'Own visible prayer required';end if;end $$;

-- Resolves author privately from content ID: no public anonymous author UUID or directory.
create or replace function public.community_safety_action(target_kind text,target_id uuid,action_name text,report_category text default 'other',report_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare author uuid;
begin if auth.uid() is null then raise exception 'Authentication required';end if;
case target_kind
 when 'post' then select user_id into author from public.community_posts where id=target_id and moderation_state='visible' and deleted_at is null;
 when 'chat' then select user_id into author from public.chat_messages where id=target_id and not is_hidden and deleted_at is null;
 when 'prayer' then select user_id into author from public.prayer_posts where id=target_id and not is_hidden and deleted_at is null;
 when 'support' then execute 'select user_id from public.support_requests where id=$1 and status in(''approved'',''fundraising'') and moderation_state=''visible'' and expires_at>now()' into author using target_id;
 else raise exception 'Invalid target';end case;
if author is null then raise exception 'Visible target required';end if;
if action_name='report' then
insert into public.community_reports(reporter_id,target_kind,target_id,category,note) values(auth.uid(),community_safety_action.target_kind,community_safety_action.target_id,report_category,btrim(report_note)) on conflict do nothing;
elsif action_name in('block','mute') and author<>auth.uid() then insert into public.user_blocks(user_id,blocked_id,action,created_at) values(auth.uid(),author,action_name,clock_timestamp()) on conflict(user_id,blocked_id) do update set action=excluded.action;
else raise exception 'Invalid action';end if;end $$;
create or replace function public.read_own_blocks() returns table(id uuid,action text,created_at timestamptz) language sql stable security definer set search_path='' as $$select b.id,b.action,b.created_at from public.user_blocks b where b.user_id=auth.uid() order by b.created_at desc$$;
create or replace function public.remove_block(blocked_user uuid) returns void language plpgsql security definer set search_path='' as $$begin delete from public.user_blocks where user_id=auth.uid() and id=blocked_user;end $$;

create or replace function public.read_prayer_wall(sort_by text default 'recent')
returns table(id uuid,user_id uuid,display_name text,body text,post_type text,is_anonymous boolean,created_at timestamptz,prayed_count bigint,has_prayed boolean)
language sql stable security definer set search_path='' as $$select p.id,case when p.user_id=auth.uid() then p.user_id else null end,p.display_name,p.body,p.post_type,p.is_anonymous,p.created_at,(select count(*) from public.prayer_reactions r where r.post_id=p.id),exists(select 1 from public.prayer_reactions r where r.post_id=p.id and r.user_id=auth.uid()) from public.prayer_posts p where p.deleted_at is null and not p.is_hidden and not public.author_is_blocked(p.user_id) order by case when sort_by='prayed' then (select count(*) from public.prayer_reactions r where r.post_id=p.id) end desc nulls last,p.created_at desc,p.id desc limit 50 $$;
create or replace function public.audit_post_moderation() returns trigger language plpgsql security definer set search_path='' as $$begin if old.moderation_state is distinct from new.moderation_state then insert into public.moderation_audit(target_kind,target_id,old_state,new_state) values('post',new.id,old.moderation_state,new.moderation_state);end if;return new;end $$;
drop trigger if exists post_moderation_audit on public.community_posts;
create trigger post_moderation_audit after update on public.community_posts for each row execute function public.audit_post_moderation();
revoke all on function public.accept_community_terms(text),public.require_terms(),public.legacy_terms_guard(),public.author_is_blocked(uuid),public.publish_community_post(text,text,text,boolean),public.read_community_feed(text,text,timestamptz,uuid),public.delete_community_post(uuid),public.react_community_post(uuid,text),public.update_public_prayer(uuid,text,text),public.community_safety_action(text,uuid,text,text,text),public.remove_block(uuid),public.audit_post_moderation() from public,anon,authenticated;
revoke all on function public.read_own_blocks() from public,anon,authenticated;
grant execute on function public.read_own_blocks() to authenticated;
revoke all on function public.legacy_content_visible(text,uuid) from public,anon,authenticated;
grant execute on function public.legacy_content_visible(text,uuid),public.read_community_feed(text,text,timestamptz,uuid) to anon,authenticated;
grant execute on function public.accept_community_terms(text),public.publish_community_post(text,text,text,boolean),public.delete_community_post(uuid),public.react_community_post(uuid,text),public.update_public_prayer(uuid,text,text),public.community_safety_action(text,uuid,text,text,text),public.remove_block(uuid) to authenticated;
commit;

-- Forward-only expansion of existing community posts. Never run on hosted automatically.
begin;
create table if not exists public.topics(id text primary key check(id ~ '^[a-z0-9-]+$'),label text not null);
insert into public.topics(id,label) values
 ('anxiety','Anxiety'),('purpose','Purpose'),('relationships','Relationships'),('heartbreak','Heartbreak'),
 ('temptation','Temptation'),('faith','Faith'),('forgiveness','Forgiveness'),('discipline','Discipline'),
 ('loneliness','Loneliness'),('grief','Grief'),('identity','Identity'),('marriage','Marriage'),
 ('money','Money'),('prayer','Prayer'),('growing-closer-to-god','Growing closer to God'),
 ('pornography','Pornography'),('alcohol','Alcohol'),('addiction','Addiction'),('drugs','Drugs'),
 ('anger','Anger'),('pride','Pride'),('envy','Envy'),('gossip','Gossip'),
 ('returning-to-god','Returning to God'),('new-christian','New Christian'),('understanding-scripture','Understanding Scripture')
 on conflict(id) do nothing;
alter table public.topics enable row level security;
revoke all on public.topics from public,anon,authenticated;
drop policy if exists topics_read on public.topics;
create policy topics_read on public.topics for select to anon,authenticated using(true);
grant select on public.topics to anon,authenticated;

alter table public.community_posts add column if not exists topic_id text references public.topics(id);
alter table public.community_posts add column if not exists parent_id uuid references public.community_posts(id) on delete cascade;
alter table public.community_posts add column if not exists sources jsonb not null default '[]' check(jsonb_typeof(sources)='array' and jsonb_array_length(sources)<=5);
alter table public.community_posts drop constraint if exists community_posts_post_type_check;
alter table public.community_posts add constraint community_posts_post_type_check check(post_type in('reflection','testimony','memory','encouragement','prayer','question','advice','scripture','resource'));
create index if not exists topic_posts_date on public.community_posts(topic_id,parent_id,created_at desc,id desc) where deleted_at is null and moderation_state='visible';
alter table public.community_reports drop constraint if exists community_reports_category_check;
alter table public.community_reports add constraint community_reports_category_check check(category in('harassment','hate','sexual content','scam','spam','dangerous advice','private information','other','threats','sexual exploitation','direct payment solicitation','self-harm encouragement','abuse','misinformation','impersonation','misleading credentials','misleading sources'));

create table if not exists public.community_memberships(user_id uuid not null references auth.users on delete cascade,topic_id text not null references public.topics,joined_at timestamptz not null default now(),primary key(user_id,topic_id));
create table if not exists public.community_votes(post_id uuid not null references public.community_posts on delete cascade,user_id uuid not null references auth.users on delete cascade,created_at timestamptz not null default now(),primary key(post_id,user_id));
create table if not exists public.community_vote_limits(user_id uuid primary key references auth.users on delete cascade,last_action timestamptz not null,action_day date not null,actions integer not null check(actions between 0 and 100));
alter table public.community_memberships enable row level security;
alter table public.community_votes enable row level security;
alter table public.community_vote_limits enable row level security;
revoke all on public.community_memberships,public.community_votes,public.community_vote_limits from public,anon,authenticated;
drop policy if exists memberships_own on public.community_memberships;
create policy memberships_own on public.community_memberships for select to authenticated using(user_id=auth.uid());
grant select(topic_id,joined_at) on public.community_memberships to authenticated;

create or replace function public.valid_contribution_sources(items jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb;link text;
begin
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items)>5 then return false;end if;
 for item in select * from jsonb_array_elements(items) loop
  if jsonb_typeof(item)<>'object' or not(item ? 'title' and item ? 'url') or jsonb_typeof(item->'title')<>'string' or jsonb_typeof(item->'url')<>'string' or char_length(btrim(item->>'title')) not between 1 and 200 then return false;end if;
  link:=item->>'url';
  -- HTTPS DNS host only, no credentials, ports, control characters or preview fetching.
  if char_length(link)>2000 or link !~ '^https://[a-zA-Z][a-zA-Z0-9-]*([.][a-zA-Z0-9-]+)+(/[^[:space:][:cntrl:]\\]*)?$' or link ~* '^https://[^/]*([.]local|[.]localhost|[.]internal)(/|$)' then return false;end if;
  if exists(select 1 from jsonb_object_keys(item) k where k not in('title','url')) then return false;end if;
 end loop;return true;
end $$;
create or replace function public.set_topic_membership(selected_topic text,joining boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or joining is null then raise exception 'Sign in and choose join or leave';end if;
 if joining then perform public.require_terms();insert into public.community_memberships(user_id,topic_id) values(auth.uid(),selected_topic) on conflict do nothing;
 else delete from public.community_memberships where user_id=auth.uid() and topic_id=selected_topic;end if;
end $$;
create or replace function public.publish_topic_post(post_body text,post_kind text,selected_topic text,reply_to uuid default null,source_items jsonb default '[]',anonymous boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;parent public.community_posts;
begin
 perform public.require_terms();
 if not exists(select 1 from public.community_memberships where user_id=auth.uid() and topic_id=selected_topic) then raise exception 'Join this topic explicitly before posting';end if;
 if not public.valid_contribution_sources(source_items) then raise exception 'Sources require a title and safe HTTPS URL';end if;
 if reply_to is not null then
  select * into parent from public.community_posts where id=reply_to for share;
  if not found or parent.parent_id is not null or parent.topic_id is distinct from selected_topic or parent.deleted_at is not null or parent.moderation_state<>'visible' or public.author_is_blocked(parent.user_id) then raise exception 'Visible top-level thread required';end if;
 end if;
 result:=public.publish_community_post(post_body,post_kind,null,anonymous);
 update public.community_posts set topic_id=selected_topic,parent_id=reply_to,sources=source_items where id=result and user_id=auth.uid();
 return result;
end $$;
create or replace function public.set_contribution_vote(contribution_id uuid,voting boolean) returns void language plpgsql security definer set search_path='' as $$
declare author uuid;limits public.community_vote_limits;active_vote boolean;
begin
 perform public.require_terms();
 if voting is null then raise exception 'Choose vote or remove';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 select p.user_id into author from public.community_posts p where p.id=contribution_id and p.deleted_at is null and p.moderation_state='visible' and (p.parent_id is null or exists(select 1 from public.community_posts parent where parent.id=p.parent_id and parent.deleted_at is null and parent.moderation_state='visible' and not public.author_is_blocked(parent.user_id))) for share;
 if author is null or author=auth.uid() or public.author_is_blocked(author) then raise exception 'Visible contribution by another author required';end if;
 active_vote:=exists(select 1 from public.community_votes where post_id=contribution_id and user_id=auth.uid());
 if active_vote=voting then return;end if;
 select * into limits from public.community_vote_limits where user_id=auth.uid();
 if limits.last_action>clock_timestamp()-interval '1 second' or limits.action_day=current_date and limits.actions>=100 then raise exception 'Vote rate limit';end if;
 if voting then insert into public.community_votes(post_id,user_id) values(contribution_id,auth.uid()) on conflict do nothing;
 else delete from public.community_votes where post_id=contribution_id and user_id=auth.uid();end if;
 insert into public.community_vote_limits values(auth.uid(),clock_timestamp(),current_date,1) on conflict(user_id) do update set last_action=excluded.last_action,action_day=excluded.action_day,actions=case when community_vote_limits.action_day=excluded.action_day then community_vote_limits.actions+1 else 1 end;
end $$;
-- One point per distinct supporter per contribution: vote + helped never double-counts.
create or replace function public.contribution_score(contribution_id uuid,helpful_only boolean default false) returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from (
  select v.user_id from public.community_votes v where v.post_id=contribution_id and not helpful_only
  union
  select r.user_id from public.community_reactions r where r.post_id=contribution_id and r.reaction='helped'
 ) supporters join public.community_posts p on p.id=contribution_id
 where supporters.user_id<>p.user_id and not public.author_is_blocked(supporters.user_id)
$$;
create or replace function public.contribution_reputation(author uuid) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(sum(public.contribution_score(p.id)),0)::bigint from public.community_posts p
 where p.user_id=author and not p.is_anonymous and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)
 and (p.parent_id is null or exists(select 1 from public.community_posts parent where parent.id=p.parent_id and parent.deleted_at is null and parent.moderation_state='visible' and not public.author_is_blocked(parent.user_id)))
$$;
create or replace function public.read_topic_discussions(selected_topic text,reply_to uuid default null,sorting text default 'newest',before_score bigint default null,before_time timestamptz default null,before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if sorting is null or sorting not in('newest','top','helpful') then raise exception 'Valid sorting required';end if;
 if (before_time is not null or before_id is not null or before_score is not null) and (before_time is null or before_id is null or before_score is null) then raise exception 'Complete cursor required';end if;
 if reply_to is not null and not exists(select 1 from public.community_posts p where p.id=reply_to and p.topic_id=selected_topic and p.parent_id is null and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)) then return '[]';end if;
 select coalesce(jsonb_agg(q.item order by q.score desc,q.created_at desc,q.id desc),'[]') into result from (
  select p.id,p.created_at,ranking.score,
   jsonb_build_object('id',p.id,'display_name',p.display_name,'body',p.body||p.prayer_updates,'post_type',p.post_type,'created_at',p.created_at,'is_owner',coalesce(p.user_id=auth.uid(),false),'sources',p.sources,'score',ranking.score,
    'upvotes',(select count(*) from public.community_votes v where v.post_id=p.id),
    'voted',exists(select 1 from public.community_votes v where v.post_id=p.id and v.user_id=auth.uid()),
    'helped',public.contribution_score(p.id,true),
    'reputation',case when p.is_anonymous then null else public.contribution_reputation(p.user_id) end,
    'replies',(select count(*) from public.community_posts r where r.parent_id=p.id and r.deleted_at is null and r.moderation_state='visible' and not public.author_is_blocked(r.user_id))) item
  from public.community_posts p
  cross join lateral(select case when sorting='newest' then 0::bigint else public.contribution_score(p.id,sorting='helpful') end score) ranking
  where p.topic_id=selected_topic and p.parent_id is not distinct from reply_to and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)
   and (sorting='newest' or p.created_at>now()-interval '30 days')
   and (before_time is null or (ranking.score,p.created_at,p.id)<(before_score,before_time,before_id))
  order by ranking.score desc,p.created_at desc,p.id desc limit 20
 ) q;return result;
end $$;
revoke all on function public.valid_contribution_sources(jsonb),public.set_topic_membership(text,boolean),public.publish_topic_post(text,text,text,uuid,jsonb,boolean),public.set_contribution_vote(uuid,boolean),public.contribution_score(uuid,boolean),public.contribution_reputation(uuid),public.read_topic_discussions(text,uuid,text,bigint,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.set_topic_membership(text,boolean),public.publish_topic_post(text,text,text,uuid,jsonb,boolean),public.set_contribution_vote(uuid,boolean) to authenticated;
grant execute on function public.read_topic_discussions(text,uuid,text,bigint,timestamptz,uuid) to anon,authenticated;
-- Existing public timelines retain top-level contributions; replies use the constrained thread reader.
create or replace function public.read_community_feed(source_filter text default null,kind_filter text default null,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,display_name text,body text,post_type text,source_path text,created_at timestamptz,is_owner boolean,prayer_status text,amen_count bigint,helped_count bigint,praying_count bigint)
language sql stable security definer set search_path='' as $$
select p.id,p.display_name,p.body||p.prayer_updates,p.post_type,p.source_path,p.created_at,p.user_id=auth.uid(),p.prayer_status,
(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='amen'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='helped'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='praying')
from public.community_posts p where p.parent_id is null and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)
and (source_filter is null or p.source_path=source_filter) and (kind_filter is null or p.post_type=kind_filter)
and (before_time is null or (p.created_at,p.id)<(before_time,before_id)) order by p.created_at desc,p.id desc limit 20 $$;
create or replace function public.read_aggregate_feed(source_filter text default null,kind_filter text default null,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,display_name text,body text,post_type text,source_path text,created_at timestamptz,is_owner boolean,prayer_status text,amen_count bigint,helped_count bigint,praying_count bigint,origin_kind text)
language sql stable security definer set search_path='' as $$
select f.* from (
 select p.id,p.display_name,p.body||p.prayer_updates,p.post_type,p.source_path,p.created_at,coalesce(p.user_id=auth.uid(),false),p.prayer_status,
 (select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='amen'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='helped'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='praying'),'post'::text
 from public.community_posts p where p.parent_id is null and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id) and (source_filter is null or p.source_path=source_filter)
 union all
 select p.id,p.display_name,p.body,p.post_type,null,p.created_at,coalesce(p.user_id=auth.uid(),false),null,0::bigint,0::bigint,(select count(*) from public.prayer_reactions r where r.post_id=p.id),'prayer'
 from public.prayer_posts p where source_filter is null and p.deleted_at is null and not p.is_hidden and not public.author_is_blocked(p.user_id)
 union all
 select p.id,p.display_name,p.body,'chat',null,p.created_at,coalesce(p.user_id=auth.uid(),false),null,0::bigint,0::bigint,0::bigint,'chat'
 from public.chat_messages p join public.chat_rooms room on room.id=p.room_id and room.is_active where source_filter is null and p.deleted_at is null and not p.is_hidden and not public.author_is_blocked(p.user_id)
) as f(id,display_name,body,post_type,source_path,created_at,is_owner,prayer_status,amen_count,helped_count,praying_count,origin_kind)
where (kind_filter is null or f.post_type=kind_filter) and (before_time is null or (f.created_at,f.id)<(before_time,before_id)) order by f.created_at desc,f.id desc limit 20 $$;

create or replace function public.read_topic_thread(selected_topic text,thread_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'display_name',p.display_name,'body',p.body||p.prayer_updates,'post_type',p.post_type,'created_at',p.created_at,'is_owner',coalesce(p.user_id=auth.uid(),false),'sources',p.sources,'score',public.contribution_score(p.id),'upvotes',(select count(*) from public.community_votes v where v.post_id=p.id),'voted',exists(select 1 from public.community_votes v where v.post_id=p.id and v.user_id=auth.uid()),'helped',public.contribution_score(p.id,true),'reputation',case when p.is_anonymous then null else public.contribution_reputation(p.user_id) end,'replies',(select count(*) from public.community_posts r where r.parent_id=p.id and r.deleted_at is null and r.moderation_state='visible' and not public.author_is_blocked(r.user_id)))
 from public.community_posts p where p.id=thread_id and p.topic_id=selected_topic and p.parent_id is null and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)
$$;
revoke all on function public.read_topic_thread(text,uuid) from public,anon,authenticated;
grant execute on function public.read_topic_thread(text,uuid) to anon,authenticated;
create or replace function public.react_community_post(post_id uuid,reaction_name text) returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null or not exists(select 1 from public.community_posts p where p.id=post_id and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id) and (p.parent_id is null or exists(select 1 from public.community_posts parent where parent.id=p.parent_id and parent.deleted_at is null and parent.moderation_state='visible' and not public.author_is_blocked(parent.user_id)))) then raise exception 'Visible contribution and sign in required';end if;
delete from public.community_reactions where community_reactions.post_id=react_community_post.post_id and user_id=auth.uid() and reaction=reaction_name;
if not found then insert into public.community_reactions values(post_id,auth.uid(),reaction_name,clock_timestamp());end if;end $$;
commit;

-- Circles v1. Forward-only; apply once after 005. No hosted deployment authorized.
begin;
create table public.circles (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users on delete cascade,
 slug text not null unique check(slug ~ '^[a-z][a-z0-9-]{2,59}$' and slug not in('new','create','admin','settings','circles','members','applications','reports','api')),
 name text not null check(char_length(btrim(name)) between 3 and 80),
 description text not null check(char_length(btrim(description)) between 10 and 1000),
 privacy text not null check(privacy in('public','private')),
 topic_id text references public.topics,
 application_question text not null default '' check(char_length(application_question)<=300),
 status text not null default 'active' check(status in('active','disabled')),
 created_at timestamptz not null default clock_timestamp()
);
create table public.circle_memberships (
 id uuid primary key default gen_random_uuid(),
 circle_id uuid not null references public.circles on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 display_name text not null,
 role text not null default 'member' check(role in('owner','moderator','member')),
 state text not null check(state in('pending','active','declined','left','removed')),
 answer text not null default '' check(char_length(answer)<=1000 and (state='pending' or answer='')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(circle_id,user_id), check(role<>'owner' or state='active')
);
create unique index circle_one_owner on public.circle_memberships(circle_id) where role='owner';
create index circle_members_queue on public.circle_memberships(circle_id,state,created_at,id);
create index circle_member_lookup on public.circle_memberships(user_id,circle_id,state);
create index circle_discovery on public.circles(status,created_at desc,id desc);
alter table public.circles enable row level security;
alter table public.circle_memberships enable row level security;
-- No raw application access, including SELECT: identity/answers are serialized by scoped RPCs.
revoke all on public.circles,public.circle_memberships from public,anon,authenticated;
alter table public.community_posts add column circle_id uuid references public.circles on delete cascade;
create index circle_posts_date on public.community_posts(circle_id,parent_id,created_at desc,id desc) where deleted_at is null;
alter table public.community_reports drop constraint community_reports_category_check;
alter table public.community_reports add constraint community_reports_category_check check(category in('harassment','hate','sexual content','scam','spam','dangerous advice','private information','other','threats','sexual exploitation','direct payment solicitation','self-harm encouragement','abuse','misinformation','impersonation','misleading credentials','misleading sources','vote manipulation','coordinated abuse'));

create function public.circle_role(selected_circle uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role from public.circle_memberships m join public.circles c on c.id=m.circle_id and c.status='active'
 where m.circle_id=selected_circle and m.user_id=auth.uid() and m.state='active'
$$;
create function public.circle_readable(selected_circle uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.circles c where c.id=selected_circle and c.status='active' and (c.privacy='public' or public.circle_role(c.id) is not null))
$$;
create function public.circle_post_visible(post_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_posts p where p.id=post_id and p.deleted_at is null and p.moderation_state='visible'
 and (p.circle_id is null or public.circle_readable(p.circle_id)) and not public.author_is_blocked(p.user_id)
 and (p.parent_id is null or exists(select 1 from public.community_posts r where r.id=p.parent_id and r.circle_id is not distinct from p.circle_id and r.deleted_at is null and r.moderation_state='visible' and not public.author_is_blocked(r.user_id))))
$$;
create function public.require_circle_interaction(post_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare selected uuid;
begin
 select p.circle_id into selected from public.community_posts p where p.id=post_id;
 if selected is not null then
  perform 1 from public.circles where id=selected for share;
  if public.circle_role(selected) is null then raise exception 'Visible contribution required';end if;
 end if;
 if not public.circle_post_visible(post_id) then raise exception 'Visible contribution required';end if;
end $$;
create function public.circle_identity_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.owner_id is distinct from old.owner_id or new.privacy is distinct from old.privacy or new.slug is distinct from old.slug then raise exception 'Circle owner, privacy and URL are immutable in v1';end if;
 return new;
end $$;
create trigger circle_identity_guard before update on public.circles for each row execute function public.circle_identity_guard();
create function public.audit_circle_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.moderation_audit(target_kind,target_id,actor,old_state,new_state)
 values('circle_membership',new.id,coalesce(auth.uid()::text,current_user),case when tg_op='UPDATE' then old.role||'/'||old.state end,new.role||'/'||new.state);
 return new;
end $$;
create trigger circle_membership_audit after insert or update on public.circle_memberships for each row execute function public.audit_circle_membership();

create function public.create_circle(circle_slug text,circle_name text,circle_description text,circle_privacy text,selected_topic text default null,question text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;author_name text;
begin
 perform public.require_terms();perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 select display_name into author_name from public.profiles where id=auth.uid();if author_name is null then raise exception 'Profile required';end if;
 if (select count(*) from public.circles where owner_id=auth.uid() and status='active')>=5 or exists(select 1 from public.circles where owner_id=auth.uid() and created_at>clock_timestamp()-interval '30 seconds') then raise exception 'Circle creation limit';end if;
 insert into public.circles(owner_id,slug,name,description,privacy,topic_id,application_question) values(auth.uid(),circle_slug,btrim(circle_name),btrim(circle_description),circle_privacy,selected_topic,btrim(question)) returning id into result;
 insert into public.circle_memberships(circle_id,user_id,display_name,role,state) values(result,auth.uid(),author_name,'owner','active');return result;
end $$;
create function public.edit_circle(selected_circle uuid,circle_name text,circle_description text,question text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_terms();perform 1 from public.circles where id=selected_circle for update;
 if public.circle_role(selected_circle)<>'owner' or public.circle_role(selected_circle) is null then raise exception 'Active owner required';end if;
 update public.circles set name=btrim(circle_name),description=btrim(circle_description),application_question=btrim(question) where id=selected_circle;
 insert into public.moderation_audit(target_kind,target_id,actor,new_state) values('circle',selected_circle,auth.uid()::text,'details updated');
end $$;
create function public.close_circle(selected_circle uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.circles where id=selected_circle for update;
 if public.circle_role(selected_circle) is distinct from 'owner' then raise exception 'Active owner required';end if;
 update public.circles set status='disabled' where id=selected_circle;
 update public.circle_memberships set answer='',state=case when state='pending' then 'declined' else state end,updated_at=clock_timestamp() where circle_id=selected_circle;
 insert into public.moderation_audit(target_kind,target_id,actor,old_state,new_state) values('circle',selected_circle,auth.uid()::text,'active','disabled');
end $$;
create function public.change_circle_membership(selected_circle uuid,membership_action text,application_answer text default '') returns void language plpgsql security definer set search_path='' as $$
declare c public.circles;m public.circle_memberships;author_name text;
begin
 if auth.uid() is null or membership_action is null then raise exception 'Sign in required';end if;
 select * into c from public.circles where id=selected_circle for update;
 if not found or c.status<>'active' then raise exception 'Circle unavailable';end if;
 select * into m from public.circle_memberships where circle_id=c.id and user_id=auth.uid();
 if m.role='owner' then raise exception 'Owner cannot leave or reapply';end if;
 if membership_action='leave' and m.state in('active','pending') then
  update public.circle_memberships set state='left',role='member',answer='',updated_at=clock_timestamp() where id=m.id;return;
 end if;
 perform public.require_terms();
 if m.state='removed' then raise exception 'Removed membership cannot self-restore';end if;
 if m.state in('active','pending') then
  if membership_action=(case when m.state='active' then 'join' else 'apply' end) then return;end if;
  raise exception 'Invalid membership transition';
 end if;
 if membership_action<>(case when c.privacy='public' then 'join' else 'apply' end) then raise exception 'Invalid membership transition';end if;
 select display_name into author_name from public.profiles where id=auth.uid();if author_name is null then raise exception 'Profile required';end if;
 if application_answer is null or char_length(application_answer)>1000 then raise exception 'Answer limit is 1000 characters';end if;
 if m.updated_at>clock_timestamp()-interval '3 seconds' then raise exception 'Membership cooldown';end if;
 insert into public.circle_memberships(circle_id,user_id,display_name,state,answer) values(c.id,auth.uid(),author_name,case when c.privacy='public' then 'active' else 'pending' end,case when c.privacy='private' then btrim(application_answer) else '' end)
 on conflict(circle_id,user_id) do update set state=excluded.state,role='member',display_name=excluded.display_name,answer=excluded.answer,updated_at=clock_timestamp();
end $$;
create function public.review_circle_member(selected_circle uuid,membership_id uuid,review_action text) returns void language plpgsql security definer set search_path='' as $$
declare caller text;m public.circle_memberships;
begin
 perform public.require_terms();perform 1 from public.circles where id=selected_circle for update;
 caller:=public.circle_role(selected_circle);if caller is null or caller not in('owner','moderator') then raise exception 'Circle moderator required';end if;
 select * into m from public.circle_memberships where id=membership_id and circle_id=selected_circle for update;
 if not found or m.role='owner' or m.user_id=auth.uid() then raise exception 'Cannot change self or owner';end if;
 if review_action in('approve','decline') and m.state='pending' then
  update public.circle_memberships set state=case when review_action='approve' then 'active' else 'declined' end,answer='',updated_at=clock_timestamp() where id=m.id;
 elsif review_action='remove' and m.state='active' and (caller='owner' or m.role='member') then
  update public.circle_memberships set state='removed',role='member',answer='',updated_at=clock_timestamp() where id=m.id;
 elsif caller='owner' and m.state='active' and (review_action='promote' and m.role='member' or review_action='demote' and m.role='moderator') then
  update public.circle_memberships set role=case when review_action='promote' then 'moderator' else 'member' end,updated_at=clock_timestamp() where id=m.id;
 else raise exception 'Invalid review transition';end if;
end $$;
create function public.circle_metadata(c public.circles) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name,'description',c.description,'privacy',c.privacy,'topic_id',c.topic_id,'application_question',c.application_question,'created_at',c.created_at,
 'role',public.circle_role(c.id),'membership', (select state from public.circle_memberships where circle_id=c.id and user_id=auth.uid()),
 'member_count',case when public.circle_role(c.id) is not null then (select count(*) from public.circle_memberships where circle_id=c.id and state='active') end)
$$;
create function public.read_circles(selected_slug text default null,selected_topic text default null,own_only boolean default false,before_time timestamptz default null,before_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if (before_time is null)<>(before_id is null) then raise exception 'Complete cursor required';end if;
 select coalesce(jsonb_agg(q.item order by q.created_at desc,q.id desc),'[]') into result from (
 select c.id,c.created_at,public.circle_metadata(c) item from public.circles c where c.status='active' and (c.privacy='public' or auth.uid() is not null)
 and (selected_slug is null or c.slug=selected_slug) and (selected_topic is null or c.topic_id=selected_topic)
 and (not coalesce(own_only,false) or public.circle_role(c.id) is not null)
 and (before_time is null or (c.created_at,c.id)<(before_time,before_id)) order by c.created_at desc,c.id desc limit 20) q;
 return result;
end $$;
create function public.read_own_circle_application(selected_circle uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',m.state,'answer',case when m.state='pending' then m.answer else null end)
 from public.circle_memberships m join public.circles c on c.id=m.circle_id and c.status='active' and c.privacy='private'
 where m.circle_id=selected_circle and m.user_id=auth.uid()
$$;
revoke all on function public.read_own_circle_application(uuid) from public,anon,authenticated;
grant execute on function public.read_own_circle_application(uuid) to authenticated;

create function public.read_circle_members(selected_circle uuid,queue text default 'pending',after_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if public.circle_role(selected_circle) is null or public.circle_role(selected_circle) not in('owner','moderator') or queue not in('pending','active') or queue is null then raise exception 'Circle moderator required';end if;
 select coalesce(jsonb_agg(q.item order by q.id),'[]') into result from (
 select m.id,jsonb_build_object('id',m.id,'display_name',m.display_name,'is_self',m.user_id=auth.uid(),'state',m.state,'role',m.role,'answer',case when queue='pending' then m.answer else null end) item
 from public.circle_memberships m where circle_id=selected_circle and state=queue and (after_id is null or m.id>after_id) order by m.id limit 20) q;return result;
end $$;
create function public.publish_circle_post(selected_circle uuid,post_body text,post_kind text,reply_to uuid default null,source_items jsonb default '[]',anonymous boolean default false,passage_path text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;c public.circles;
begin
 perform public.require_terms();select * into c from public.circles where id=selected_circle for share;
 if public.circle_role(selected_circle) is null then raise exception 'Active Circle membership required';end if;
 if not public.valid_contribution_sources(source_items) then raise exception 'Safe sources required';end if;
 if reply_to is not null and not exists(select 1 from public.community_posts p where p.id=reply_to and p.circle_id=c.id and p.parent_id is null and public.circle_post_visible(p.id)) then raise exception 'Visible top-level Circle thread required';end if;
 result:=public.publish_community_post(post_body,post_kind,passage_path,anonymous);
 update public.community_posts set circle_id=c.id,topic_id=c.topic_id,parent_id=reply_to,sources=source_items where id=result;return result;
end $$;
create function public.circle_contribution(p public.community_posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'display_name',p.display_name,'body',p.body||p.prayer_updates,'post_type',p.post_type,'source_path',p.source_path,'created_at',p.created_at,'is_owner',coalesce(p.user_id=auth.uid(),false),'sources',p.sources,
 'score',public.contribution_score(p.id),'upvotes',(select count(*) from public.community_votes where post_id=p.id),'voted',exists(select 1 from public.community_votes where post_id=p.id and user_id=auth.uid()),'helped',public.contribution_score(p.id,true),
 'reputation',case when p.is_anonymous then null else public.contribution_reputation(p.user_id) end,
 'replies',(select count(*) from public.community_posts r where r.parent_id=p.id and r.circle_id=p.circle_id and public.circle_post_visible(r.id)))
$$;
create function public.read_circle_discussions(selected_circle uuid,reply_to uuid default null,before_time timestamptz default null,before_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if (before_time is null)<>(before_id is null) then raise exception 'Complete cursor required';end if;
 if not public.circle_readable(selected_circle) then return '[]';end if;
 if reply_to is not null and not exists(select 1 from public.community_posts where id=reply_to and circle_id=selected_circle and parent_id is null and public.circle_post_visible(id)) then return '[]';end if;
 select coalesce(jsonb_agg(q.item order by q.created_at desc,q.id desc),'[]') into result from (
 select p.id,p.created_at,public.circle_contribution(p) item from public.community_posts p where p.circle_id=selected_circle and p.parent_id is not distinct from reply_to and public.circle_post_visible(p.id)
 and (before_time is null or (p.created_at,p.id)<(before_time,before_id)) order by p.created_at desc,p.id desc limit 20) q;return result;
end $$;
create function public.read_circle_thread(selected_circle uuid,thread_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.circle_contribution(p) from public.community_posts p where p.id=thread_id and p.circle_id=selected_circle and p.parent_id is null and public.circle_post_visible(p.id)
$$;
-- Moderators can inspect a reported/blocked author only inside their own active Circle.
-- Reporter identity and private notes never reach Circle moderators.
create function public.read_circle_reports(selected_circle uuid,after_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if public.circle_role(selected_circle) is null or public.circle_role(selected_circle) not in('owner','moderator') then raise exception 'Circle moderator required';end if;
 select coalesce(jsonb_agg(q.item order by q.id),'[]') into result from (
 select r.id,jsonb_build_object('id',r.id,'target_id',p.id,'category',r.category,'status',r.status,'body',p.body||p.prayer_updates,'display_name',p.display_name,'moderation_state',p.moderation_state) item
 from public.community_reports r join public.community_posts p on p.id=r.target_id and r.target_kind='post' and p.circle_id=selected_circle
 where p.deleted_at is null and (r.status in('open','reviewing') or p.moderation_state in('hidden','removed')) and (after_id is null or r.id>after_id) order by r.id limit 20) q;return result;
end $$;
create function public.moderate_circle_post(selected_circle uuid,post_id uuid,new_state text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_terms();perform 1 from public.circles where id=selected_circle for update;
 if public.circle_role(selected_circle) is null or public.circle_role(selected_circle) not in('owner','moderator') or new_state is null or new_state not in('visible','hidden','removed') then raise exception 'Scoped Circle moderation required';end if;
 update public.community_posts set moderation_state=new_state,updated_at=clock_timestamp() where id=post_id and circle_id=selected_circle and deleted_at is null;
 if not found then raise exception 'Circle contribution unavailable';end if;
 insert into public.moderation_audit(target_kind,target_id,actor,new_state) values('circle_post',post_id,auth.uid()::text,new_state);
 update public.community_reports set status='resolved',resolved_at=clock_timestamp() where target_kind='post' and target_id=post_id and status in('open','reviewing');
end $$;

-- Existing endpoint replacements below preserve signatures and grants.

create or replace function public.read_community_feed(source_filter text default null,kind_filter text default null,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,display_name text,body text,post_type text,source_path text,created_at timestamptz,is_owner boolean,prayer_status text,amen_count bigint,helped_count bigint,praying_count bigint)
language sql stable security definer set search_path='' as $$
select p.id,p.display_name,p.body||p.prayer_updates,p.post_type,p.source_path,p.created_at,p.user_id=auth.uid(),p.prayer_status,
(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='amen'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='helped'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='praying')
from public.community_posts p where p.circle_id is null and p.parent_id is null and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)
and (source_filter is null or p.source_path=source_filter) and (kind_filter is null or p.post_type=kind_filter)
and (before_time is null or (p.created_at,p.id)<(before_time,before_id)) order by p.created_at desc,p.id desc limit 20 $$;

create or replace function public.read_aggregate_feed(source_filter text default null,kind_filter text default null,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,display_name text,body text,post_type text,source_path text,created_at timestamptz,is_owner boolean,prayer_status text,amen_count bigint,helped_count bigint,praying_count bigint,origin_kind text)
language sql stable security definer set search_path='' as $$
select f.* from (
 select p.id,p.display_name,p.body||p.prayer_updates,p.post_type,p.source_path,p.created_at,coalesce(p.user_id=auth.uid(),false),p.prayer_status,
 (select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='amen'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='helped'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='praying'),'post'::text
 from public.community_posts p where p.circle_id is null and p.parent_id is null and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id) and (source_filter is null or p.source_path=source_filter)
 union all
 select p.id,p.display_name,p.body,p.post_type,null,p.created_at,coalesce(p.user_id=auth.uid(),false),null,0::bigint,0::bigint,(select count(*) from public.prayer_reactions r where r.post_id=p.id),'prayer'
 from public.prayer_posts p where source_filter is null and p.deleted_at is null and not p.is_hidden and not public.author_is_blocked(p.user_id)
 union all
 select p.id,p.display_name,p.body,'chat',null,p.created_at,coalesce(p.user_id=auth.uid(),false),null,0::bigint,0::bigint,0::bigint,'chat'
 from public.chat_messages p join public.chat_rooms room on room.id=p.room_id and room.is_active where source_filter is null and p.deleted_at is null and not p.is_hidden and not public.author_is_blocked(p.user_id)
) as f(id,display_name,body,post_type,source_path,created_at,is_owner,prayer_status,amen_count,helped_count,praying_count,origin_kind)
where (kind_filter is null or f.post_type=kind_filter) and (before_time is null or (f.created_at,f.id)<(before_time,before_id)) order by f.created_at desc,f.id desc limit 20 $$;

create or replace function public.read_topic_thread(selected_topic text,thread_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'display_name',p.display_name,'body',p.body||p.prayer_updates,'post_type',p.post_type,'created_at',p.created_at,'is_owner',coalesce(p.user_id=auth.uid(),false),'sources',p.sources,'score',public.contribution_score(p.id),'upvotes',(select count(*) from public.community_votes v where v.post_id=p.id),'voted',exists(select 1 from public.community_votes v where v.post_id=p.id and v.user_id=auth.uid()),'helped',public.contribution_score(p.id,true),'reputation',case when p.is_anonymous then null else public.contribution_reputation(p.user_id) end,'replies',(select count(*) from public.community_posts r where r.circle_id is null and r.parent_id=p.id and r.deleted_at is null and r.moderation_state='visible' and not public.author_is_blocked(r.user_id)))
 from public.community_posts p where p.circle_id is null and p.id=thread_id and p.topic_id=selected_topic and p.parent_id is null and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)
$$;

create or replace function public.read_topic_discussions(selected_topic text,reply_to uuid default null,sorting text default 'newest',before_score bigint default null,before_time timestamptz default null,before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if sorting is null or sorting not in('newest','top','helpful') then raise exception 'Valid sorting required';end if;
 if (before_time is not null or before_id is not null or before_score is not null) and (before_time is null or before_id is null or before_score is null) then raise exception 'Complete cursor required';end if;
 if reply_to is not null and not exists(select 1 from public.community_posts p where p.circle_id is null and p.id=reply_to and p.topic_id=selected_topic and p.parent_id is null and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)) then return '[]';end if;
 select coalesce(jsonb_agg(q.item order by q.score desc,q.created_at desc,q.id desc),'[]') into result from (
  select p.id,p.created_at,ranking.score,
   jsonb_build_object('id',p.id,'display_name',p.display_name,'body',p.body||p.prayer_updates,'post_type',p.post_type,'created_at',p.created_at,'is_owner',coalesce(p.user_id=auth.uid(),false),'sources',p.sources,'score',ranking.score,
    'upvotes',(select count(*) from public.community_votes v where v.post_id=p.id),
    'voted',exists(select 1 from public.community_votes v where v.post_id=p.id and v.user_id=auth.uid()),
    'helped',public.contribution_score(p.id,true),
    'reputation',case when p.is_anonymous then null else public.contribution_reputation(p.user_id) end,
    'replies',(select count(*) from public.community_posts r where r.circle_id is null and r.parent_id=p.id and r.deleted_at is null and r.moderation_state='visible' and not public.author_is_blocked(r.user_id))) item
  from public.community_posts p
  cross join lateral(select case when sorting='newest' then 0::bigint else public.contribution_score(p.id,sorting='helpful') end score) ranking
  where p.circle_id is null and p.topic_id=selected_topic and p.parent_id is not distinct from reply_to and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)
   and (sorting='newest' or p.created_at>now()-interval '30 days')
   and (before_time is null or (ranking.score,p.created_at,p.id)<(before_score,before_time,before_id))
  order by ranking.score desc,p.created_at desc,p.id desc limit 20
 ) q;return result;
end $$;

create or replace function public.contribution_reputation(author uuid) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(sum(public.contribution_score(p.id)),0)::bigint from public.community_posts p
 where p.circle_id is null and p.user_id=author and not p.is_anonymous and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)
 and (p.parent_id is null or exists(select 1 from public.community_posts parent where parent.id=p.parent_id and parent.deleted_at is null and parent.moderation_state='visible' and not public.author_is_blocked(parent.user_id)))
$$;

create or replace function public.publish_topic_post(post_body text,post_kind text,selected_topic text,reply_to uuid default null,source_items jsonb default '[]',anonymous boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;parent public.community_posts;
begin
 perform public.require_terms();
 if not exists(select 1 from public.community_memberships where user_id=auth.uid() and topic_id=selected_topic) then raise exception 'Join this topic explicitly before posting';end if;
 if not public.valid_contribution_sources(source_items) then raise exception 'Sources require a title and safe HTTPS URL';end if;
 if reply_to is not null then
  select * into parent from public.community_posts where id=reply_to for share;
  if not found or parent.circle_id is not null or parent.parent_id is not null or parent.topic_id is distinct from selected_topic or parent.deleted_at is not null or parent.moderation_state<>'visible' or public.author_is_blocked(parent.user_id) then raise exception 'Visible top-level thread required';end if;
 end if;
 result:=public.publish_community_post(post_body,post_kind,null,anonymous);
 update public.community_posts set topic_id=selected_topic,parent_id=reply_to,sources=source_items where id=result and user_id=auth.uid();
 return result;
end $$;

create or replace function public.set_contribution_vote(contribution_id uuid,voting boolean) returns void language plpgsql security definer set search_path='' as $$
declare author uuid;limits public.community_vote_limits;active_vote boolean;
begin
 perform public.require_circle_interaction(contribution_id);
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

create or replace function public.react_community_post(post_id uuid,reaction_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_circle_interaction(post_id);
if auth.uid() is null or not exists(select 1 from public.community_posts p where p.id=post_id and p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id) and (p.parent_id is null or exists(select 1 from public.community_posts parent where parent.id=p.parent_id and parent.deleted_at is null and parent.moderation_state='visible' and not public.author_is_blocked(parent.user_id)))) then raise exception 'Visible contribution and sign in required';end if;
delete from public.community_reactions where community_reactions.post_id=react_community_post.post_id and user_id=auth.uid() and reaction=reaction_name;
if not found then insert into public.community_reactions values(post_id,auth.uid(),reaction_name,clock_timestamp());end if;end $$;

create or replace function public.update_public_prayer(post_id uuid,new_status text,update_body text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_circle_interaction(post_id);
perform public.require_terms();
 if new_status is null or new_status not in('Active','Waiting','Answered','Archived')
   or (new_status='Answered' and char_length(btrim(coalesce(update_body,'')))<3)
   or char_length(coalesce(update_body,''))>1000 then raise exception 'Valid status and answer required';end if;
 update public.community_posts set prayer_status=new_status,updated_at=clock_timestamp(),
   prayer_updates=case when btrim(coalesce(update_body,''))='' then prayer_updates
     else prayer_updates||E'\n\n'||new_status||': '||btrim(update_body) end
 where id=post_id and user_id=auth.uid() and post_type='prayer' and deleted_at is null and moderation_state='visible';
 if not found then raise exception 'Own visible prayer required';end if;
end $$;

create or replace function public.community_safety_action(target_kind text,target_id uuid,action_name text,report_category text default 'other',report_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare author uuid;
begin if auth.uid() is null then raise exception 'Authentication required';end if;
case target_kind
 when 'post' then if not public.circle_post_visible(target_id) then raise exception 'Visible target required';end if;select user_id into author from public.community_posts where id=target_id and moderation_state='visible' and deleted_at is null;
 when 'chat' then select user_id into author from public.chat_messages where id=target_id and not is_hidden and deleted_at is null;
 when 'prayer' then select user_id into author from public.prayer_posts where id=target_id and not is_hidden and deleted_at is null;
 when 'support' then execute 'select user_id from public.support_requests where id=$1 and status in(''approved'',''fundraising'') and moderation_state=''visible'' and expires_at>now()' into author using target_id;
 else raise exception 'Invalid target';end case;
if author is null then raise exception 'Visible target required';end if;
if action_name='report' then
insert into public.community_reports(reporter_id,target_kind,target_id,category,note) values(auth.uid(),community_safety_action.target_kind,community_safety_action.target_id,report_category,btrim(report_note)) on conflict do nothing;
elsif action_name in('block','mute') and author<>auth.uid() then insert into public.user_blocks(user_id,blocked_id,action,created_at) values(auth.uid(),author,action_name,clock_timestamp()) on conflict(user_id,blocked_id) do update set action=excluded.action;
else raise exception 'Invalid action';end if;end $$;
revoke all on function public.circle_role(uuid) from public,anon,authenticated;

revoke all on function public.circle_readable(uuid) from public,anon,authenticated;

revoke all on function public.circle_post_visible(uuid) from public,anon,authenticated;

revoke all on function public.require_circle_interaction(uuid) from public,anon,authenticated;

revoke all on function public.circle_identity_guard() from public,anon,authenticated;

revoke all on function public.audit_circle_membership() from public,anon,authenticated;

revoke all on function public.circle_metadata(public.circles) from public,anon,authenticated;

revoke all on function public.circle_contribution(public.community_posts) from public,anon,authenticated;

revoke all on function public.create_circle(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_circle(text,text,text,text,text,text) to authenticated;
revoke all on function public.edit_circle(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.edit_circle(uuid,text,text,text) to authenticated;
revoke all on function public.close_circle(uuid) from public,anon,authenticated;
grant execute on function public.close_circle(uuid) to authenticated;
revoke all on function public.change_circle_membership(uuid,text,text) from public,anon,authenticated;
grant execute on function public.change_circle_membership(uuid,text,text) to authenticated;
revoke all on function public.review_circle_member(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.review_circle_member(uuid,uuid,text) to authenticated;
revoke all on function public.read_circles(text,text,boolean,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.read_circles(text,text,boolean,timestamptz,uuid) to anon,authenticated;
revoke all on function public.read_circle_members(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_circle_members(uuid,text,uuid) to authenticated;
revoke all on function public.publish_circle_post(uuid,text,text,uuid,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.publish_circle_post(uuid,text,text,uuid,jsonb,boolean,text) to authenticated;
revoke all on function public.read_circle_discussions(uuid,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.read_circle_discussions(uuid,uuid,timestamptz,uuid) to anon,authenticated;
revoke all on function public.read_circle_thread(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_circle_thread(uuid,uuid) to anon,authenticated;
revoke all on function public.read_circle_reports(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_circle_reports(uuid,uuid) to authenticated;
revoke all on function public.moderate_circle_post(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.moderate_circle_post(uuid,uuid,text) to authenticated;
commit;

-- One paginated timeline for new passage/devotional posts and original chat/prayer content.
begin;
create or replace function public.read_aggregate_feed(source_filter text default null,kind_filter text default null,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,display_name text,body text,post_type text,source_path text,created_at timestamptz,is_owner boolean,prayer_status text,amen_count bigint,helped_count bigint,praying_count bigint,origin_kind text)
language sql stable security definer set search_path='' as $$
select f.* from (
 select p.id,p.display_name,p.body,p.post_type,p.source_path,p.created_at,coalesce(p.user_id=auth.uid(),false),p.prayer_status,
 (select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='amen'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='helped'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='praying'),'post'::text
 from public.community_posts p where p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id) and (source_filter is null or p.source_path=source_filter)
 union all
 select p.id,p.display_name,p.body,p.post_type,null,p.created_at,coalesce(p.user_id=auth.uid(),false),null,0::bigint,0::bigint,(select count(*) from public.prayer_reactions r where r.post_id=p.id),'prayer'
 from public.prayer_posts p where source_filter is null and p.deleted_at is null and not p.is_hidden and not public.author_is_blocked(p.user_id)
 union all
 select p.id,p.display_name,p.body,'chat',null,p.created_at,coalesce(p.user_id=auth.uid(),false),null,0::bigint,0::bigint,0::bigint,'chat'
 from public.chat_messages p join public.chat_rooms room on room.id=p.room_id and room.is_active where source_filter is null and p.deleted_at is null and not p.is_hidden and not public.author_is_blocked(p.user_id)
) as f(id,display_name,body,post_type,source_path,created_at,is_owner,prayer_status,amen_count,helped_count,praying_count,origin_kind)
where (kind_filter is null or f.post_type=kind_filter) and (before_time is null or (f.created_at,f.id)<(before_time,before_id)) order by f.created_at desc,f.id desc limit 20 $$;
revoke all on function public.read_aggregate_feed(text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.read_aggregate_feed(text,text,timestamptz,uuid) to anon,authenticated;
commit;

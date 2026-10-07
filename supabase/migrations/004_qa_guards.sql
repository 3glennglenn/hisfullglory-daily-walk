-- Forward repair: preserve the original prayer body and reject direct payment instructions.
begin;
create or replace function public.support_has_payment_details(value text)
returns boolean language sql immutable set search_path='' as $$
select value ~* '(https?://|www[.]|paypal|cashapp|cash[[:space:]]*app|venmo|crypto|bitcoin|ethereum|wallet[[:space:]]*address|bank[[:space:]]*account|routing[[:space:]]*number|account[[:space:]]*number|card[[:space:]]*number|rekeningnummer|wire[[:space:]]*transfer|bank[[:space:]]*transfer|\m([0-9][ -]?){13,19}\M|\mIBAN\M|\m[A-Z]{2}[0-9]{2}([[:space:]]?[A-Z0-9]){11,30}\M|\m0x[a-f0-9]{40}\M|\m[13][a-km-zA-HJ-NP-Z1-9]{25,34}\M|\mbc1[a-z0-9]{25,90}\M)'
$$;
revoke all on function public.support_has_payment_details(text) from public,anon,authenticated;

alter table public.community_posts add column if not exists prayer_updates text not null default '' check(char_length(prayer_updates)<=50000);
create or replace function public.update_public_prayer(post_id uuid,new_status text,update_body text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
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
revoke all on function public.update_public_prayer(uuid,text,text) from public,anon,authenticated;
grant execute on function public.update_public_prayer(uuid,text,text) to authenticated;
create or replace function public.read_community_feed(source_filter text default null,kind_filter text default null,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,display_name text,body text,post_type text,source_path text,created_at timestamptz,is_owner boolean,prayer_status text,amen_count bigint,helped_count bigint,praying_count bigint)
language sql stable security definer set search_path='' as $$
select p.id,p.display_name,p.body||p.prayer_updates,p.post_type,p.source_path,p.created_at,p.user_id=auth.uid(),p.prayer_status,
(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='amen'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='helped'),(select count(*) from public.community_reactions r where r.post_id=p.id and r.reaction='praying')
from public.community_posts p where p.deleted_at is null and p.moderation_state='visible' and not public.author_is_blocked(p.user_id)
and (source_filter is null or p.source_path=source_filter) and (kind_filter is null or p.post_type=kind_filter)
and (before_time is null or (p.created_at,p.id)<(before_time,before_id)) order by p.created_at desc,p.id desc limit 20 $$;

create or replace function public.read_aggregate_feed(source_filter text default null,kind_filter text default null,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,display_name text,body text,post_type text,source_path text,created_at timestamptz,is_owner boolean,prayer_status text,amen_count bigint,helped_count bigint,praying_count bigint,origin_kind text)
language sql stable security definer set search_path='' as $$
select f.* from (
 select p.id,p.display_name,p.body||p.prayer_updates,p.post_type,p.source_path,p.created_at,coalesce(p.user_id=auth.uid(),false),p.prayer_status,
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

create or replace function public.read_support_requests() returns table(id uuid,title text,story text,category text,declared_target numeric,currency text,expires_at timestamptz,beneficiary_relationship text,country text,is_anonymous boolean,fundraiser_url text,status text,display_name text,created_at timestamptz) language sql stable security definer set search_path='' as $$select r.id,r.title,r.story,r.category,r.declared_target,r.currency,r.expires_at,r.beneficiary_relationship,r.country,r.is_anonymous,r.fundraiser_url,r.status,r.display_name,r.created_at from public.support_requests r where r.status in('approved','fundraising') and r.moderation_state='visible' and r.deleted_at is null and r.expires_at>now() and not public.author_is_blocked(r.user_id) and not public.support_has_payment_details(r.title||' '||r.story||' '||r.beneficiary_relationship||' '||r.country) order by r.created_at desc,r.id desc limit 50 $$;

create or replace function public.review_support_request(request_id uuid,new_status text,review_note text) returns void language plpgsql security definer set search_path='' as $$
declare previous public.support_requests;
begin if new_status not in('approved','fundraising','funded','closed','rejected') or char_length(btrim(review_note))<10 then raise exception 'Valid review and reason required';end if;
select * into previous from public.support_requests where id=request_id and deleted_at is null for update;if not found then raise exception 'Request not found';end if;
if new_status='approved' and previous.status<>'under_review' or new_status='fundraising' and previous.status<>'approved' or new_status='funded' and previous.status not in('approved','fundraising') then raise exception 'Invalid review transition';end if;
if new_status in('approved','fundraising') and previous.expires_at<=now() then raise exception 'Expired request';end if;
if new_status in('approved','fundraising') and public.support_has_payment_details(previous.title||' '||previous.story||' '||previous.beneficiary_relationship||' '||previous.country) then raise exception 'No direct payment details';end if;
update public.support_requests set status=new_status,moderation_state=case when new_status in('approved','fundraising') then 'visible' else 'hidden' end,reviewed_at=clock_timestamp(),updated_at=clock_timestamp() where id=request_id;
insert into public.support_review_notes(request_id,note) values(request_id,btrim(review_note));end $$;

revoke all on function public.review_support_request(uuid,text,text) from public,anon,authenticated;
commit;

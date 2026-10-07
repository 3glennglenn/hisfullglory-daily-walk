-- External support directory only. No native transactions, balances or payouts.
begin;
create table if not exists public.support_requests(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 title text not null check(char_length(btrim(title)) between 5 and 120),story text not null check(char_length(btrim(story)) between 30 and 3000),
 category text not null check(category in('Medical & care','Basic needs','Education','Family emergency','Community service')),
 declared_target numeric(12,2) not null check(declared_target>0 and declared_target<=1000000),currency text not null check(currency in('USD','EUR','GBP','CAD','AUD')),
 expires_at timestamptz not null,beneficiary_relationship text not null check(char_length(btrim(beneficiary_relationship)) between 2 and 100),country text not null check(char_length(btrim(country)) between 2 and 80),is_anonymous boolean not null default false,display_name text not null,
 fundraiser_url text not null check(fundraiser_url ~ '^https://www[.]gofundme[.]com/f/[a-z0-9]+(-[a-z0-9]+)*/?$'),
 status text not null default 'draft' check(status in('draft','under_review','approved','fundraising','funded','closed','rejected')),
 moderation_state text not null default 'pending_review' check(moderation_state in('visible','pending_review','hidden','removed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),reviewed_at timestamptz,deleted_at timestamptz);
create unique index if not exists support_active_url on public.support_requests(rtrim(fundraiser_url,'/')) where deleted_at is null and status not in('closed','rejected');
create index if not exists support_queue on public.support_requests(status,created_at);
create table if not exists public.support_review_notes(id uuid primary key default gen_random_uuid(),request_id uuid not null references public.support_requests on delete cascade,actor text not null default current_user,note text not null,created_at timestamptz not null default now());
alter table public.support_requests enable row level security;
alter table public.support_review_notes enable row level security;
revoke all on public.support_requests,public.support_review_notes from public,anon,authenticated;
drop policy if exists support_own_read on public.support_requests;
create policy support_own_read on public.support_requests for select to authenticated using(user_id=auth.uid() and deleted_at is null);
grant select on public.support_requests to authenticated;
create or replace function public.support_has_payment_details(value text) returns boolean language sql immutable set search_path='' as $$select value ~* '(paypal|cashapp|cash[[:space:]]*app|venmo|crypto|bitcoin|ethereum|wallet[[:space:]]*address|bank[[:space:]]*account|routing[[:space:]]*number|\mIBAN\M|\m[A-Z]{2}[0-9]{2}([[:space:]]?[A-Z0-9]){11,30}\M|\m0x[a-f0-9]{40}\M|\m[13][a-km-zA-HJ-NP-Z1-9]{25,34}\M|\mbc1[a-z0-9]{25,90}\M)' $$;
create or replace function public.save_support_draft(request_id uuid,request_title text,request_story text,request_category text,target_amount numeric,target_currency text,expiry timestamptz,relationship text,request_country text,anonymous boolean,external_url text) returns uuid language plpgsql security definer set search_path='' as $$
declare author_name text;result uuid;old public.support_requests;
begin if auth.uid() is null then raise exception 'Authentication required';end if;perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
select display_name into author_name from public.profiles where id=auth.uid();if author_name is null then raise exception 'Profile required';end if;
if public.support_has_payment_details(request_title||' '||request_story||' '||relationship||' '||request_country) then raise exception 'No direct payment details';end if;
if expiry<=now() or expiry>now()+interval '90 days' then raise exception 'Expiry must be within 90 days';end if;
if request_id is null then
if exists(select 1 from public.support_requests where user_id=auth.uid() and created_at>clock_timestamp()-interval '30 seconds') then raise exception 'Please wait before creating another request';end if;
if (select count(*) from public.support_requests where user_id=auth.uid() and status not in('closed','rejected') and deleted_at is null)>=5 then raise exception 'Too many open requests';end if;
insert into public.support_requests(user_id,title,story,category,declared_target,currency,expires_at,beneficiary_relationship,country,is_anonymous,display_name,fundraiser_url) values(auth.uid(),btrim(request_title),btrim(request_story),request_category,target_amount,target_currency,expiry,btrim(relationship),btrim(request_country),anonymous,case when anonymous then 'Anonymous' else author_name end,external_url) returning id into result;
else select * into old from public.support_requests where id=request_id and user_id=auth.uid() and status in('draft','rejected') and deleted_at is null for update;if not found then raise exception 'Own draft required';end if;
update public.support_requests set title=btrim(request_title),story=btrim(request_story),category=request_category,declared_target=target_amount,currency=target_currency,expires_at=expiry,beneficiary_relationship=btrim(relationship),country=btrim(request_country),is_anonymous=anonymous,display_name=case when anonymous then 'Anonymous' else author_name end,fundraiser_url=external_url,status='draft',moderation_state='pending_review',updated_at=clock_timestamp(),reviewed_at=null where id=request_id;result:=request_id;end if;return result;end $$;
create or replace function public.submit_support_request(request_id uuid) returns void language plpgsql security definer set search_path='' as $$begin perform public.require_terms();update public.support_requests set status='under_review',moderation_state='pending_review',updated_at=clock_timestamp() where id=request_id and user_id=auth.uid() and status='draft' and deleted_at is null and expires_at>now();if not found then raise exception 'Own unexpired draft required';end if;end $$;
create or replace function public.close_support_request(request_id uuid,remove_request boolean default false) returns void language plpgsql security definer set search_path='' as $$begin if auth.uid() is null then raise exception 'Authentication required';end if;update public.support_requests set status='closed',moderation_state='removed',updated_at=clock_timestamp(),deleted_at=case when remove_request then clock_timestamp() else deleted_at end where id=request_id and user_id=auth.uid() and deleted_at is null;if not found then raise exception 'Own request required';end if;end $$;
create or replace function public.read_support_requests() returns table(id uuid,title text,story text,category text,declared_target numeric,currency text,expires_at timestamptz,beneficiary_relationship text,country text,is_anonymous boolean,fundraiser_url text,status text,display_name text,created_at timestamptz) language sql stable security definer set search_path='' as $$select r.id,r.title,r.story,r.category,r.declared_target,r.currency,r.expires_at,r.beneficiary_relationship,r.country,r.is_anonymous,r.fundraiser_url,r.status,r.display_name,r.created_at from public.support_requests r where r.status in('approved','fundraising') and r.moderation_state='visible' and r.deleted_at is null and r.expires_at>now() and not public.author_is_blocked(r.user_id) order by r.created_at desc,r.id desc limit 50 $$;
create or replace function public.audit_support_review() returns trigger language plpgsql security definer set search_path='' as $$begin if new.status is distinct from old.status or new.moderation_state is distinct from old.moderation_state then insert into public.moderation_audit(target_kind,target_id,old_state,new_state) values('support',new.id,old.status||'/'||old.moderation_state,new.status||'/'||new.moderation_state);end if;return new;end $$;
drop trigger if exists support_review_audit on public.support_requests;
create trigger support_review_audit after update on public.support_requests for each row execute function public.audit_support_review();
-- Only database operators can review. Never expose this function to application roles.
create or replace function public.review_support_request(request_id uuid,new_status text,review_note text) returns void language plpgsql security definer set search_path='' as $$
declare previous public.support_requests;
begin if new_status not in('approved','fundraising','funded','closed','rejected') or char_length(btrim(review_note))<10 then raise exception 'Valid review and reason required';end if;
select * into previous from public.support_requests where id=request_id and deleted_at is null for update;if not found then raise exception 'Request not found';end if;
if new_status='approved' and previous.status<>'under_review' or new_status='fundraising' and previous.status<>'approved' or new_status='funded' and previous.status not in('approved','fundraising') then raise exception 'Invalid review transition';end if;
if new_status in('approved','fundraising') and previous.expires_at<=now() then raise exception 'Expired request';end if;
update public.support_requests set status=new_status,moderation_state=case when new_status in('approved','fundraising') then 'visible' else 'hidden' end,reviewed_at=clock_timestamp(),updated_at=clock_timestamp() where id=request_id;
insert into public.support_review_notes(request_id,note) values(request_id,btrim(review_note));end $$;
revoke all on function public.support_has_payment_details(text),public.save_support_draft(uuid,text,text,text,numeric,text,timestamptz,text,text,boolean,text),public.submit_support_request(uuid),public.close_support_request(uuid,boolean),public.read_support_requests(),public.audit_support_review(),public.review_support_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_support_draft(uuid,text,text,text,numeric,text,timestamptz,text,text,boolean,text),public.submit_support_request(uuid),public.close_support_request(uuid,boolean) to authenticated;
grant execute on function public.read_support_requests() to anon,authenticated;
commit;

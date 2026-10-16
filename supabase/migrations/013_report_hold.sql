-- Held for review. An item that two different people, neither of them its author, have
-- reported is hidden from every reader until a person has looked at it (GATE-06). The rule
-- lives in the database so that old and new clients are held to it alike.
-- Forward-only and safe to apply twice; apply after 012. Founder approval: 2026-10-16
-- ("akkoord 013"); applied to the hosted project with the hosted name report_hold.
--
-- What this file does:
--  1. Widens the kinds a report may name by one value, walk_reflection, for the Walk With Me
--     reflections of week 2. Verse readings, stories, questions, answers and Circle posts are
--     community_posts rows and are reported as 'post'; nothing else is stored under another name,
--     so report counts never split.
--  2. Adds a trigger on community_reports. After each new report it counts the distinct
--     reporters whose reports are still open or under review, leaves out the author, and at two
--     or more moves the item to its hidden state: moderation_state pending_review for posts
--     (Circle posts too) and support requests, is_hidden for chat messages and prayer requests
--     (with an audit row whose actor is 'system'). A lock per item makes two reports that arrive
--     at the same moment count each other.
--  3. Redefines community_safety_action with the same signature and grants as in 006 and adds a
--     flood cap: one account may file 30 reports an hour.
--  4. Adds review_held_content, which only the database owner can run (not anon, not
--     authenticated, not the browser). It restores, keeps hidden or removes an item and resolves
--     that item's open reports in the same transaction, so the next single report does not hold
--     a restored item again.
--
-- Nothing here returns a report, a reporter or a note to any client. No report text goes into
-- email, push, analytics or URLs.
-- Runbook: docs/MODERATION.md, Held for review
begin;

alter table public.community_reports drop constraint if exists community_reports_target_kind_check;
alter table public.community_reports add constraint community_reports_target_kind_check
 check(target_kind in('post','chat','prayer','support','walk_reflection'));

create or replace function public.hold_if_reported_twice() returns trigger language plpgsql security definer set search_path='' as $$
declare author uuid; reporters integer;
begin
 -- One lock per item: a second report waits for the first to commit and then sees it.
 perform pg_advisory_xact_lock(hashtextextended('report-hold:'||new.target_kind||':'||new.target_id::text,0));
 if new.target_kind='post' then select user_id into author from public.community_posts where id=new.target_id;
 elsif new.target_kind='chat' then select user_id into author from public.chat_messages where id=new.target_id;
 elsif new.target_kind='prayer' then select user_id into author from public.prayer_posts where id=new.target_id;
 elsif new.target_kind='support' then select user_id into author from public.support_requests where id=new.target_id;
 else return new;end if;
 if author is null then return new;end if;
 select count(distinct r.reporter_id) into reporters from public.community_reports r
  where r.target_kind=new.target_kind and r.target_id=new.target_id and r.status in('open','reviewing') and r.reporter_id<>author;
 if reporters<2 then return new;end if;
 if new.target_kind='post' then
  update public.community_posts set moderation_state='pending_review',updated_at=clock_timestamp() where id=new.target_id and moderation_state='visible';
 elsif new.target_kind='chat' then
  update public.chat_messages set is_hidden=true where id=new.target_id and not is_hidden;
  if found then insert into public.moderation_audit(target_kind,target_id,actor,old_state,new_state,note) values('chat',new.target_id,'system','visible','hidden','two reporters');end if;
 elsif new.target_kind='prayer' then
  update public.prayer_posts set is_hidden=true where id=new.target_id and not is_hidden;
  if found then insert into public.moderation_audit(target_kind,target_id,actor,old_state,new_state,note) values('prayer',new.target_id,'system','visible','hidden','two reporters');end if;
 elsif new.target_kind='support' then
  update public.support_requests set moderation_state='pending_review',updated_at=clock_timestamp() where id=new.target_id and moderation_state='visible';
 end if;
 return new;
end $$;
revoke all on function public.hold_if_reported_twice() from public,anon,authenticated;
drop trigger if exists report_hold on public.community_reports;
create trigger report_hold after insert on public.community_reports for each row execute function public.hold_if_reported_twice();

-- Same body, signature and grants as in 006 (the latest definition). The only addition is the
-- flood cap inside the 'report' branch, before the insert.
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
 perform pg_advisory_xact_lock(hashtextextended('report-rate:'||auth.uid()::text,0));
 if (select count(*) from public.community_reports where reporter_id=auth.uid() and created_at>clock_timestamp()-interval '1 hour')>=30 then raise exception 'Report limit reached';end if;
insert into public.community_reports(reporter_id,target_kind,target_id,category,note) values(auth.uid(),community_safety_action.target_kind,community_safety_action.target_id,report_category,btrim(report_note)) on conflict do nothing;
elsif action_name in('block','mute') and author<>auth.uid() then insert into public.user_blocks(user_id,blocked_id,action,created_at) values(auth.uid(),author,action_name,clock_timestamp()) on conflict(user_id,blocked_id) do update set action=excluded.action;
else raise exception 'Invalid action';end if;end $$;
revoke all on function public.community_safety_action(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.community_safety_action(text,uuid,text,text,text) to authenticated;

-- Operator only: the database owner runs it from the SQL editor, like review_support_request.
-- A support request is only reviewable here while it is approved or fundraising: one that is
-- still waiting for its first approval is also pending_review, and is decided by review_support_request.
-- decision restore: visible again. keep_hidden: stays hidden. remove: gone for good.
-- Every decision resolves this item's open and reviewing reports in the same transaction.
create or replace function public.review_held_content(item_kind text,item_id uuid,decision text,review_note text) returns void language plpgsql security definer set search_path='' as $$
declare wanted text;
begin
 if decision is null or decision not in('restore','keep_hidden','remove') then raise exception 'Valid decision required';end if;
 if item_kind is null or item_kind not in('post','chat','prayer','support') or item_id is null then raise exception 'Valid item required';end if;
 wanted:=case decision when 'restore' then 'visible' when 'keep_hidden' then 'hidden' else 'removed' end;
 -- The same lock the hold trigger takes, so a report that arrives meanwhile waits for this decision.
 perform pg_advisory_xact_lock(hashtextextended('report-hold:'||item_kind||':'||item_id::text,0));
 if item_kind='post' then
  update public.community_posts set moderation_state=wanted,updated_at=clock_timestamp() where id=item_id and deleted_at is null and moderation_state in('pending_review','hidden');
  if not found then raise exception 'Held item not found';end if;
 elsif item_kind='support' then
  update public.support_requests set moderation_state=wanted,updated_at=clock_timestamp() where id=item_id and deleted_at is null and moderation_state='pending_review' and status in('approved','fundraising');
  if not found then raise exception 'Held item not found';end if;
 elsif item_kind='chat' then
  update public.chat_messages set is_hidden=(decision<>'restore'),deleted_at=case when decision='remove' then clock_timestamp() else deleted_at end where id=item_id and deleted_at is null and is_hidden;
  if not found then raise exception 'Held item not found';end if;
 else
  update public.prayer_posts set is_hidden=(decision<>'restore'),deleted_at=case when decision='remove' then clock_timestamp() else deleted_at end where id=item_id and deleted_at is null and is_hidden;
  if not found then raise exception 'Held item not found';end if;
 end if;
 -- Posts and support requests already audit their state change through their own triggers;
 -- this row carries the reviewer's reason for every kind.
 insert into public.moderation_audit(target_kind,target_id,actor,old_state,new_state,note) values(item_kind,item_id,current_user,'held',wanted,'review: '||coalesce(btrim(review_note),''));
 update public.community_reports set status='resolved',resolved_at=clock_timestamp() where target_kind=item_kind and target_id=item_id and status in('open','reviewing');
end $$;
revoke all on function public.review_held_content(text,uuid,text,text) from public,anon,authenticated;
commit;

-- Run in Supabase SQL Editor as project owner. No service-role key belongs in the app.
begin;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 40),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  name text not null, description text not null, sort_order integer not null,
  is_active boolean not null default true
);
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references public.chat_rooms(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(), deleted_at timestamptz,
  is_hidden boolean not null default false
);
create table if not exists public.prayer_posts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  post_type text not null check (post_type in ('prayer', 'testimony')),
  is_anonymous boolean not null default false, created_at timestamptz not null default now(),
  deleted_at timestamptz, is_hidden boolean not null default false
);
create table if not exists public.prayer_reactions (
  post_id uuid not null references public.prayer_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (post_id, user_id)
);
create index if not exists chat_room_date on public.chat_messages(room_id, created_at desc, id desc) where deleted_at is null and not is_hidden;
create index if not exists chat_user_date on public.chat_messages(user_id, created_at desc);
create index if not exists prayer_date on public.prayer_posts(created_at desc) where deleted_at is null and not is_hidden;
create index if not exists prayer_user_date on public.prayer_posts(user_id, created_at desc);
create index if not exists reaction_user on public.prayer_reactions(user_id, post_id);

insert into public.chat_rooms (id, slug, name, description, sort_order) values
 ('c90c5140-3929-4e0d-935c-000000000001','general-fellowship','General Fellowship','Share encouragement for your everyday walk.',1),
 ('c90c5140-3929-4e0d-935c-000000000002','todays-scripture','Today’s Scripture','Reflect together on today’s verse.',2),
 ('c90c5140-3929-4e0d-935c-000000000003','prayer-praise','Prayer & Praise','Bring a prayer or share a moment of gratitude.',3)
on conflict (slug) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;

alter table public.profiles enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.prayer_posts enable row level security;
alter table public.prayer_reactions enable row level security;

drop policy if exists profile_read on public.profiles;
create policy profile_read on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists profile_create on public.profiles;
create policy profile_create on public.profiles for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists profile_edit on public.profiles;
create policy profile_edit on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists rooms_read on public.chat_rooms;
create policy rooms_read on public.chat_rooms for select to anon, authenticated using (is_active);
drop policy if exists chat_read on public.chat_messages;
create policy chat_read on public.chat_messages for select to anon, authenticated using (
 deleted_at is null and not is_hidden and exists (select 1 from public.chat_rooms r where r.id = room_id and r.is_active)
);
drop policy if exists chat_create on public.chat_messages;
create policy chat_create on public.chat_messages for insert to authenticated with check (
 user_id = (select auth.uid()) and not is_hidden and deleted_at is null and exists (select 1 from public.chat_rooms r where r.id = room_id and r.is_active)
);
drop policy if exists chat_delete on public.chat_messages;
create policy chat_delete on public.chat_messages for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists prayer_read on public.prayer_posts;
create policy prayer_read on public.prayer_posts for select to anon, authenticated using (deleted_at is null and not is_hidden);
drop policy if exists prayer_create on public.prayer_posts;
create policy prayer_create on public.prayer_posts for insert to authenticated with check (user_id = (select auth.uid()) and not is_hidden and deleted_at is null);
drop policy if exists prayer_delete on public.prayer_posts;
create policy prayer_delete on public.prayer_posts for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists reaction_read on public.prayer_reactions;
create policy reaction_read on public.prayer_reactions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists reaction_create on public.prayer_reactions;
create policy reaction_create on public.prayer_reactions for insert to authenticated with check (
 user_id = (select auth.uid()) and exists (select 1 from public.prayer_posts p where p.id = post_id and p.deleted_at is null and not p.is_hidden)
);
drop policy if exists reaction_delete on public.prayer_reactions;
create policy reaction_delete on public.prayer_reactions for delete to authenticated using (user_id = (select auth.uid()));

-- Narrow column grants prevent clients setting moderation flags, forged dates or names.
revoke all on public.profiles, public.chat_rooms, public.chat_messages, public.prayer_posts, public.prayer_reactions from anon, authenticated;
grant select on public.chat_rooms, public.chat_messages to anon, authenticated;
-- Anonymous prayer authors cannot be correlated with named chat authors by UUID.
grant select (id, display_name, body, post_type, is_anonymous, created_at, deleted_at, is_hidden) on public.prayer_posts to anon, authenticated;
grant select on public.profiles, public.prayer_reactions to authenticated;
grant insert (id, display_name), update (display_name) on public.profiles to authenticated;
grant insert (room_id, user_id, body) on public.chat_messages to authenticated;
grant insert (user_id, body, post_type, is_anonymous) on public.prayer_posts to authenticated;
grant insert (post_id, user_id) on public.prayer_reactions to authenticated;
grant delete on public.chat_messages, public.prayer_posts, public.prayer_reactions to authenticated;

create or replace function public.profile_updated() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end $$;
drop trigger if exists profile_updated on public.profiles;
create trigger profile_updated before update on public.profiles for each row execute function public.profile_updated();

-- Serialize submissions for each author, including concurrent connections.
create or replace function public.community_insert_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare author_name text; last_body text; last_time timestamptz; profile_time timestamptz;
begin
 if auth.uid() is null or new.user_id <> auth.uid() then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
 select display_name, case when updated_at > created_at then updated_at end into author_name, profile_time from public.profiles where id = auth.uid();
 if author_name is null then raise exception 'Profile required'; end if;
 new.body := btrim(new.body); new.created_at := clock_timestamp(); new.deleted_at := null; new.is_hidden := false;
 if tg_table_name = 'chat_messages' then
   select body, created_at into last_body, last_time from public.chat_messages where user_id = new.user_id order by created_at desc, id desc limit 1;
   new.display_name := author_name;
 else
   select body, created_at into last_body, last_time from public.prayer_posts where user_id = new.user_id order by created_at desc, id desc limit 1;
   new.display_name := case when new.is_anonymous then 'Anonymous' else author_name end;
 end if;
 last_time := greatest(last_time, profile_time);
 if last_time is not null and new.created_at - last_time < interval '3 seconds' then raise exception 'Please wait before posting again'; end if;
 if last_body = new.body then raise exception 'Duplicate consecutive post'; end if;
 -- Keep the cooldown even if the author immediately deletes the new post.
 update public.profiles set updated_at = new.created_at where id = auth.uid();
 return new;
end $$;
revoke all on function public.community_insert_guard() from public;
drop trigger if exists chat_insert_guard on public.chat_messages;
create trigger chat_insert_guard before insert on public.chat_messages for each row execute function public.community_insert_guard();
drop trigger if exists prayer_insert_guard on public.prayer_posts;
create trigger prayer_insert_guard before insert on public.prayer_posts for each row execute function public.community_insert_guard();

-- Return public posts and aggregate counts without disclosing who reacted.
-- Definer access is constrained explicitly to visible rows; profiles are never joined.
create or replace function public.read_prayer_wall(sort_by text default 'recent')
returns table (id uuid, user_id uuid, display_name text, body text, post_type text, is_anonymous boolean, created_at timestamptz, prayed_count bigint, has_prayed boolean)
language sql stable security definer set search_path = '' as $$
 select p.id, case when p.user_id = auth.uid() then p.user_id else null end, p.display_name,
 p.body, p.post_type, p.is_anonymous, p.created_at,
 (select count(*) from public.prayer_reactions r where r.post_id = p.id) as prayed_count,
 exists(select 1 from public.prayer_reactions r where r.post_id = p.id and r.user_id = auth.uid()) as has_prayed
 from public.prayer_posts p where p.deleted_at is null and not p.is_hidden
 order by case when sort_by = 'prayed' then (select count(*) from public.prayer_reactions r where r.post_id = p.id) end desc nulls last,
 p.created_at desc, p.id desc limit 50;
$$;
revoke all on function public.read_prayer_wall(text) from public;
grant execute on function public.read_prayer_wall(text) to anon, authenticated;

do $$ begin
 if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
   if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
     alter publication supabase_realtime add table public.chat_messages;
   end if;
   if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prayer_posts') then
     alter publication supabase_realtime add table public.prayer_posts;
   end if;
 end if;
end $$;
commit;

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const a = "a0000000-0000-4000-8000-000000000001";
const b = "b0000000-0000-4000-8000-000000000002";
const room = "c90c5140-3929-4e0d-935c-000000000001";
let checks = 0;
const ok = (v, label) => {
  assert.ok(v, label);
  checks++;
  console.log("PASS", label);
};
const denied = async (sql, label) => {
  let failed = false;
  try {
    await db.exec(sql);
  } catch {
    failed = true;
  }
  ok(failed, label);
};
const actor = async (role, id = "") => {
  await db.exec(
    `reset role; set role ${role}; select set_config('request.jwt.claim.sub', '${id}', false);`,
  );
};
const rows = async (sql) => (await db.query(sql)).rows;
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
insert into auth.users values ('${a}'),('${b}');
create publication supabase_realtime;`);
const schema = readFileSync("supabase/schema.sql", "utf8");
await db.exec(schema);
await db.exec(schema);
ok(
  (await rows("select * from public.chat_rooms")).length === 3,
  "schema reruns and seeds exactly three rooms",
);
ok(
  (
    await rows(
      "select * from pg_publication_tables where pubname='supabase_realtime'",
    )
  ).length === 2,
  "Realtime publication is idempotent",
);
await actor("anon");
ok(
  (await rows("select * from public.chat_rooms")).length === 3,
  "guest reads active rooms",
);
await denied(
  `insert into public.chat_messages (room_id,user_id,body) values ('${room}','${a}','guest write')`,
  "guest cannot post",
);
await denied(
  "select * from public.profiles",
  "guest cannot read private profiles",
);
await actor("authenticated", a);
await db.exec(
  `insert into public.profiles(id,display_name) values ('${a}','Grace');`,
);
await denied(
  `insert into public.profiles(id,display_name) values ('${b}','Impersonation')`,
  "cannot create another user profile",
);
const message = (
  await rows(
    `insert into public.chat_messages(room_id,user_id,body) values ('${room}','${a}','A kind word') returning *`,
  )
)[0];
ok(message.display_name === "Grace", "server snapshots author name");
await denied(
  `insert into public.chat_messages(room_id,user_id,body) values ('${room}','${a}','Too fast')`,
  "SQL cooldown rejects rapid posting",
);
await denied(
  `insert into public.chat_messages(room_id,user_id,body) values ('${room}','${b}','Forged author')`,
  "cannot forge message author",
);
await denied(
  `insert into public.chat_messages(room_id,user_id,body,is_hidden) values ('${room}','${a}','Forged moderation',true)`,
  "cannot write moderation flags",
);
await actor("authenticated", b);
await db.exec(
  `insert into public.profiles(id,display_name) values ('${b}','James');`,
);
ok(
  (await rows("select * from public.profiles")).every((p) => p.id === b),
  "profile reads are owner-only",
);
ok(
  (
    await rows(
      `update public.profiles set display_name='Changed' where id='${a}' returning id`,
    )
  ).length === 0,
  "profile edits are owner-only",
);
ok(
  (
    await rows(
      `delete from public.chat_messages where id='${message.id}' returning id`,
    )
  ).length === 0,
  "other author cannot delete message",
);
await actor("authenticated", a);
ok(
  (
    await rows(
      `delete from public.chat_messages where id='${message.id}' returning id`,
    )
  ).length === 1,
  "author can delete message",
);
await denied(
  `insert into public.chat_messages(room_id,user_id,body) values ('${room}','${a}','After deletion')`,
  "deletion cannot bypass cooldown",
);
await new Promise((resolve) => setTimeout(resolve, 3100));
const p = (
  await rows(
    `insert into public.prayer_posts(user_id,body,post_type,is_anonymous) values ('${a}','A prayer','prayer',true) returning id, display_name`,
  )
)[0];
ok(p.display_name === "Anonymous", "anonymous posts hide name server-side");
await actor("authenticated", b);
await db.exec(
  `insert into public.prayer_reactions(post_id,user_id) values ('${p.id}','${b}')`,
);
await denied(
  `insert into public.prayer_reactions(post_id,user_id) values ('${p.id}','${b}')`,
  "reaction is unique per account",
);
await denied(
  `insert into public.prayer_reactions(post_id,user_id) values ('${p.id}','${a}')`,
  "reaction cannot be forged",
);
const wall = (await rows("select * from public.read_prayer_wall('prayed')"))[0];
ok(
  wall.prayed_count === 1 && wall.has_prayed === true && wall.user_id === null,
  "wall returns counts and only own reaction/identity",
);
ok(
  (
    await rows(
      `delete from public.prayer_posts where id='${p.id}' returning id`,
    )
  ).length === 0,
  "cannot delete another prayer",
);
await actor("anon");
const publicWall = (
  await rows("select * from public.read_prayer_wall('recent')")
)[0];
ok(
  publicWall.prayed_count === 1 &&
    !publicWall.has_prayed &&
    publicWall.user_id === null,
  "guest reads aggregate counts without identities",
);
await denied(
  "select * from public.prayer_reactions",
  "guest cannot list reactors",
);
await denied(
  "select user_id from public.prayer_posts",
  "anonymous author UUID is not publicly readable",
);
await actor("authenticated", b);
ok(
  (
    await rows(
      `delete from public.prayer_reactions where post_id='${p.id}' and user_id='${b}' returning post_id`,
    )
  ).length === 1,
  "can remove own reaction",
);
await db.exec("reset role");
await db.exec(
  `update public.prayer_posts set is_hidden=true where id='${p.id}'`,
);
await actor("anon");
ok(
  (await rows("select id, display_name from public.prayer_posts")).length ===
    0 && (await rows("select * from public.read_prayer_wall()")).length === 0,
  "hidden prayers absent from select and RPC",
);
await actor("authenticated", b);
await denied(
  `insert into public.prayer_reactions(post_id,user_id) values ('${p.id}','${b}')`,
  "cannot react to hidden posts",
);
const m2 = (
  await rows(
    `insert into public.chat_messages(room_id,user_id,body) values ('${room}','${b}','Visible briefly') returning id`,
  )
)[0];
await db.exec("reset role");
await db.exec(
  `update public.chat_messages set deleted_at=now() where id='${m2.id}'`,
);
await actor("anon");
ok(
  (await rows("select * from public.chat_messages")).length === 0,
  "soft-deleted messages absent to guests",
);
console.log(`${checks} PostgreSQL authorization checks passed`);
await db.close();

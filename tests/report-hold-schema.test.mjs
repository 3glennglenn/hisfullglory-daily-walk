import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
// Runs migration 013 (the two-reporter hold) on top of the earlier migrations and plays out who
// can hold what. Never loads 011: it needs pg_cron, pg_net and Vault, which PGlite does not have.
const names = ["author", "reporterA", "reporterB", "reporterC", "outsider", "circleOwner", "member", "flooder"];
const ids = names.map((_, i) => `e0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const [author, reporterA, reporterB, reporterC, outsider, circleOwner, member, flooder] = ids;
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log("PASS", label); };
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;insert into auth.users values ${ids.map(id => `('${id}')`).join(",")};`);
await db.exec(readFileSync("supabase/schema.sql", "utf8"));
for (const file of ["001_platform.sql", "002_support.sql", "003_aggregate_feed.sql", "004_qa_guards.sql", "005_topic_discussions.sql", "006_circles.sql", "007_account_deletion.sql", "008_word_filter.sql", "009_rls_auto_enable_grants.sql", "010_push.sql", "012_push_claim_where.sql"].filter(f => existsSync("supabase/migrations/" + f))) await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
const migration = readFileSync("supabase/migrations/013_report_hold.sql", "utf8");
await db.exec(migration);
await db.exec(migration);
ok(true, "013 applies twice without error");

const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
async function as(id, role) { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]); if (role) await db.exec("set role " + role); }
async function denied(run, label, codes = ["42501", "P0001", "23514"], message) {
  await assert.rejects(run, (e) => { assert.ok(codes.includes(e.code), label + " (" + e.code + " " + e.message + ")"); if (message) assert.ok(e.message.includes(message), label + ": message " + e.message); return true; });
  checks++; console.log("PASS", label);
}
const report = (kind, target, category = "spam") => db.query("select public.community_safety_action($1,$2,'report',$3,'')", [kind, target, category]);
const postState = async (id) => (await rows("select moderation_state from public.community_posts where id=$1", [id]))[0].moderation_state;
const feedIds = async (fn) => (await rows(`select id from public.${fn}()`)).map(r => r.id);

await db.query("insert into public.profiles(id,display_name) select id,'Fixture '||row_number() over() from auth.users");
await db.query("insert into public.community_terms(user_id,version) select id,'2026-10-07' from auth.users");

// Tracer: two people other than the author report one community post, and every reader loses it.
await as(author, "authenticated");
const held = (await rows("select public.publish_community_post('A reflection that two readers will report','reflection') id"))[0].id;
await as(reporterC, "authenticated");
const before = { feed: (await feedIds("read_community_feed")).filter(id => id === held).length, aggregate: (await feedIds("read_aggregate_feed")).filter(id => id === held).length };
ok(before.feed === 1 && before.aggregate === 1, "a published post is in both feeds before any report (1 and 1)");
await as(reporterA, "authenticated");
await report("post", held);
await as(reporterB, "authenticated");
await report("post", held);
await as(null);
ok(await postState(held) === "pending_review", "two distinct reporters move the post to pending_review");
await as(reporterC, "authenticated");
const after = { feed: (await feedIds("read_community_feed")).filter(id => id === held).length, aggregate: (await feedIds("read_aggregate_feed")).filter(id => id === held).length };
ok(before.feed === 1 && after.feed === 0 && before.aggregate === 1 && after.aggregate === 0, "a third reader's community feed and aggregate feed drop the post (count 1 before, 0 after)");

await as(null);
console.log(`${checks} report hold checks passed`);
await db.close();

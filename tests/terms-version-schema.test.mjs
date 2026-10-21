import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
// Runs migration 014 (the terms version switch) on top of the earlier migrations and plays out what
// changes for people who accepted the old version. Never loads 011: it needs pg_cron, pg_net and
// Vault, which PGlite does not have.
const OLD = "2026-10-07";
const NEW = "2026-10-19";
const ids = ["old", "fresh", "both", "guest"].map((_, i) => `f0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const [oldUser, freshUser, bothUser] = ids;
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log("PASS", label); };
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;insert into auth.users values ${ids.map(id => `('${id}')`).join(",")};`);
await db.exec(readFileSync("supabase/schema.sql", "utf8"));
for (const file of ["001_platform.sql", "002_support.sql", "003_aggregate_feed.sql", "004_qa_guards.sql", "005_topic_discussions.sql", "006_circles.sql", "007_account_deletion.sql", "008_word_filter.sql", "009_rls_auto_enable_grants.sql", "010_push.sql", "012_push_claim_where.sql", "013_report_hold.sql"].filter(f => existsSync("supabase/migrations/" + f))) await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));

const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
async function as(id, role) { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]); if (role) await db.exec("set role " + role); }
async function denied(run, label, codes = ["42501", "P0001", "23514"], message) {
  await assert.rejects(run, (e) => { assert.ok(codes.includes(e.code), label + " (" + e.code + " " + e.message + ")"); if (message) assert.ok(e.message.includes(message), label + ": message " + e.message); return true; });
  checks++; console.log("PASS", label);
}
const accept = (version) => db.query("select public.accept_community_terms($1)", [version]);
const publish = (body) => db.query("select public.publish_community_post($1,'reflection') id", [body]);

// Before 014 the database still wants the old version: this is the state the hosted project is in until 014 is applied.
await db.query("insert into public.profiles(id,display_name) select id,'Fixture '||row_number() over() from auth.users");
await as(oldUser, "authenticated");
await accept(OLD);
await publish("Written under the old rules before 014");
ok(true, "before 014 the old version is accepted and a post is published");
await as(null);
await db.query("insert into public.community_terms(user_id,version) values($1,$2)", [bothUser, OLD]);

const migration = readFileSync("supabase/migrations/014_terms_version.sql", "utf8");
await db.exec(migration);
await db.exec(migration);
ok(true, "014 applies twice without error");

// The version in force.
await as(null, "anon");
ok((await rows("select public.current_terms_version() v"))[0].v === NEW, "a guest can read the version in force, and it is " + NEW);
await as(freshUser, "authenticated");
ok((await rows("select public.current_terms_version() v"))[0].v === NEW, "a signed-in account reads the same version");
await as(null);
const acl = async (signature) => (await rows("select has_function_privilege('anon',p.oid,'execute') anon, has_function_privilege('authenticated',p.oid,'execute') authenticated, p.prosecdef secdef, p.provolatile vol, coalesce(p.proconfig::text like '%search_path=%',false) empty_path from pg_proc p where p.oid=$1::regprocedure", [signature]))[0];
const version = await acl("public.current_terms_version()");
ok(version.anon && version.authenticated && version.secdef && version.vol === "i" && version.empty_path, "current_terms_version is open to anon and authenticated, security definer, immutable, with an empty search_path");
const accepting = await acl("public.accept_community_terms(text)");
ok(!accepting.anon && accepting.authenticated && accepting.secdef && accepting.empty_path, "accept_community_terms keeps its grants (authenticated only) and its security settings");
const requiring = await acl("public.require_terms()");
ok(!requiring.anon && !requiring.authenticated && requiring.secdef && requiring.empty_path, "require_terms is still not callable by anon or authenticated");
const guard = await acl("public.legacy_terms_guard()");
ok(!guard.anon && !guard.authenticated, "legacy_terms_guard is untouched and still not callable by anon or authenticated");
ok((await rows("select pg_get_function_identity_arguments('public.accept_community_terms(text)'::regprocedure) args"))[0].args === "terms_version text", "accept_community_terms keeps its signature");
const source = (await rows("select prosrc from pg_proc where proname in('accept_community_terms','require_terms')")).map(r => r.prosrc).join("\n");
ok(!source.includes(OLD) && source.split("current_terms_version").length - 1 === 2, "neither function holds a date any more; both ask current_terms_version()");

// Accepting.
await as(freshUser, "authenticated");
await denied(() => accept(OLD), "accepting the old version is refused", ["P0001"], "Current terms and authentication required");
await denied(() => accept("old"), "accepting any other text is refused", ["P0001"], "Current terms and authentication required");
await denied(() => db.query("select public.accept_community_terms(null)"), "accepting nothing is refused", ["P0001", "23502"]);
ok((await rows("select count(*)::int n from public.community_terms where user_id=$1", [freshUser]))[0].n === 0, "the refused acceptances left nothing behind");
await as(null, "authenticated");
await denied(() => accept(NEW), "a guest cannot accept the new version either", ["P0001"], "Current terms and authentication required");
await as(freshUser, "authenticated");
await denied(() => publish("Fresh account, no acceptance yet"), "an account that accepted nothing cannot publish", ["P0001"], "Accept current community rules before publishing");
await accept(NEW);
await accept(NEW);
ok((await rows("select version from public.community_terms where user_id=$1", [freshUser])).map(r => r.version).join() === NEW, "accepting the new version succeeds, once recorded however often it is sent");
await publish("Fresh account after accepting the new rules");
ok(true, "after accepting the new version the post is published");

// A person who accepted only the old version.
await as(oldUser, "authenticated");
await denied(() => publish("Old acceptance only, after 014"), "an account that accepted only the old version cannot publish after 014", ["P0001"], "Accept current community rules before publishing");
// The 30-second posting pause belongs to the earlier post, not to the terms; lift it for this fixture.
await as(null);
await db.query("delete from public.community_posting_limits where user_id=$1", [oldUser]);
await as(oldUser, "authenticated");
await accept(NEW);
await publish("Old account after accepting the new rules");
ok(true, "after accepting the new version the same account can publish again");
await as(null);
ok((await rows("select version from public.community_terms where user_id=$1 order by version", [oldUser])).map(r => r.version).join() === `${OLD},${NEW}`, "the old acceptance stays on record next to the new one");
ok((await rows("select count(*)::int n from public.community_posts where user_id=$1", [oldUser]))[0].n === 2, "and the post written under the old rules is still there");

// The other callers of require_terms follow the new version at once. The prayer-wall insert is a raw table
// insert that the database owner makes here (the app reaches it through other paths); its terms guard is a trigger.
const prayer = () => db.query("insert into public.prayer_posts(user_id,display_name,body,post_type) values($1,'Fixture 3','A prayer request that needs the new rules','prayer')", [bothUser]);
await as(bothUser);
await denied(prayer, "the prayer-wall insert guard asks for the new version too", ["P0001"], "Accept current community rules before publishing");
await as(bothUser, "authenticated");
await accept(NEW);
await as(bothUser);
await prayer();
ok(true, "and lets the same account in once it accepted the new version");
await as(null);

// Supabase's API (pg_safeupdate) refuses an UPDATE or DELETE without WHERE, even inside a function,
// and PGlite does not; so look for one in every function in public.
const functions = (await rows("select p.proname,p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace"));
const deletes = /delete\s+from\s+[\w."]+/gi;
const guarded = /delete\s+from\s+[\w."]+\s+(?:(?:as\s+)?(?!where\b|using\b|returning\b)\w+\s+)?(?:where|using)\b/gi;
const unguardedDeletes = functions.filter(f => (f.prosrc.match(deletes) ?? []).length !== (f.prosrc.match(guarded) ?? []).length).map(f => f.proname);
ok(unguardedDeletes.length === 0, "every DELETE in a database function has a WHERE" + (unguardedDeletes.length ? ": " + unguardedDeletes.join(", ") : ""));
function updatesWithoutWhere(source) {
  let flat = source;
  for (let previous = ""; previous !== flat;) { previous = flat; flat = flat.replace(/\([^()]*\)/g, " "); }
  const missing = [];
  for (const m of flat.matchAll(/\bupdate\s+[\w."]+\s+set\b/gi)) {
    const statement = flat.slice(m.index).split(";")[0];
    if (!/\bwhere\b/i.test(statement)) missing.push(m[0]);
  }
  return missing;
}
const unguardedUpdates = functions.filter(f => updatesWithoutWhere(f.prosrc).length).map(f => f.proname);
ok(unguardedUpdates.length === 0, "every UPDATE in a database function has a WHERE" + (unguardedUpdates.length ? ": " + unguardedUpdates.join(", ") : ""));
ok(updatesWithoutWhere("begin update public.x set a=(select 1 where true); end").length === 1 && updatesWithoutWhere("begin update public.x set a=1 where id=2; end").length === 0, "the UPDATE guard itself catches a missing WHERE and accepts a present one");

// The three places that name the version hold the same date.
const appVersion = readFileSync("src/platform/auth.tsx", "utf8").match(/export const TERMS_VERSION = "([^"]+)"/)?.[1];
const siteVersion = readFileSync("site/src/data/legal.ts", "utf8").match(/export const termsVersion = "([^"]+)"/)?.[1];
ok(appVersion === NEW && siteVersion === NEW, "TERMS_VERSION (app) and termsVersion (site) both equal current_terms_version(): " + NEW);

console.log(`${checks} terms version checks passed`);
await db.close();

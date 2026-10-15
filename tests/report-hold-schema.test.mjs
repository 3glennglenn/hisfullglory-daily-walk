import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
// Runs migration 013 (the two-reporter hold) on top of the earlier migrations and plays out who
// can hold what. Never loads 011: it needs pg_cron, pg_net and Vault, which PGlite does not have.
const names = ["author", "reporterA", "reporterB", "reporterC", "outsider", "circleOwner", "member", "flooder", "leaver"];
const ids = names.map((_, i) => `e0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const [author, reporterA, reporterB, reporterC, outsider, circleOwner, member, flooder, leaver] = ids;
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
// "reset role" is the database owner: the operator in the SQL editor, and the fixture builder here.
async function as(id, role) { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]); if (role) await db.exec("set role " + role); }
async function denied(run, label, codes = ["42501", "P0001", "23514"], message) {
  await assert.rejects(run, (e) => { assert.ok(codes.includes(e.code), label + " (" + e.code + " " + e.message + ")"); if (message) assert.ok(e.message.includes(message), label + ": message " + e.message); return true; });
  checks++; console.log("PASS", label);
}
const report = (kind, target, category = "spam") => db.query("select public.community_safety_action($1,$2,'report',$3,'')", [kind, target, category]);
const reportAs = async (who, kind, target) => { await as(who, "authenticated"); await report(kind, target); await as(null); };
const hold = async (kind, target, a = reporterA, b = reporterB) => { await reportAs(a, kind, target); await reportAs(b, kind, target); };
const review = (kind, target, decision, note = "Reviewed by the operator") => db.query("select public.review_held_content($1,$2,$3,$4)", [kind, target, decision, note]);
const postState = async (id) => (await rows("select moderation_state from public.community_posts where id=$1", [id]))[0].moderation_state;
const feedIds = async (fn) => (await rows(`select id from public.${fn}()`)).map(r => r.id);
// The two feeds return 20 rows a page, newest first; page through them so an absence is never just "beyond page one".
async function feedHas(fn, id) {
  let cursor = [null, null];
  for (;;) {
    const page = await rows(`select id,created_at::text ct from public.${fn}(null,null,$1::timestamptz,$2::uuid)`, cursor);
    if (page.some(r => r.id === id)) return true;
    if (page.length < 20) return false;
    cursor = [page.at(-1).ct, page.at(-1).id];
  }
}
const reportStatuses = async (kind, target) => (await rows("select status from public.community_reports where target_kind=$1 and target_id=$2", [kind, target])).map(r => r.status);

// Fixtures are built as the database owner. The chat and prayer insert guards (cooldown) are switched
// off for the fixtures only; the terms guard stays, so every insert is made as a user who accepted them.
await db.query("insert into public.profiles(id,display_name) select id,'Fixture '||row_number() over() from auth.users");
await db.query("insert into public.community_terms(user_id,version) select id,'2026-10-07' from auth.users");
await db.exec("alter table public.chat_messages disable trigger chat_insert_guard;alter table public.prayer_posts disable trigger prayer_insert_guard");
let seq = 0;
async function addPost(extra = {}) {
  const p = { user: author, type: "reflection", topic: null, parent: null, circle: null, ...extra };
  await as(null);
  return (await rows("insert into public.community_posts(user_id,display_name,body,post_type,topic_id,parent_id,circle_id) values($1,'Fixture 1',$2,$3,$4,$5,$6) returning id", [p.user, "Fixture post number " + (++seq), p.type, p.topic, p.parent, p.circle]))[0].id;
}
const room = (await rows("insert into public.chat_rooms(slug,name,description,sort_order) values('general','General','Talk',1) returning id"))[0].id;
async function addChat() { await as(author); const id = (await rows("insert into public.chat_messages(room_id,user_id,display_name,body) values($1,$2,'Fixture 1',$3) returning id", [room, author, "Chat message " + (++seq)]))[0].id; await as(null); return id; }
async function addPrayer() { await as(author); const id = (await rows("insert into public.prayer_posts(user_id,display_name,body,post_type) values($1,'Fixture 1',$2,'prayer') returning id", [author, "Prayer request " + (++seq)]))[0].id; await as(null); return id; }
async function addSupport() {
  await as(null);
  return (await rows("insert into public.support_requests(user_id,title,story,category,declared_target,currency,expires_at,beneficiary_relationship,country,display_name,fundraiser_url,status,moderation_state) values($1,'Help with the rent','A story that is long enough to pass the thirty character minimum.','Basic needs',500,'USD',now()+interval '30 days','Friend','Netherlands','Fixture 1',$2,'approved','visible') returning id", [author, "https://www.gofundme.com/f/help-rent-" + (++seq)]))[0].id;
}

// Tracer: two people other than the author report one community post, and every reader loses it.
await as(author, "authenticated");
const held = (await rows("select public.publish_community_post('A reflection that two readers will report','reflection') id"))[0].id;
await as(reporterC, "authenticated");
const before = { feed: Number(await feedHas("read_community_feed", held)), aggregate: Number(await feedHas("read_aggregate_feed", held)) };
ok(before.feed === 1 && before.aggregate === 1, "a published post is in both feeds before any report (1 and 1)");
await reportAs(reporterA, "post", held);
ok(await postState(held) === "visible", "one reporter alone leaves a post visible");
await reportAs(reporterB, "post", held);
ok(await postState(held) === "pending_review", "two distinct reporters move the post to pending_review");
await as(reporterC, "authenticated");
const after = { feed: Number(await feedHas("read_community_feed", held)), aggregate: Number(await feedHas("read_aggregate_feed", held)) };
ok(before.feed === 1 && after.feed === 0 && before.aggregate === 1 && after.aggregate === 0, "a third reader's community feed and aggregate feed drop the post (count 1 before, 0 after)");
await as(null);
const postAudit = await rows("select old_state,new_state from public.moderation_audit where target_kind='post' and target_id=$1", [held]);
ok(postAudit.some(r => r.old_state === "visible" && r.new_state === "pending_review"), "the hold of a post is written to the moderation audit");

// Who does not count.
const solo = await addPost();
await reportAs(reporterB, "post", solo);
ok(await postState(solo) === "visible", "one reporter alone leaves a post visible");
await reportAs(reporterB, "post", solo);
ok(await postState(solo) === "visible" && (await reportStatuses("post", solo)).length === 1, "the same reporter twice is still one reporter");
const selfReported = await addPost();
await reportAs(author, "post", selfReported);
await reportAs(reporterB, "post", selfReported);
ok(await postState(selfReported) === "visible", "the author's own report plus one other reporter does not hold the post");
await reportAs(reporterC, "post", selfReported);
ok(await postState(selfReported) === "pending_review", "the author's report is ignored, so a second other reporter holds it");
await as(reporterC, "authenticated");
await denied(() => report("post", held), "a third report on a held post is refused", ["P0001"], "Visible target required");
await as(author, "authenticated");
ok((await rows("select id from public.community_reports where target_id=$1", [held])).length === 0, "the author cannot read the reports about their own held post");
await as(reporterC, "authenticated");
ok((await rows("select id from public.community_reports where target_id=$1", [held])).length === 0, "a reader who did not report cannot read the reports either");

// Report kinds.
await as(null);
await db.query("insert into public.community_reports(reporter_id,target_kind,target_id,category) values($1,'walk_reflection',gen_random_uuid(),'other')", [reporterC]);
ok(true, "community_reports accepts target_kind walk_reflection");
await denied(() => db.query("insert into public.community_reports(reporter_id,target_kind,target_id,category) values($1,'verse_reading',gen_random_uuid(),'other')", [reporterC]), "other kinds (verse readings, stories, answers) are not stored under their own name", ["23514"]);
await as(reporterC, "authenticated");
await denied(() => report("walk_reflection", held), "community_safety_action has no walk_reflection branch yet (Phase 4 adds it)", ["P0001"], "Invalid target");

// The four storage shapes.
const chat = await addChat();
await as(reporterC, "authenticated");
ok(await feedHas("read_aggregate_feed", chat) && (await rows("select id from public.chat_messages where id=$1", [chat])).length === 1, "a chat message is in the aggregate feed and readable before any report");
await reportAs(reporterA, "chat", chat);
ok((await rows("select is_hidden from public.chat_messages where id=$1", [chat]))[0].is_hidden === false, "one report leaves a chat message visible");
await reportAs(reporterB, "chat", chat);
ok((await rows("select is_hidden from public.chat_messages where id=$1", [chat]))[0].is_hidden === true, "two reporters hide a chat message (is_hidden true)");
const chatAudit = await rows("select actor,old_state,new_state from public.moderation_audit where target_kind='chat' and target_id=$1", [chat]);
ok(chatAudit.length === 1 && chatAudit[0].actor === "system" && chatAudit[0].new_state === "hidden", "the chat hold is audited with actor system");
await as(reporterC, "authenticated");
ok((await rows("select id from public.chat_messages where id=$1", [chat])).length === 0, "a signed-in reader gets 0 rows for the held chat message through RLS");
await as(null, "anon");
ok((await rows("select id from public.chat_messages where id=$1", [chat])).length === 0, "a guest gets 0 rows for the held chat message through RLS");
await as(reporterC, "authenticated");
ok(!(await feedHas("read_aggregate_feed", chat)), "the aggregate feed no longer returns the held chat message");

const prayer = await addPrayer();
await as(reporterC, "authenticated");
ok(await feedHas("read_aggregate_feed", prayer) && (await feedIds("read_prayer_wall")).includes(prayer), "a prayer request is on the wall and in the aggregate feed before any report");
await hold("prayer", prayer);
await as(reporterC, "authenticated");
ok((await rows("select is_hidden from public.prayer_posts where id=$1", [prayer])).length === 0 && !(await feedIds("read_prayer_wall")).includes(prayer), "two reporters take a prayer request off the prayer wall and out of RLS reads");
ok(!(await feedHas("read_aggregate_feed", prayer)), "the aggregate feed no longer returns the held prayer request");
await as(null);
const prayerAudit = await rows("select actor from public.moderation_audit where target_kind='prayer' and target_id=$1", [prayer]);
ok(prayerAudit.length === 1 && prayerAudit[0].actor === "system", "the prayer hold is audited with actor system");

const support = await addSupport();
await as(reporterC, "authenticated");
ok((await feedIds("read_support_requests")).includes(support), "an approved support request is listed before any report");
await reportAs(reporterA, "support", support);
await as(reporterC, "authenticated");
ok((await feedIds("read_support_requests")).includes(support), "one report leaves a support request listed");
await reportAs(reporterB, "support", support);
await as(reporterC, "authenticated");
ok(!(await feedIds("read_support_requests")).includes(support), "two reporters take a support request out of the directory");
await as(null);
ok((await rows("select moderation_state from public.support_requests where id=$1", [support]))[0].moderation_state === "pending_review", "the held support request is pending_review");

// Circle isolation.
await as(circleOwner, "authenticated");
const circle = (await rows("select public.create_circle('hold-circle','Hold Circle','A private circle for the hold test','private',null,'') id"))[0].id;
await as(null);
await db.query("insert into public.circle_memberships(circle_id,user_id,display_name,role,state) values($1,$2,'Fixture 7','member','active'),($1,$3,'Fixture 2','member','active')", [circle, member, reporterA]);
const circlePost = await addPost({ user: circleOwner, circle });
const circleList = async (who) => { await as(who, "authenticated"); const r = (await rows("select public.read_circle_discussions($1) result", [circle]))[0].result; await as(null); return r; };
ok((await circleList(member)).some(p => p.id === circlePost), "a Circle member reads the Circle post before any report");
await as(outsider, "authenticated");
await denied(() => report("post", circlePost), "a non-member cannot report a private Circle post, and so cannot hold it", ["P0001"], "Visible target required");
await as(null);
ok(await postState(circlePost) === "visible" && (await reportStatuses("post", circlePost)).length === 0, "the refused report leaves nothing behind");
await reportAs(member, "post", circlePost);
ok(await postState(circlePost) === "visible", "one member's report leaves the Circle post visible");
await reportAs(reporterA, "post", circlePost);
ok(await postState(circlePost) === "pending_review", "two members' reports hold the Circle post");
ok(!(await circleList(member)).some(p => p.id === circlePost), "after the hold another Circle member's read_circle_discussions no longer returns the post");
ok(!(await circleList(circleOwner)).some(p => p.id === circlePost), "nor does the Circle owner's discussion list");
ok(!(await circleList(outsider)).some(p => p.id === circlePost), "an outsider still learns nothing about the Circle post");
await as(circleOwner, "authenticated");
const circleReports = (await rows("select public.read_circle_reports($1) result", [circle]))[0].result;
ok(circleReports.filter(r => r.target_id === circlePost).length === 2, "the Circle owner's read_circle_reports still lists both reports of the held post");
ok(!JSON.stringify(circleReports).includes(member) && !JSON.stringify(circleReports).includes(reporterA), "and shows no reporter identity");

// Reply counts and lists (UI-SPEC E7).
const thread = await addPost({ topic: "anxiety" });
const reply1 = await addPost({ topic: "anxiety", parent: thread });
const reply2 = await addPost({ topic: "anxiety", parent: thread });
const topicItems = async (replyTo = null) => { await as(reporterC, "authenticated"); const r = (await rows("select public.read_topic_discussions('anxiety',$1) result", [replyTo]))[0].result; await as(null); return r; };
ok((await topicItems()).find(i => i.id === thread).replies === 2, "a thread shows 2 replies before any report");
await hold("post", reply1);
ok((await topicItems()).find(i => i.id === thread).replies === 1, "a held reply no longer counts in the thread's reply count (2 before, 1 after)");
ok(JSON.stringify((await topicItems(thread)).map(i => i.id)) === JSON.stringify([reply2]), "and the reply list leaves out the held reply, with no placeholder");
await hold("post", thread, reporterB, reporterC);
ok(!(await topicItems()).some(i => i.id === thread), "a held thread is absent from the topic list");
await as(reporterC, "authenticated");
ok((await rows("select public.read_topic_thread('anxiety',$1) result", [thread]))[0].result === null, "and read_topic_thread returns nothing for it");
ok((await topicItems(thread)).length === 0, "replies under a held thread cannot be reached");
await as(null);

// Flood cap.
const targets = (await rows("insert into public.community_posts(user_id,display_name,body,post_type) select $1,'Fixture 1','Flood target '||g,'reflection' from generate_series(1,31) g returning id", [author])).map(r => r.id);
await as(flooder, "authenticated");
for (const id of targets.slice(0, 30)) await report("post", id);
ok(true, "an account can file 30 reports within an hour");
await denied(() => report("post", targets[30]), "the 31st report within an hour is refused with Report limit reached", ["P0001"], "Report limit reached");
await as(null);
await db.query("update public.community_reports set created_at=now()-interval '2 hours' where reporter_id=$1", [flooder]);
await as(flooder, "authenticated");
await report("post", targets[30]);
ok(true, "reports older than an hour do not count toward the cap");
await as(null);

// Operator review.
await as(reporterC, "authenticated");
await denied(() => review("post", held, "restore"), "review_held_content is denied to a signed-in account", ["42501"]);
await as(null, "anon");
await denied(() => review("post", held, "restore"), "review_held_content is denied to a guest", ["42501"]);
await as(null);
const acl = async (signature) => (await rows("select p.proacl::text acl, has_function_privilege('anon',p.oid,'execute') anon, has_function_privilege('authenticated',p.oid,'execute') authenticated from pg_proc p where p.oid=$1::regprocedure", [signature]))[0];
for (const signature of ["public.review_held_content(text,uuid,text,text)", "public.hold_if_reported_twice()"]) {
  const row = await acl(signature);
  ok(row.acl !== null && !/(^\{|,)=X\//.test(row.acl) && !row.anon && !row.authenticated, signature + " is not executable by public, anon or authenticated");
}
const safety = await acl("public.community_safety_action(text,uuid,text,text,text)");
ok(safety.authenticated && !safety.anon, "community_safety_action keeps its grants (authenticated only)");
ok((await rows("select pg_get_function_identity_arguments('public.community_safety_action(text,uuid,text,text,text)'::regprocedure) args"))[0].args === "target_kind text, target_id uuid, action_name text, report_category text, report_note text", "and its signature");
await denied(() => review("post", held, "approve"), "an unknown decision is refused", ["P0001"], "Valid decision required");
await denied(() => review("walk_reflection", held, "restore"), "an unknown item kind is refused", ["P0001"], "Valid item required");
await denied(() => review("post", solo, "restore"), "an item that is not held cannot be reviewed", ["P0001"], "Held item not found");

await review("post", held, "restore", "Checked, nothing wrong");
ok(await postState(held) === "visible", "restore makes the post visible again");
ok((await reportStatuses("post", held)).every(s => s === "resolved") && (await reportStatuses("post", held)).length === 2, "restore resolves its 2 reports");
await as(reporterC, "authenticated");
ok(await feedHas("read_community_feed", held), "the restored post is back in the feed");
await report("post", held);
await as(null);
ok(await postState(held) === "visible", "a restored post is not held again by the next single report");
const reviewAudit = await rows("select actor,note from public.moderation_audit where target_kind='post' and target_id=$1 and note like 'review:%'", [held]);
ok(reviewAudit.length === 1 && reviewAudit[0].note === "review: Checked, nothing wrong", "the reviewer's reason is written to the audit");

const keep = await addPost();
await hold("post", keep);
await review("post", keep, "keep_hidden");
ok(await postState(keep) === "hidden" && (await reportStatuses("post", keep)).every(s => s === "resolved"), "keep_hidden sets hidden and resolves the reports");
const removed = await addPost();
await hold("post", removed);
await review("post", removed, "remove");
ok(await postState(removed) === "removed" && (await reportStatuses("post", removed)).every(s => s === "resolved"), "remove sets removed and resolves the reports");
await review("post", circlePost, "restore");
ok(await postState(circlePost) === "visible" && (await circleList(member)).some(p => p.id === circlePost), "restoring a Circle post puts it back in the Circle for its members");

await review("chat", chat, "restore");
ok((await rows("select is_hidden from public.chat_messages where id=$1", [chat]))[0].is_hidden === false && (await reportStatuses("chat", chat)).every(s => s === "resolved"), "restoring a chat message sets is_hidden false and resolves its reports");
const chat2 = await addChat();
await hold("chat", chat2, reporterB, reporterC);
await review("chat", chat2, "remove");
const gone = (await rows("select is_hidden,deleted_at from public.chat_messages where id=$1", [chat2]))[0];
ok(gone.is_hidden === true && gone.deleted_at !== null, "removing a chat message hides it for good (is_hidden true, deleted_at set)");
await review("prayer", prayer, "restore");
await as(reporterC, "authenticated");
ok((await feedIds("read_prayer_wall")).includes(prayer), "restoring a prayer request puts it back on the wall");
await as(null);
const prayer2 = await addPrayer();
await hold("prayer", prayer2, reporterB, reporterC);
await review("prayer", prayer2, "keep_hidden");
ok((await rows("select is_hidden from public.prayer_posts where id=$1", [prayer2]))[0].is_hidden === true && (await reportStatuses("prayer", prayer2)).every(s => s === "resolved"), "keep_hidden leaves a prayer request hidden and resolves its reports");
await review("support", support, "restore");
await as(reporterC, "authenticated");
ok((await feedIds("read_support_requests")).includes(support), "restoring a support request lists it again");
await as(null);
ok((await reportStatuses("support", support)).every(s => s === "resolved"), "and resolves its reports");

// Deleting an account.
const orphan = await addPost();
await hold("post", orphan, leaver, reporterC);
await db.query("delete from auth.users where id=$1", [leaver]);
ok(await postState(orphan) === "pending_review" && (await reportStatuses("post", orphan)).length === 1, "deleting one reporter's account leaves the item held");

// Concurrency cannot be exercised on one PGlite connection; at least prove the lock comes before the count.
const triggerSource = (await rows("select prosrc from pg_proc where proname='hold_if_reported_twice'"))[0].prosrc;
ok(triggerSource.indexOf("pg_advisory_xact_lock(hashtextextended('report-hold:'") > -1 && triggerSource.indexOf("pg_advisory_xact_lock") < triggerSource.indexOf("count(distinct"), "the trigger takes the per-item advisory lock before it counts (concurrent reports are a backstop PGlite cannot prove)");

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

// Reader coverage: a function that reads the four content tables must hold back held content, or
// be a write or an operation. A new reader that forgets the predicate fails here instead of leaking.
const allowed = {
  // writes: they act on one row the caller owns or may moderate, and return nothing a reader lists
  publish_community_post: "write: inserts the caller's own post",
  publish_topic_post: "write: inserts a reply and refuses a parent that is not visible (moderation_state<>'visible')",
  delete_community_post: "write: the author may delete their own post even while it is held",
  close_support_request: "write: the author closes their own request",
  save_support_draft: "write: the author's own draft",
  submit_support_request: "write: the author's own submission",
  // operations: only moderators or the database owner can run them
  moderate_circle_post: "operation: a Circle owner or moderator decides, so it must reach held posts",
  read_circle_reports: "operation: Circle moderators must still see the reports of a held post",
  review_support_request: "operation: database owner only",
  review_held_content: "operation: database owner only, it is what releases a hold",
  hold_if_reported_twice: "operation: the trigger that sets the hold",
  // helpers and triggers that return no content
  contribution_score: "helper: counts supporters of an id the calling reader has already filtered",
  push_after_prayer_reaction: "trigger: reads only the author to notify, never shows content",
  push_after_wall_reaction: "trigger: reads only the author to notify, never shows content",
};
const touching = functions.filter(f => /(community_posts|chat_messages|prayer_posts|support_requests)/i.test(f.prosrc));
const uncovered = touching.filter(f => !allowed[f.proname] && !/moderation_state\s*=\s*'visible'|is_hidden|circle_post_visible/i.test(f.prosrc)).map(f => f.proname);
ok(uncovered.length === 0, "reader coverage: every function that reads community_posts, chat_messages, prayer_posts or support_requests holds back held content or is on the writes-and-operations allowlist" + (uncovered.length ? ": " + uncovered.join(", ") : ""));
const names013 = new Set(functions.map(f => f.proname));
ok(Object.keys(allowed).every(name => names013.has(name)), "and the allowlist names only functions that exist");
ok(uncovered.length === 0 && ["read_community_feed", "read_aggregate_feed", "read_prayer_wall", "read_support_requests", "read_topic_discussions", "read_topic_thread", "read_circle_discussions", "read_circle_thread"].every(name => touching.some(f => f.proname === name && !allowed[name])), "the readers themselves are checked, not allowlisted");

await as(null);
console.log(`${checks} report hold checks passed`);
await db.close();

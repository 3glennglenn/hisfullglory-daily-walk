import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const a = "a0000000-0000-4000-8000-000000000001",
  b = "b0000000-0000-4000-8000-000000000002";
let checks = 0;
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const ok = (v, label) => {
  assert.ok(v, label);
  checks++;
  console.log("PASS", label);
};
async function denied(sql, label, params) {
  let failed = false;
  try {
    await db.query(sql, params);
  } catch {
    failed = true;
  }
  ok(failed, label);
}
async function actor(role, id = "") {
  await db.exec(
    `reset role;set role ${role};select set_config('request.jwt.claim.sub','${id}',false)`,
  );
}
await db.exec(
  `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values('${a}'),('${b}');`,
);
await db.exec(readFileSync("supabase/schema.sql", "utf8"));
for (let i = 0; i < 2; i++)
  for (const file of [
    "001_platform.sql",
    "002_support.sql",
    "003_aggregate_feed.sql",
    "004_qa_guards.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
ok(true, "all additive migrations rerun");
await actor("authenticated", a);
await db.exec(
  `insert into public.profiles(id,display_name) values('${a}','Alice')`,
);
await denied(
  "select public.publish_community_post('A private reflection','reflection',null,false)",
  "posting without current terms rejected",
);
await denied(
  `insert into public.chat_messages(room_id,user_id,body) values('c90c5140-3929-4e0d-935c-000000000001','${a}','legacy bypass')`,
  "legacy chat requires terms",
);
await denied(
  "select public.accept_community_terms('old')",
  "old terms rejected",
);
await db.exec("select public.accept_community_terms('2026-10-07')");
await denied(
  `insert into public.community_terms values('${b}','2026-10-07',now())`,
  "cannot accept for another user or forge timestamp",
);
const post = (
  await rows(
    "select public.publish_community_post('God brought encouragement today','reflection','/bible/romans/8/28',true) id",
  )
)[0].id;
await denied(
  "select public.publish_community_post('Another reflection','reflection',null,false)",
  "server cooldown enforced",
);
await denied(
  `update public.community_posts set moderation_state='visible'`,
  "cannot set moderation fields",
);
await denied(
  `select * from public.community_posts`,
  "raw anonymous author IDs inaccessible",
);
await actor("anon");
const feed = await rows("select * from public.read_aggregate_feed()");
ok(
  feed.length === 1 &&
    feed[0].display_name === "Anonymous" &&
    !("user_id" in feed[0]),
  "guest sees anonymous snapshot without ownership UUID",
);
await denied(
  "select * from public.community_reports",
  "guest cannot read reports",
);
await denied(
  "select * from public.moderation_audit",
  "guest cannot read audit",
);
await denied(
  "select public.publish_community_post('guest post','reflection',null,false)",
  "guest cannot publish",
);
await actor("authenticated", b);
await db.exec(
  `insert into public.profiles(id,display_name) values('${b}','Bob');select public.accept_community_terms('2026-10-07')`,
);
await denied(
  `select public.delete_community_post('${post}')`,
  "another user cannot delete post",
);
await db.exec(`select public.react_community_post('${post}','amen')`);
ok(
  (await rows(`select amen_count from public.read_community_feed()`))[0]
    .amen_count === 1,
  "aggregate reaction counted without identity",
);
await denied(
  `select * from public.community_reactions`,
  "reaction identities private",
);
await db.exec(
  `select public.community_safety_action('post','${post}','report','scam','Check this contribution')`,
);
ok(
  (await rows("select * from public.community_reports")).length === 1,
  "reporter can read own private report",
);
await actor("authenticated", a);
ok(
  (await rows("select * from public.community_reports")).length === 0,
  "reported author cannot read report",
);
await actor("authenticated", b);
await db.exec(
  `select public.community_safety_action('post','${post}','block')`,
);
ok(
  (await rows("select * from public.read_aggregate_feed()")).length === 0,
  "blocked anonymous author disappears from feed",
);
await actor("authenticated", a);
await denied(
  "select * from public.user_blocks",
  "raw block author identities inaccessible",
);
ok(
  (await rows("select * from public.read_own_blocks()")).length === 0,
  "cannot read another user block list",
);
await actor("authenticated", b);
const ownBlocks = await rows("select * from public.read_own_blocks()");
ok(
  ownBlocks.length === 1 &&
    !("blocked_id" in ownBlocks[0]) &&
    ownBlocks[0].id !== a,
  "block management exposes only opaque block IDs",
);
await denied(
  `select public.author_is_blocked('${a}')`,
  "no callable author UUID block oracle",
);
await db.exec(`select public.remove_block('${ownBlocks[0].id}')`);
await actor("authenticated", a);
const draftSql =
  "select public.save_support_draft($1,$2,$3,$4,$5,$6,now()+interval '30 days',$7,$8,$9,$10) id";
const args = [
  null,
  "Help our community",
  "We need supplies for a local community service project.",
  "Community service",
  500,
  "USD",
  "Project organizer",
  "Netherlands",
  true,
  "https://www.gofundme.com/f/community-project",
];
const request = (await rows(draftSql, args))[0].id;
await actor("anon");
ok(
  (await rows("select * from public.read_support_requests()")).length === 0,
  "draft support request never public",
);
await denied(
  "select * from public.support_requests",
  "guest cannot inspect private drafts",
);
await actor("authenticated", b);
ok(
  (await rows("select * from public.support_requests")).length === 0,
  "another author cannot see drafts",
);
await denied(
  draftSql,
  "active external campaign cannot be duplicated by another author",
  args,
);
await denied(draftSql, "cannot edit another user draft", [
  request,
  ...args.slice(1),
]);
await denied(
  `select public.submit_support_request('${request}')`,
  "cannot submit another user draft",
);
await denied(
  `select public.close_support_request('${request}',true)`,
  "cannot delete another user request",
);
await denied(
  `select public.review_support_request('${request}','approved','I approve myself')`,
  "clients cannot approve requests",
);
await denied(
  "update public.support_requests set status='approved'",
  "client cannot forge approval",
);
await denied(
  "select * from public.support_review_notes",
  "review notes private",
);
await actor("authenticated", a);
await actor("postgres");
await db.exec(`delete from public.community_terms where user_id='${a}'`);
await actor("authenticated", a);
await denied(
  `select public.submit_support_request('${request}')`,
  "support submission requires current terms",
);
await db.exec("select public.accept_community_terms('2026-10-07')");
await db.exec(`select public.submit_support_request('${request}')`);
ok(
  (await rows("select * from public.read_support_requests()")).length === 0,
  "under_review remains private",
);
await denied(draftSql, "cannot edit submitted request", [
  request,
  ...args.slice(1),
]);
await actor("postgres");
await db.exec(
  `select public.review_support_request('${request}','approved','Verified link and beneficiary relationship manually')`,
);
await actor("anon");
const published = await rows("select * from public.read_support_requests()");
ok(
  published.length === 1 &&
    published[0].display_name === "Anonymous" &&
    !("user_id" in published[0]),
  "reviewed public request strips owner and audit information",
);
await actor("authenticated", b);
await db.exec(
  `select public.community_safety_action('support','${request}','mute')`,
);
ok(
  (await rows("select * from public.read_support_requests()")).length === 0,
  "muted support author filtered",
);
await actor("postgres");
await db.exec(
  `update public.support_requests set expires_at=now()-interval '1 day' where id='${request}'`,
);
await actor("anon");
ok(
  (await rows("select * from public.read_support_requests()")).length === 0,
  "expired requests excluded",
);
await actor("authenticated", b);
for (const url of [
  "https://www.gofundme.com.evil.org/f/scam",
  "https://www.gofundme.com/f/good?x=bad",
  "https://user@www.gofundme.com/f/good",
])
  await denied(draftSql, "server rejects allowlist bypass", [
    null,
    ...args.slice(1, 9),
    url,
  ]);
await denied(draftSql, "server rejects bank/payment instructions", [
  null,
  args[1],
  "Send payment through PayPal directly for this project.",
  ...args.slice(3, 9),
  "https://www.gofundme.com/f/another-project",
]);
for (const instruction of [
  "Send to https://wise.com/pay/me for this community project.",
  "Use www.revolut.me/example to fund our community project.",
  "Account number 12345678901 for this community project.",
  "Card number 4111 1111 1111 1111 for this community project.",
  "Stuur naar rekeningnummer 123456789 voor dit project.",
  "Send a wire transfer for this community project.",
])
  await assert.rejects(
    () =>
      db.query(draftSql, [
        null,
        args[1],
        instruction,
        ...args.slice(3, 9),
        "https://www.gofundme.com/f/guard-regression",
      ]),
    /No direct payment details/,
  );
ok(
  true,
  "direct support RPC rejects all six alternate transfer instructions for the intended reason",
);
await actor("postgres");
await db.exec(
  `update public.community_posts set moderation_state='hidden' where id='${post}'`,
);
await actor("anon");
ok(
  (await rows("select * from public.read_aggregate_feed()")).length === 0,
  "hidden content excluded from all public feeds",
);
await actor("authenticated", a);
await db.exec(`select public.delete_community_post('${post}')`);
await denied(
  "select public.publish_community_post('Different words','reflection',null,false)",
  "deletion cannot bypass cooldown",
);
await actor("postgres");
ok(
  (await rows("select * from public.moderation_audit")).length >= 2,
  "private moderation audit populated",
);
await db.exec(
  `update public.community_posting_limits set last_post_at=now()-interval '1 day' where user_id='${a}'`,
);
await actor("authenticated", a);
const prayer = (
  await rows(
    "select public.publish_community_post('Please pray for our family','prayer',null,false) id",
  )
)[0].id;
await denied(
  `select public.update_public_prayer('${prayer}','Answered','')`,
  "public answer needs an explicit reflection",
);
await actor("authenticated", b);
await denied(
  `select public.update_public_prayer('${prayer}','Answered','I forge an answer')`,
  "cannot alter another author prayer lifecycle",
);
await actor("authenticated", a);
await db.exec(
  `select public.update_public_prayer('${prayer}','Answered','A neighbor supported our family')`,
);
ok(
  (await rows("select * from public.read_community_feed(null,'prayer')"))[0]
    .prayer_status === "Answered",
  "public prayer answer changes only owned visible prayer",
);
await actor("postgres");
await db.exec(
  `insert into public.community_posts(user_id,display_name,body,post_type,created_at) select '${a}','Alice','Pagination reflection '||n,'reflection',now()-n*interval '1 minute' from generate_series(1,25) n`,
);
await actor("anon");
const first = await rows(
  "select * from public.read_aggregate_feed(null,'reflection')",
);
const last = first.at(-1);
const next = await rows(
  "select * from public.read_aggregate_feed(null,'reflection',$1,$2)",
  [last.created_at, last.id],
);
ok(
  first.length === 20 &&
    next.length === 5 &&
    !next.some((p) => first.some((q) => p.id === q.id)),
  "aggregate cursor paginates without duplicate rows",
);
await actor("postgres");
await db.exec(
  `update public.community_posts set moderation_state='pending_review' where id='${prayer}'`,
);
await actor("anon");
ok(
  (await rows("select * from public.read_community_feed(null,'prayer')"))
    .length === 0,
  "pending_review content is not public",
);
await actor("postgres");
const fullPrayer = (
  await rows(
    `insert into public.community_posts(user_id,display_name,body,post_type,prayer_status) values('${a}','Alice',repeat('p',2000),'prayer','Active') returning id`,
  )
)[0].id;
await actor("authenticated", a);
await db.query(
  "select public.update_public_prayer($1,'Answered','An explicit public answer')",
  [fullPrayer],
);
const fullAnswer = (
  await rows("select * from public.read_community_feed(null,'prayer')")
).find((p) => p.id === fullPrayer);
ok(
  fullAnswer?.body.includes("An explicit public answer") &&
    fullAnswer?.body.startsWith("p".repeat(2000)),
  "maximum-length prayer accepts an answer without losing original text",
);
await assert.rejects(
  () =>
    db.query("select public.update_public_prayer($1,null,'Invalid')", [
      fullPrayer,
    ]),
  /Valid status/,
);
await assert.rejects(
  () =>
    db.query("select public.update_public_prayer($1,'Answered',null)", [
      fullPrayer,
    ]),
  /Valid status/,
);
ok(true, "null status or answer cannot bypass prayer validation");
await db.query(
  "select public.update_public_prayer($1,'Waiting','A new public update')",
  [fullPrayer],
);
await db.query("select public.update_public_prayer($1,'Archived','')", [
  fullPrayer,
]);
ok(
  (await rows("select * from public.read_aggregate_feed(null,'prayer')"))
    .find((p) => p.id === fullPrayer)
    ?.body.includes("A new public update"),
  "aggregate feed retains public answer and update history after archive",
);
await actor("authenticated", b);
await denied(
  "select prayer_updates from public.community_posts",
  "raw public prayer history remains behind constrained feed RPCs",
);
await denied(
  "update public.community_posts set prayer_updates='Forged answer'",
  "ordinary client cannot forge prayer update history",
);
await actor("postgres");
ok(
  (
    await rows(
      "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
    )
  ).length === 0,
  "RLS enabled on every public table",
);
ok(
  (
    await rows(
      "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig @> ARRAY['search_path=\"\"'],false)",
    )
  ).length === 0,
  "all security definer functions use an empty search path",
);
await actor("postgres");
const unsafeApproved = (
  await rows(
    `insert into public.support_requests(user_id,title,story,category,declared_target,currency,expires_at,beneficiary_relationship,country,display_name,fundraiser_url,status,moderation_state) values('${a}','Old approved request','Send to https://wise.com/pay/me for this community project.','Community service',500,'USD',now()+interval '30 days','Organizer','Netherlands','Alice','https://www.gofundme.com/f/old-approved-fixture','approved','visible') returning id`,
  )
)[0].id;
await actor("anon");
ok(
  !(await rows("select * from public.read_support_requests()")).some(
    (r) => r.id === unsafeApproved,
  ),
  "pre-existing approved records with direct payment instructions fail closed",
);
await actor("postgres");
const beforeUpgrade = await rows(
  "select id,body,prayer_updates,prayer_status from public.community_posts order by id",
);
await db.exec(readFileSync("supabase/migrations/004_qa_guards.sql", "utf8"));
assert.deepEqual(
  await rows(
    "select id,body,prayer_updates,prayer_status from public.community_posts order by id",
  ),
  beforeUpgrade,
);
ok(
  true,
  "QA migration reruns over populated data without changing prayers or history",
);
await assert.rejects(
  () =>
    db.query(
      "select public.review_support_request($1,'fundraising','Operator rechecks the older unsafe campaign')",
      [unsafeApproved],
    ),
  /No direct payment details/,
);
ok(true, "privileged review cannot promote an older unsafe approved campaign");
await db.close();
console.log(`${checks} platform authorization checks passed`);

import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
// Runs migrations 010 and 012 (push notifications) on top of the earlier ones and plays out who gets
// which notification, as the sender would claim them.
const ids = Array.from({length:3}, (_, i) => `d0000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`);
const [author, reactor, other] = ids;
let checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;console.log("PASS",label);};
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;insert into auth.users values ${ids.map(id=>`('${id}')`).join(",")};`);
await db.exec(readFileSync("supabase/schema.sql","utf8"));
for(const file of ["001_platform.sql","002_support.sql","003_aggregate_feed.sql","004_qa_guards.sql","005_topic_discussions.sql","006_circles.sql","007_account_deletion.sql","008_word_filter.sql","009_rls_auto_enable_grants.sql"].filter(f=>existsSync("supabase/migrations/"+f))) await db.exec(readFileSync("supabase/migrations/"+file,"utf8"));
const migration=readFileSync("supabase/migrations/010_push.sql","utf8");
const claimFix=readFileSync("supabase/migrations/012_push_claim_where.sql","utf8");
await db.exec(migration);
await db.exec(claimFix);
await db.exec(migration);
await db.exec(claimFix);
ok(true,"010 and 012 apply twice without error");
// Supabase's API (pg_safeupdate) refuses a DELETE without WHERE, even inside a function, and
// PGlite does not; so look for one in every function in public.
const deletes=/delete\s+from\s+[\w."]+/gi;
const guarded=/delete\s+from\s+[\w."]+\s+(?:(?:as\s+)?(?!where\b|using\b|returning\b)\w+\s+)?(?:where|using)\b/gi;
const unguarded=(await db.query("select p.proname,p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace")).rows
  .filter(f=>(f.prosrc.match(deletes)??[]).length!==(f.prosrc.match(guarded)??[]).length)
  .map(f=>f.proname);
ok(unguarded.length===0,"every DELETE in a database function has a WHERE"+(unguarded.length?": "+unguarded.join(", "):""));
await db.query("insert into public.profiles(id,display_name) select id,'Fixture '||row_number() over() from auth.users");
const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function as(id,role){await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??""]);if(role)await db.exec("set role "+role);}
async function denied(run,label,codes=["42501","P0001","23514"]){await assert.rejects(run,(e)=>{assert.ok(codes.includes(e.code),label+" ("+e.code+" "+e.message+")");return true;});checks++;console.log("PASS",label);}
const key="B"+"x".repeat(86), secret="a".repeat(22);
const endpoint=(n)=>`https://fcm.googleapis.com/fcm/send/device-${n}`;
const save=(e,daily,time,zone,prayed)=>db.query("select public.save_push_subscription($1,$2,$3,$4,$5::time,$6,$7)",[e,key,secret,daily,time,zone,prayed]);

// A zone where it is daytime now, so a reminder can be due in this test whenever it runs.
const zone=(await rows(`select z from unnest(array['Pacific/Honolulu','America/New_York','Europe/Amsterdam','Asia/Tokyo','Australia/Sydney']) z where extract(hour from now() at time zone z) between 6 and 20 limit 1`))[0].z;
const justNow=(await rows("select to_char((now() at time zone $1) - interval '1 minute','HH24:MI') t",[zone]))[0].t;

await as(null,"anon");
await save(endpoint("guest"),true,justNow,zone,false);
ok(true,"a guest can turn on a daily reminder");
await denied(()=>save(endpoint("guest2"),true,"07:30",zone,true),"a guest cannot ask for prayer notifications");
await denied(()=>save("https://evil.example.com/collect",true,"07:30",zone,false),"only real push services are accepted");
await denied(()=>save(endpoint("guest3"),true,"07:30","Mars/Olympus",false),"an unknown time zone is refused");
await denied(()=>save(endpoint("guest4"),true,"03:00",zone,false),"a reminder in the middle of the night is refused");
await denied(()=>db.query("select * from public.push_subscriptions"),"guests cannot read subscriptions");
await denied(()=>db.query("select * from public.claim_push_batch()"),"guests cannot claim what is due");
await as(author,"authenticated");
await save(endpoint("author"),false,"07:30",zone,true);
ok(true,"a signed-in user can ask for prayer notifications only");
await denied(()=>db.query("select * from public.claim_push_batch()"),"signed-in users cannot claim what is due either");

const claim=async()=>{await as(null,"service_role");const r=await rows("select * from public.claim_push_batch()");await as(null);return r;};
let batch=await claim();
ok(batch.length===1&&batch[0].endpoint===endpoint("guest")&&batch[0].kind==="daily","the daily reminder that is due is claimed");
ok((await claim()).length===0,"and not claimed twice on the same day");

// Prayer: someone else's "praying" reaction on a prayer notifies its author, once an hour.
await as(author);
const prayer=(await rows("insert into public.community_posts(user_id,display_name,body,post_type) values($1,'Author','Please pray for my mother','prayer') returning id",[author]))[0].id;
const reflection=(await rows("insert into public.community_posts(user_id,display_name,body,post_type) values($1,'Author','A reflection on Psalm 23','reflection') returning id",[author]))[0].id;
await db.query("insert into public.community_reactions(post_id,user_id,reaction) values($1,$2,'praying')",[prayer,author]);
ok((await claim()).length===0,"praying for your own prayer notifies nobody");
await db.query("insert into public.community_reactions(post_id,user_id,reaction) values($1,$2,'amen')",[prayer,reactor]);
ok((await claim()).length===0,"other reactions notify nobody");
await db.query("insert into public.community_reactions(post_id,user_id,reaction) values($1,$2,'praying')",[reflection,reactor]);
ok((await claim()).length===0,"praying on a post that is not a prayer notifies nobody");
await db.query("insert into public.community_reactions(post_id,user_id,reaction) values($1,$2,'praying')",[prayer,reactor]);
batch=await claim();
ok(batch.length===1&&batch[0].endpoint===endpoint("author")&&batch[0].kind==="prayed_for","the author hears that someone prayed");
ok(!JSON.stringify(batch).includes("mother"),"nothing the author wrote is in what the sender gets");
await db.query("insert into public.community_reactions(post_id,user_id,reaction) values($1,$2,'praying')",[prayer,other]);
ok((await claim()).length===0,"a second prayer within the hour does not notify again");
// The older prayer wall does the same.
await db.query("update public.push_subscriptions set last_prayed_for_at=null");
await db.query("insert into public.community_terms(user_id,version) values($1,'2026-10-07')",[author]);
await as(author);
const wall=(await rows("insert into public.prayer_posts(user_id,display_name,body,post_type) values($1,'Author','Pray for my exams','prayer') returning id",[author]))[0].id;
await db.query("insert into public.prayer_reactions(post_id,user_id) values($1,$2)",[wall,reactor]);
batch=await claim();
ok(batch.length===1&&batch[0].kind==="prayed_for","a prayer on the prayer wall notifies its author too");

// A test notification on request, at most once every ten minutes.
await as(null,"anon");
ok((await rows("select public.request_test_push($1) r",[endpoint("guest")]))[0].r===true,"a device can ask for a test notification");
ok((await rows("select public.request_test_push($1) r",[endpoint("guest")]))[0].r===false,"but not again right away");
ok((await rows("select public.request_test_push($1) r",[endpoint("nobody")]))[0].r===false,"an unknown device gets nothing");
batch=await claim();
ok(batch.length===1&&batch[0].kind==="test","the test is claimed for that device");

// Turning off, devices that are gone, and deleted accounts.
await as(null,"anon");
await db.query("select public.remove_push_subscription($1)",[endpoint("guest")]);
await as(null);
ok((await rows("select count(*)::int n from public.push_subscriptions where endpoint=$1",[endpoint("guest")]))[0].n===0,"turning reminders off removes the device");
await as(null,"service_role");
await db.query("select public.drop_push_subscription($1)",[endpoint("author")]);
await as(null);
ok((await rows("select count(*)::int n from public.push_subscriptions"))[0].n===0,"the sender can remove a device the push service no longer knows");
await as(reactor,"authenticated");
await save(endpoint("reactor"),true,"07:30",zone,true);
await as(null);
await db.query("delete from auth.users where id=$1",[reactor]);
ok((await rows("select count(*)::int n from public.push_subscriptions"))[0].n===0,"a deleted account takes its devices with it");
console.log(`${checks} push notification checks passed`);

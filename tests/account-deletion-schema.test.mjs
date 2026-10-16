import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
// Runs migration 007 on top of 001-006 and deletes accounts the way the app does.
const ids = Array.from({length:3}, (_, i) => `b0000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`);
const [leaver, stayer, other] = ids;
let checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;console.log("PASS",label);};
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values ${ids.map(id=>`('${id}')`).join(",")};`);
await db.exec(readFileSync("supabase/schema.sql","utf8"));
for(const file of ["001_platform.sql","002_support.sql","003_aggregate_feed.sql","004_qa_guards.sql","005_topic_discussions.sql","006_circles.sql"]) await db.exec(readFileSync("supabase/migrations/"+file,"utf8"));
const migration=readFileSync("supabase/migrations/007_account_deletion.sql","utf8");
await db.exec(migration);
await db.exec(migration);
ok(true,"007 applies twice without error");
await db.query("insert into public.profiles(id,display_name) select id,'Fixture '||row_number() over() from auth.users");
const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
const count=async(sql,args=[])=>Number((await rows(sql,args))[0].n);
async function actor(id=null){await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??""]);await db.exec("set role "+(id?"authenticated":"anon"));}
async function operator(){await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub','',false)");}

// Everything the leaver has on the server, and what other people wrote around it.
const post=(await rows("insert into public.community_posts(user_id,display_name,body,post_type) values($1,'Leaver','A reflection to remove','reflection') returning id",[leaver]))[0].id;
await db.query("insert into public.community_posts(user_id,display_name,body,post_type,parent_id) values($1,'Stayer','A reply under the leaver','reflection',$2)",[stayer,post]);
await db.query("insert into public.community_posts(user_id,display_name,body,post_type) values($1,'Stayer','A post of my own that stays','reflection')",[stayer]);
const circle=(await rows("insert into public.circles(owner_id,slug,name,description,privacy) values($1,'leavers-circle','Leaver circle','A Circle the leaver owns','private') returning id",[leaver]))[0].id;
await db.query("insert into public.circle_memberships(circle_id,user_id,display_name,role,state) values($1,$2,'Leaver','owner','active'),($1,$3,'Stayer','member','active')",[circle,leaver,stayer]);
const kept=(await rows("insert into public.circles(owner_id,slug,name,description,privacy) values($1,'stayers-circle','Stayer circle','A Circle someone else owns','public') returning id",[stayer]))[0].id;
await db.query("insert into public.circle_memberships(circle_id,user_id,display_name,role,state) values($1,$2,'Stayer','owner','active'),($1,$3,'Leaver','member','active')",[kept,stayer,leaver]);
await db.query("insert into public.user_blocks(user_id,blocked_id,action) values($1,$2,'block'),($2,$1,'mute')",[leaver,other]);
await db.query("insert into public.community_terms(user_id,version) values($1,'2026-10-07'),($2,'2026-10-07')",[leaver,stayer]);
await db.query("insert into public.support_requests(user_id,title,story,category,declared_target,currency,expires_at,beneficiary_relationship,country,display_name,fundraiser_url) values($1,'Help with rent','A story long enough to pass the length check for a request.','Basic needs',500,'USD',now()+interval '30 days','Myself','Netherlands','Leaver','https://www.gofundme.com/f/leaver-rent')",[leaver]);

// Nobody can delete an account without being signed in as it.
await actor(null);
await assert.rejects(()=>db.query("select public.delete_my_account()"),error=>error.code==="42501");
ok(true,"a guest cannot call delete_my_account");
await operator();
ok(await count("select count(*) n from auth.users")===3,"nothing was deleted by the refused call");

await actor(leaver);
await db.query("select public.delete_my_account()");
await operator();
ok(await count("select count(*) n from auth.users where id=$1",[leaver])===0,"the account itself is gone");
ok(await count("select count(*) n from auth.users")===2,"no other account was touched");
ok(await count("select count(*) n from public.profiles where id=$1",[leaver])===0,"its profile is gone");
ok(await count("select count(*) n from public.community_posts where user_id=$1",[leaver])===0,"its posts are gone");
ok(await count("select count(*) n from public.community_posts where parent_id=$1",[post])===0,"replies under its posts go with them");
ok(await count("select count(*) n from public.community_posts where body='A post of my own that stays'")===1,"other people's own posts stay");
ok(await count("select count(*) n from public.circles where id=$1",[circle])===0,"a Circle it owned is closed");
ok(await count("select count(*) n from public.circle_memberships where circle_id=$1",[circle])===0,"with its memberships");
ok(await count("select count(*) n from public.circles where id=$1",[kept])===1,"a Circle someone else owns stays");
ok(await count("select count(*) n from public.circle_memberships where circle_id=$1 and user_id=$2",[kept,leaver])===0,"its membership there is gone");
ok(await count("select count(*) n from public.circle_memberships where circle_id=$1 and user_id=$2",[kept,stayer])===1,"the owner's membership there stays");
ok(await count("select count(*) n from public.user_blocks where user_id=$1 or blocked_id=$1",[leaver])===0,"its blocks and mutes are gone, both ways");
ok(await count("select count(*) n from public.community_terms where user_id=$1",[leaver])===0,"its accepted rules are gone");
ok(await count("select count(*) n from public.community_terms where user_id=$1",[stayer])===1,"other people's accepted rules stay");
ok(await count("select count(*) n from public.support_requests where user_id=$1",[leaver])===0,"its support requests are gone");

// A signed-in user only ever deletes their own account.
await actor(other);
await db.query("select public.delete_my_account()");
await operator();
ok((await rows("select id from auth.users")).map(r=>r.id).join()===stayer,"the second deletion removed only its caller");
console.log(`${checks} account deletion checks passed`);

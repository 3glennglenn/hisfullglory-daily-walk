import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { postError, blockedLanguage } from "../src/social/blockedLanguage.ts";
// Runs migration 008 on top of 001-007 (007 when present; 008 does not depend on it) and tries to post words that are and are not blocked.
const ids = Array.from({length:2}, (_, i) => `c0000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`);
const [writer, owner] = ids;
let checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;console.log("PASS",label);};
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values ${ids.map(id=>`('${id}')`).join(",")};`);
await db.exec(readFileSync("supabase/schema.sql","utf8"));
for(const file of ["001_platform.sql","002_support.sql","003_aggregate_feed.sql","004_qa_guards.sql","005_topic_discussions.sql","006_circles.sql","007_account_deletion.sql"].filter(f=>existsSync("supabase/migrations/"+f))) await db.exec(readFileSync("supabase/migrations/"+file,"utf8"));
const migration=readFileSync("supabase/migrations/008_word_filter.sql","utf8");
await db.exec(migration);
await db.exec(migration);
ok(true,"008 applies twice without error");
await db.query("insert into public.profiles(id,display_name) values($1,'Writer'),($2,'Owner')",[writer,owner]);

const post=(body)=>db.query("insert into public.community_posts(user_id,display_name,body,post_type) values($1,'Writer',$2,'reflection')",[writer,body]);
async function refused(run,label){
 await assert.rejects(run,(error)=>{assert.equal(error.code,"P0001",label);assert.ok(postError(error,"fallback")===blockedLanguage,label+": the app shows why");return true;});
 checks++;console.log("PASS",label);
}
await refused(()=>post("This is fucking hard to read."),"a blocked word in a post is refused");
await refused(()=>post("SHIT happens, they say."),"case does not matter");
await refused(()=>post("Just kill yourself already."),"a blocked phrase is refused");
await post("Paul said it is hard to kick against the pricks.");
ok(true,"a word that only contains a blocked word is allowed");
await post("Revelation speaks of the great whore, and Balaam's ass spoke. Hell and damnation are real questions for many readers.");
ok(true,"words from older Bible translations are allowed");
await post("I survived rape and abuse, and this passage helped me.");
ok(true,"survivors can name what happened to them");
await post("Scunthorpe and Essex are just places.");
ok(true,"place names that contain a blocked word are allowed");
const id=(await db.query("select id from public.community_posts where body like 'Paul said%'")).rows[0].id;
await refused(()=>db.query("update public.community_posts set prayer_updates='fuck' where id=$1",[id]),"a prayer update is checked too");
await db.query("update public.community_posts set moderation_state='hidden' where id=$1",[id]);
ok(true,"moderation that does not touch the text is not affected");
await refused(()=>db.query("update public.profiles set display_name='Bitch' where id=$1",[writer]),"a display name is checked");
await refused(()=>db.query("insert into public.circles(owner_id,slug,name,description,privacy) values($1,'some-circle','Porn talk','A description of the circle','public')",[owner]),"a Circle name is checked");
// The legacy chat and prayer wall first require accepted rules, checked against the signed-in user.
await db.query("insert into public.community_terms(user_id,version) values($1,'2026-10-07')",[writer]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[writer]);
const chatRoom=(await db.query("insert into public.chat_rooms(slug,name,description,sort_order) values('general','General','Talk',1) returning id")).rows[0].id;
await refused(()=>db.query("insert into public.chat_messages(room_id,user_id,display_name,body) values($1,$2,'Writer','you retard')",[chatRoom,writer]),"a chat message is checked");
await refused(()=>db.query("insert into public.prayer_posts(user_id,display_name,body,post_type) values($1,'Writer','pray for this nigga','prayer')",[writer]),"a public prayer is checked");
ok(postError(new Error("rate limit"),"fallback")==="fallback","other errors keep their own message");
console.log(`${checks} word filter checks passed`);

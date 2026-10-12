import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const a="a0000000-0000-4000-8000-000000000001",b="b0000000-0000-4000-8000-000000000002";
let checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;console.log("PASS",label);};
async function setup(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values('${a}'),('${b}');`);
  await db.exec(readFileSync("supabase/schema.sql","utf8"));
  for(const file of ["001_platform.sql","002_support.sql","003_aggregate_feed.sql","004_qa_guards.sql"])await db.exec(readFileSync("supabase/migrations/"+file,"utf8"));
  return db;
}
const db=await setup();
const rows=async(sql,params)=>(await db.query(sql,params)).rows;
async function actor(role,id=""){await db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${id}',false)`);}
async function denied(sql,label,params){await assert.rejects(()=>db.query(sql,params));checks++;console.log("PASS",label);}
await db.exec(`insert into public.profiles(id,display_name) values('${a}','Alice'),('${b}','Bob');insert into public.community_posts(user_id,display_name,body,post_type) values('${a}','Alice','Preserved legacy contribution','reflection');`);
const before=await rows("select id,user_id,body,prayer_updates,post_type from public.community_posts order by id");
const sql=readFileSync("supabase/migrations/005_topic_discussions.sql","utf8");
await db.exec(sql);await db.exec(sql);
assert.deepEqual(await rows("select id,user_id,body,prayer_updates,post_type from public.community_posts order by id"),before);ok(true,"005 upgrade and rerun preserve populated through-004 contributions");
const clean=await setup();await clean.exec(sql);await clean.close();ok(true,"fresh complete chain installs");
await actor("anon");await denied("select * from public.community_memberships","guest cannot read memberships");await denied("select * from public.community_votes","guest cannot read voter identities");await denied("select public.set_topic_membership('anxiety',true)","guest cannot join");
await actor("authenticated",a);await denied("select public.set_topic_membership('anxiety',true)","joining requires current Terms");await db.exec("select public.accept_community_terms('2026-10-07');select public.set_topic_membership('anxiety',true)");
await actor("authenticated",b);ok((await rows("select topic_id from public.community_memberships")).length===0,"other account cannot read sensitive memberships");await db.exec("select public.accept_community_terms('2026-10-07');select public.set_topic_membership('anxiety',true)");
// Direct privileges are tested independently of UI controls.
for(const role of ["anon","authenticated"]) {
 await actor(role,role==="authenticated"?b:"");
 for(const table of ["community_memberships","community_votes","community_vote_limits"]) {
  await denied("insert into public."+table+" default values",role+" cannot directly insert "+table);
  await denied("update public."+table+" set user_id=$1",role+" cannot directly update "+table,[a]);
  await denied("delete from public."+table,role+" cannot directly delete "+table);
 }
 await denied("insert into public.topics values('forged','Forged')",role+" cannot write topic catalog");
}
await actor("authenticated",a);
await db.exec("select public.set_topic_membership('anxiety',true)");
ok((await rows("select topic_id from public.community_memberships")).length===1,"repeat join is idempotent");
const root=(await rows("select public.publish_topic_post('An honest question','question','anxiety',null,'[]',true) id"))[0].id;
await denied("select public.set_contribution_vote($1,true)","self-voting denied below UI",[root]);
await actor("authenticated",b);await db.query("select public.set_contribution_vote($1,true)",[root]);await db.query("select public.set_contribution_vote($1,true)",[root]);
const feed=(await rows("select public.read_topic_discussions('anxiety') feed"))[0].feed;ok(feed[0].upvotes===1&&feed[0].display_name==="Anonymous"&&feed[0].reputation===null&&!JSON.stringify(feed).includes(a),"idempotent vote and anonymous topic feed without identity");
await denied("update public.community_posts set topic_id='grief'","client cannot set topic or ownership directly");await denied("select public.contribution_reputation($1)","no callable reputation author-ID oracle",[a]);
await db.query("select public.react_community_post($1,'helped')",[root]);
ok((await rows("select public.read_topic_discussions('anxiety',null,'top') feed"))[0].feed[0].score===1,"equivalent upvote and helpful reaction count only once");
await denied("select public.set_contribution_vote($1,false)","vote toggling respects server cooldown",[root]);
await actor("postgres");await db.exec(`update public.community_vote_limits set last_action=now()-interval '1 day' where user_id='${b}'`);
await actor("authenticated",b);await db.query("select public.set_contribution_vote($1,false)",[root]);ok((await rows("select public.read_topic_discussions('anxiety') feed"))[0].feed[0].upvotes===0,"vote removal persists");
const reply=(await rows("select public.publish_topic_post('Practical encouragement','advice','anxiety',$1,$2,false) id",[root,JSON.stringify([{title:"A source",url:"https://example.org/article"}])]))[0].id;
ok((await rows("select public.read_topic_thread('anxiety',$1) root",[root]))[0].root.replies===1,"thread count reflects actual visible replies");
ok(!(await rows("select id from public.read_aggregate_feed()")).some(p=>p.id===reply),"replies do not leak into legacy top-level timelines");
await denied("select public.publish_topic_post('Nested reply','advice','anxiety',$1,'[]',false)","reply depth bounded to one level",[reply]);
await actor("postgres");await db.exec(`update public.community_posting_limits set last_post_at=now()-interval '1 day' where user_id='${a}'`);
await actor("authenticated",a);await denied("select public.publish_topic_post('Unsafe source','resource','anxiety',null,$1,false)","unsafe source protocol denied on server",[JSON.stringify([{title:"bad",url:"javascript:alert(1)"}])]);
await denied("select public.publish_topic_post('Unjoined topic','question','grief',null,'[]',false)","private preferences cannot implicitly join a topic");
await actor("postgres");
for(const url of ["http://example.org","https://user:pass@example.org/a","https://127.0.0.1/x","https://localhost/x","https://host.local/x","https://example.org/a\nb"]) {
 ok((await rows("select public.valid_contribution_sources($1) valid",[JSON.stringify([{title:"unsafe",url}])]))[0].valid===false,"SQL source validator rejects "+url.replace(/\n/g,"[newline]"));
}
// Synthetic operator fixtures exercise ranked pagination without production activity.
await db.query("insert into public.community_posts(user_id,display_name,body,post_type,topic_id,created_at) select $1,'Alice','QA pagination fixture '||n,'question','grief',now()-n*interval '1 minute' from generate_series(1,23) n",[a]);
await actor("anon");
const first=(await rows("select public.read_topic_discussions('grief') feed"))[0].feed,last=first.at(-1);
const second=(await rows("select public.read_topic_discussions('grief',null,'newest',$1,$2,$3) feed",[last.score,last.created_at,last.id]))[0].feed;
ok(first.length===20&&second.length===3&&new Set([...first,...second].map(p=>p.id)).size===23,"topic cursor reads 23 records without duplicates");
await denied("select public.read_topic_discussions('grief',null,'newest',0,null,null)","incomplete cursor rejected");
await actor("postgres");await db.exec("update public.community_vote_limits set last_action=now()-interval '1 day'");
await actor("authenticated",b);await db.query("select public.set_contribution_vote($1,true)",[first[0].id]);
const ranked=(await rows("select public.read_topic_discussions('grief',null,'top') feed"))[0].feed;
ok(ranked[0].id===first[0].id&&ranked[0].reputation===1,"named reputation and Top ranking derive from a genuine nonself vote");
await db.query("select public.react_community_post($1,'helped')",[first[1].id]);
ok((await rows("select public.read_topic_discussions('grief',null,'helpful') feed"))[0].feed[0].id===first[1].id,"Most helpful sorting uses helpful interactions instead of upvotes");
await actor("postgres");await db.query("update public.community_posts set moderation_state='hidden' where id=any($1::uuid[])",[[first[0].id,first[1].id]]);
await actor("anon");ok((await rows("select public.read_topic_discussions('grief') feed"))[0].feed.every(p=>p.reputation===0),"moderation removes contribution points from public named reputation");
await actor("authenticated",b);await db.query("select public.community_safety_action('post',$1,'block')",[root]);
ok((await rows("select public.read_topic_discussions('anxiety') feed"))[0].feed.length===0,"blocked anonymous topic author hidden");
ok((await rows("select public.read_topic_discussions('anxiety',$1) feed",[root]))[0].feed.length===0,"blocked root hides all replies");
await actor("postgres");await db.query("update public.community_posts set moderation_state='hidden' where id=$1",[root]);
await actor("anon");ok((await rows("select public.read_topic_thread('anxiety',$1) root",[root]))[0].root===null,"hidden root unavailable through direct deep link");ok((await rows("select public.read_topic_discussions('anxiety',$1) feed",[root]))[0].feed.length===0,"hidden parent hides thread children");
await actor("authenticated",a);await denied("select public.set_contribution_vote($1,true)","cannot vote on reply under hidden parent",[reply]);await denied("select public.react_community_post($1,'helped')","cannot react on reply under hidden parent",[reply]);
await actor("postgres");ok((await rows("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")).length===0,"every exposed table has RLS");
ok((await rows("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig @> ARRAY['search_path=\"\"'],false)")).length===0,"all definer functions fix search_path");
await db.query("delete from auth.users where id=$1",[a]);ok((await rows("select id from public.community_posts where id=$1",[reply])).length===0,"account deletion cascades parent-dependent replies without blocking deletion");
await db.close();console.log(`${checks} expansion SQL checks passed (PGlite with simulated JWT claims, not hosted Supabase Auth)`);

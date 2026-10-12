import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {validCircleResult} from "../src/social/circleContracts.ts";
const ids = Array.from({length:6}, (_, i) => `a0000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`);
const [owner, member, outsider, moderator, pending, declined] = ids;
const migration = readFileSync("supabase/migrations/006_circles.sql", "utf8");
let checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;console.log("PASS",label);};
async function setup(through=5){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values ${ids.map(id=>`('${id}')`).join(",")};`);
 await db.exec(readFileSync("supabase/schema.sql","utf8"));
 const files=["001_platform.sql","002_support.sql","003_aggregate_feed.sql","004_qa_guards.sql","005_topic_discussions.sql"];
 for(const file of files.slice(0,through)) await db.exec(readFileSync("supabase/migrations/"+file,"utf8"));
 await db.query("insert into public.profiles(id,display_name) select id,'Fixture '||row_number() over() from auth.users");
 return db;
}
const db=await setup();
const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function actor(id=null){await db.exec("reset role");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??""]);if(id!=="operator")await db.exec("set role "+(id?"authenticated":"anon"));else await db.query("select set_config('request.jwt.claim.sub','',false)");}
async function deny(sql,label,args=[]){await assert.rejects(()=>db.query(sql,args),error=>{assert.ok(["42501","P0001","23503","23505","23514"].includes(error.code),label+": denial must be authorization/constraint, not broken SQL ("+error.code+")");return true;});checks++;console.log("PASS",label);}
async function rpc(name,args=[]){return (await rows(`select public.${name}(${args.map((_,i)=>"$"+(i+1)).join(",")}) result`,args))[0].result;}
async function cool(){await actor("operator");await db.exec("update public.community_posting_limits set last_post_at=now()-interval '1 day';update public.community_vote_limits set last_action=now()-interval '1 day';update public.circle_memberships set updated_at=now()-interval '1 day';update public.circles set created_at=now()-interval '1 day'");}
await db.query("insert into public.community_posts(user_id,display_name,body,post_type) values($1,'Legacy','Preserved legacy contribution','reflection')",[owner]);
const legacy=await rows("select * from public.community_posts");
await db.exec(migration);
ok((await rows("select circle_id from public.community_posts"))[0].circle_id===null,"existing contributions remain unscoped");
const after=await rows("select * from public.community_posts");delete after[0].circle_id;assert.deepEqual(after,legacy);ok(true,"populated 005→006 upgrade preserves every existing post field");
const upgrade=await setup(4);await upgrade.query("insert into public.community_posts(user_id,display_name,body,post_type) values($1,'Upgrade','004 preserved','reflection')",[owner]);await upgrade.exec(readFileSync("supabase/migrations/005_topic_discussions.sql","utf8"));await upgrade.exec(migration);ok((await upgrade.query("select body,circle_id from public.community_posts")).rows[0].body==="004 preserved","populated 004→005→006 upgrade");await upgrade.close();
const failure=await setup();await assert.rejects(()=>failure.exec(migration.replace("commit;","select 1/0;commit;")));await failure.exec("rollback");ok((await failure.query("select to_regclass('public.circles') object")).rows[0].object===null,"failed transactional migration leaves no partial Circle tables");ok(!(await failure.query("select column_name from information_schema.columns where table_name='community_posts' and column_name='circle_id'")).rows.length,"failed migration rolls back post scope column");await failure.exec(migration);await failure.close();ok(true,"fresh install completes after deliberate failure rollback");
await actor();await deny("select public.create_circle('guest','Guest','Guest description','public')","guest creation denied");
await actor(owner);await deny("select public.create_circle('no-terms','No Terms','A description','public')","creation requires Terms");
for(const id of ids){await actor(id);await rpc("accept_community_terms",["2026-10-07"]);}
await actor(owner);const privateCircle=await rpc("create_circle",["private-walk","Private Walk","Discoverable description","private","anxiety","Introduce yourself"]);
await cool();await actor(owner);const publicCircle=await rpc("create_circle",["public-walk","Public Walk","Public description","public","anxiety",""]);
await actor("operator");ok((await rows("select role,state from public.circle_memberships where circle_id=$1",[privateCircle]))[0].role==="owner","creation atomically installs active owner membership");
await actor(owner);await deny("select public.change_circle_membership($1,'leave')","owner cannot leave",[privateCircle]);
await cool();await actor(owner);
for(const slug of ["admin","ab","bad slug","Uppercase"]){await deny("select public.create_circle($1,'Valid name','Valid description','public')","invalid/reserved slug denied: "+slug,[slug]);}
await deny("select public.create_circle('public-walk','Duplicate','Duplicate description','public')","duplicate slug cannot overwrite Circle");
await deny("select public.create_circle('unknown-topic','Valid name','Valid description','public','missing')","invalid canonical topic denied");
await actor();ok((await rpc("read_circles")).length===1,"guest sees only public metadata");ok((await rpc("read_circles",["private-walk"])).length===0,"guest private slug gives no metadata");
await deny("select public.change_circle_membership($1,'join')","guest cannot join even a public Circle",[publicCircle]);
await actor(outsider);const metadata=await rpc("read_circles",["private-walk"]);ok(validCircleResult("read_circles",metadata),"actual SQL metadata matches the client contract");ok(metadata.length===1&&metadata[0].member_count===null&&!JSON.stringify(metadata).includes(owner),"signed-in nonmember discovers limited private metadata without identities or totals");
await deny("select public.publish_circle_post($1,'Nonmember public post','question')","public visibility does not grant nonmember posting",[publicCircle]);
for(const id of [member,moderator,pending,declined]){await actor(id);await rpc("change_circle_membership",[privateCircle,"apply","Secret answer "+id]);}
await actor(member);ok(validCircleResult("read_own_circle_application",await rpc("read_own_circle_application",[privateCircle])),"actual SQL own application matches the client contract");ok(!JSON.stringify(await rpc("read_circles")).includes("Secret answer"),"broad metadata omits even caller application answer");ok((await rpc("read_own_circle_application",[privateCircle])).answer==="Secret answer "+member,"applicant reads own pending answer only");await deny("select public.change_circle_membership($1,'join')","private applicant cannot bypass approval",[privateCircle]);await deny("select public.read_circle_members($1)","pending applicant cannot read review queue",[privateCircle]);
await actor("operator");const memberships=await rows("select id,user_id from public.circle_memberships where circle_id=$1",[privateCircle]);const mid=id=>memberships.find(m=>m.user_id===id).id;
await actor(outsider);await deny("select public.review_circle_member($1,$2,'approve')","outsider approval denied",[privateCircle,mid(member)]);await deny("select public.read_circle_members($1)","outsider answer queue denied",[privateCircle]);
await actor(owner);await rpc("review_circle_member",[privateCircle,mid(member),"approve"]);await rpc("review_circle_member",[privateCircle,mid(moderator),"approve"]);await rpc("review_circle_member",[privateCircle,mid(declined),"decline"]);await rpc("review_circle_member",[privateCircle,mid(moderator),"promote"]);
await actor("operator");ok((await rows("select answer from public.circle_memberships where user_id=any($1::uuid[]) and circle_id=$2",[[member,moderator,declined],privateCircle])).every(m=>m.answer===""),"approval and decline erase application answers at rest");
await actor(member);await deny("select public.read_circle_members($1)","ordinary active member cannot read answers or member directory",[privateCircle]);await deny("select public.review_circle_member($1,$2,'promote')","ordinary member role escalation denied",[privateCircle,mid(member)]);
await deny("select public.review_circle_member($1,$2,'approve')","ordinary active member cannot approve another applicant",[privateCircle,mid(pending)]);
await actor(moderator);await deny("select public.review_circle_member($1,$2,'demote')","moderator cannot alter owner",[privateCircle,mid(owner)]);await deny("select public.review_circle_member($1,$2,'promote')","moderator cannot promote a member",[privateCircle,mid(member)]);await deny("select public.review_circle_member($1,$2,'demote')","moderator cannot demote itself",[privateCircle,mid(moderator)]);
await actor(owner);const secret=await rpc("publish_circle_post",[privateCircle,"Private Circle secret words","question",null,"[]",true,"/bible/romans/8/28"]);await deny("select public.set_contribution_vote($1,true)","self vote denied",[secret]);
await actor(member);const reply=await rpc("publish_circle_post",[privateCircle,"Private Circle reply","advice",secret,"[]",false]);await rpc("set_contribution_vote",[secret,true]);await rpc("set_contribution_vote",[secret,true]);await rpc("react_community_post",[secret,"helped"]);
const privateFeed=await rpc("read_circle_discussions",[privateCircle]);ok(validCircleResult("read_circle_discussions",privateFeed),"actual SQL discussion matches the client contract");ok(validCircleResult("read_circle_thread",await rpc("read_circle_thread",[privateCircle,secret])),"actual SQL thread matches the client contract");ok(privateFeed.length===1&&privateFeed[0].upvotes===1&&privateFeed[0].score===1&&privateFeed[0].reputation===null&&!JSON.stringify(privateFeed).includes(owner),"Circle vote/reaction deduplication and anonymous identity serialization");ok((await rpc("read_circle_thread",[privateCircle,secret])).replies===1,"Circle thread has actual scoped reply count");
await deny("select public.publish_circle_post($1,'Nested reply','advice',$2)","nested Circle replies denied",[privateCircle,reply]);await rpc("set_topic_membership",["anxiety",true]);await deny("select public.publish_topic_post('Mixed reply','advice','anxiety',$1)","legacy topic cannot reply into Circle",[secret]);
for(const [label,id] of [["guest",null],["nonmember",outsider],["pending",pending],["declined",declined]]) {
 await actor(id);
 ok((await rpc("read_circle_discussions",[privateCircle])).length===0,label+" denied private discussions");ok(await rpc("read_circle_thread",[privateCircle,secret])===null,label+" denied private deep link");
 for(const fn of ["read_topic_thread","read_topic_discussions"])ok((await rpc(fn,["anxiety",secret]))===null||JSON.stringify(await rpc(fn,["anxiety",secret]))==="[]",label+" cannot leak Circle through "+fn);
 for(const fn of ["read_community_feed","read_aggregate_feed"]){const feed=await rows("select * from public."+fn+"()");ok(!JSON.stringify(feed).includes("Private Circle"),label+" cannot leak Circle through "+fn);}
 await deny("select public.publish_circle_post($1,'Forbidden','question')",label+" private posting denied",[privateCircle]);await deny("select public.set_contribution_vote($1,true)",label+" guessed private ID voting denied",[secret]);await deny("select public.react_community_post($1,'amen')",label+" guessed private ID reaction denied",[secret]);await deny("select public.community_safety_action('post',$1,'report')",label+" guessed private ID report denied",[secret]);
}
await actor(member);await deny("select public.publish_circle_post($1,'Unsafe source','resource',null,$2)","Circle unsafe source denied",[privateCircle,JSON.stringify([{title:"bad",url:"javascript:alert(1)"}])]);await rpc("change_circle_membership",[publicCircle,"join",""]);await deny("select public.publish_circle_post($1,'Cross Circle reply','advice',$2)","cross Circle reply denied",[publicCircle,secret]);
await cool();await actor(member);await rpc("set_contribution_vote",[secret,false]);ok((await rpc("read_circle_thread",[privateCircle,secret])).upvotes===0,"Circle vote removal persists in next read");await rpc("react_community_post",[secret,"helped"]);ok((await rpc("read_circle_thread",[privateCircle,secret])).score===0,"removing both distinct support signals restores real zero score");
await deny("update public.community_votes set user_id=$1","cannot forge voter identity or totals",[owner]);
await actor(pending);ok(await rpc("read_own_circle_application",[publicCircle])===null,"own-application RPC does not enumerate another applicant");
await actor(owner);await rpc("review_circle_member",[privateCircle,mid(member),"promote"]);
await actor(moderator);await deny("select public.review_circle_member($1,$2,'remove')","moderator cannot remove another moderator",[privateCircle,mid(member)]);
await actor(owner);await rpc("review_circle_member",[privateCircle,mid(member),"demote"]);
await cool();await actor(moderator);const modPost=await rpc("publish_circle_post",[privateCircle,"Moderator fixture words","reflection"]);
// Block is possible through a public contribution before private membership approval.
await actor("operator");await db.query("update public.community_posts set circle_id=$1 where id=$2",[publicCircle,modPost]);
await actor(pending);await rpc("community_safety_action",["post",modPost,"block"]);
await actor(moderator);const modQueue=await rpc("read_circle_members",[privateCircle]);ok(validCircleResult("read_circle_members",modQueue),"actual SQL member queue matches the client contract");ok(modQueue.some(m=>m.id===mid(pending)),"applicant blocking moderator does not hide application queue");await rpc("review_circle_member",[privateCircle,mid(pending),"approve"]);ok(true,"current scoped moderator can approve despite applicant's block");
await actor(pending);await rpc("change_circle_membership",[privateCircle,"leave"]);await cool();await actor(pending);await rpc("change_circle_membership",[privateCircle,"apply",""]);
await actor("operator");await db.query("update public.community_posts set circle_id=$1 where id=$2",[privateCircle,modPost]);
// Verify existing non-Circle topic and Scripture/devotional publication after 006.
await cool();await actor(member);const legacyTopic=await rpc("publish_topic_post",["Legacy topic survives 006","question","anxiety",null,"[]",false]);
await actor(outsider);await rpc("set_topic_membership",["anxiety",true]);const legacyReply=await rpc("publish_topic_post",["Legacy reply survives 006","advice","anxiety",legacyTopic,"[]",false]);await rpc("set_contribution_vote",[legacyTopic,true]);
ok((await rpc("read_topic_thread",["anxiety",legacyTopic])).replies===1,"legacy topic replies remain available after 006");ok((await rpc("read_topic_discussions",["anxiety",legacyTopic])).some(p=>p.id===legacyReply),"legacy topic child reader still works");
await cool();await actor(owner);const scripture=await rpc("publish_community_post",["Scripture-linked fixture preserved","reflection","/bible/romans/8/28",false]);await cool();await actor(owner);const devotional=await rpc("publish_community_post",["Devotional-linked fixture preserved","reflection","/grow/anxiety",false]);
await actor();ok((await rows("select id from public.read_aggregate_feed('/bible/romans/8/28')")).some(p=>p.id===scripture),"Scripture-linked legacy feed survives 006");ok((await rows("select id from public.read_community_feed('/grow/anxiety')")).some(p=>p.id===devotional),"devotional legacy feed survives 006");
// Real query cursors over static test fixtures, not fabricated runtime activity.
await actor("operator");await db.query("insert into public.community_posts(user_id,display_name,body,post_type,circle_id) select $1,'Pagination fixture','Circle page '||n,'question',$2 from generate_series(1,23) n",[owner,privateCircle]);
await actor(owner);const page1=await rpc("read_circle_discussions",[privateCircle]);const last=page1.at(-1);const page2=await rpc("read_circle_discussions",[privateCircle,null,last.created_at,last.id]);ok(page1.length===20&&page2.length===5&&new Set([...page1,...page2].map(p=>p.id)).size===page1.length+page2.length,"Circle discussion cursor has no duplicates with tied timestamps");
await deny("select public.read_circle_discussions($1,null,null,$2)","incomplete Circle cursor rejected",[privateCircle,last.id]);
await actor("operator");await db.exec("insert into auth.users(id) select ('d0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,23) n");await db.query("insert into public.circle_memberships(circle_id,user_id,display_name,state,answer) select $1,id,'Pagination applicant','pending','Sensitive fixture answer' from auth.users where id::text like 'd%'",[privateCircle]);
await actor(owner);const apps1=await rpc("read_circle_members",[privateCircle]);const apps2=await rpc("read_circle_members",[privateCircle,"pending",apps1.at(-1).id]);ok(apps1.length===20&&apps2.length===4&&new Set([...apps1,...apps2].map(m=>m.id)).size===24,"application cursor reads entire queue without loss or duplication");
await actor("operator");await db.query("update public.circle_memberships set state='active',answer='' where circle_id=$1 and user_id::text like 'd%'",[privateCircle]);await actor(owner);const members1=await rpc("read_circle_members",[privateCircle,"active"]);const members2=await rpc("read_circle_members",[privateCircle,"active",members1.at(-1).id]);ok(members1.length===20&&members2.length===6&&new Set([...members1,...members2].map(m=>m.id)).size===26,"active member cursor has no loss or duplicates");
await actor("operator");await db.query("insert into public.circles(owner_id,slug,name,description,privacy) select $1,'pagination-'||n,'Fixture Circle','Pagination fixture description','public' from generate_series(1,23) n",[owner]);await actor();const discovery1=await rpc("read_circles");const discoveryLast=discovery1.at(-1);const discovery2=await rpc("read_circles",[null,null,false,discoveryLast.created_at,discoveryLast.id]);ok(discovery1.length===20&&discovery2.length===4&&new Set([...discovery1,...discovery2].map(c=>c.id)).size===24,"discovery cursor reads all public fixtures exactly once");
await actor(member);
await rpc("community_safety_action",["post",secret,"report","vote manipulation","Private reporter detail"]);
await actor(owner);await rpc("community_safety_action",["post",reply,"block"]);const scopedReports=await rpc("read_circle_reports",[privateCircle]);ok(validCircleResult("read_circle_reports",scopedReports),"actual SQL report queue matches the client contract");ok(scopedReports.length===1&&!JSON.stringify(scopedReports).includes(member)&&!JSON.stringify(scopedReports).includes("Private reporter detail"),"scoped reports omit reporter identity and note");
await actor(member);await rpc("community_safety_action",["post",secret,"block"]);ok((await rpc("read_circle_discussions",[privateCircle])).every(p=>p.id!==secret&&p.id!==reply),"blocked anonymous author hidden with descendants");
await actor(owner);await rpc("review_circle_member",[privateCircle,mid(moderator),"demote"]);await rpc("review_circle_member",[privateCircle,mid(moderator),"promote"]);ok(true,"owner promotion and demotion work without reputation authority");
await actor(moderator);await rpc("moderate_circle_post",[privateCircle,secret,"hidden"]);ok((await rpc("read_circle_reports",[privateCircle])).some(r=>r.target_id===secret&&r.moderation_state==="hidden"),"scoped moderators can review hidden resolved reports for restoration");await deny("select public.moderate_circle_post($1,$2,'visible')","moderator cannot moderate another Circle",[publicCircle,secret]);
await actor(member);await deny("select public.react_community_post($1,'amen')","hidden parent denies child reactions",[reply]);await deny("select public.read_circle_reports($1)","ordinary member cannot read reports",[privateCircle]);await deny("select public.moderate_circle_post($1,$2,'visible')","ordinary member cannot moderate",[privateCircle,secret]);
await actor(moderator);await rpc("moderate_circle_post",[privateCircle,secret,"visible"]);await rpc("review_circle_member",[privateCircle,mid(member),"remove"]);
await actor(member);ok((await rpc("read_circle_discussions",[privateCircle])).length===0,"removed member loses private reads immediately");await deny("select public.change_circle_membership($1,'apply')","removed member cannot self-restore",[privateCircle]);
await deny("select public.publish_circle_post($1,'Removed post','question')","removed member cannot publish",[privateCircle]);await deny("select public.set_contribution_vote($1,true)","removed member cannot vote guessed former post",[secret]);await deny("select public.react_community_post($1,'amen')","removed member cannot react guessed former post",[secret]);
await actor(pending);await rpc("change_circle_membership",[privateCircle,"leave"]);ok((await rpc("read_own_circle_application",[privateCircle])).answer===null,"withdrawal clears pending answer");
await cool();await actor(declined);await rpc("change_circle_membership",[privateCircle,"apply",""]);ok((await rpc("read_circles",["private-walk"]))[0].membership==="pending","declined applicant may reapply after cooldown");
await actor(owner);await rpc("review_circle_member",[privateCircle,mid(declined),"approve"]);await actor(declined);await rpc("change_circle_membership",[privateCircle,"leave"]);ok((await rpc("read_circle_discussions",[privateCircle])).length===0,"active→left revokes private reads");await cool();await actor(declined);await rpc("change_circle_membership",[privateCircle,"apply",""]);ok(true,"left private member reapplies as pending");
await actor(outsider);await rpc("change_circle_membership",[publicCircle,"join",""]);await rpc("change_circle_membership",[publicCircle,"join",""]);await rpc("change_circle_membership",[publicCircle,"leave"]);await cool();await actor(outsider);await rpc("change_circle_membership",[publicCircle,"join",""]);const publicPost=await rpc("publish_circle_post",[publicCircle,"Public Circle discussion","question"]);ok(true,"public join is idempotent; leave and cooldown rejoin work");await actor();ok((await rpc("read_circle_discussions",[publicCircle])).length===1,"public Circle readable to guests");ok(!(await rows("select id from public.read_aggregate_feed()")).some(p=>p.id===publicPost),"public Circle also excluded from legacy timelines intentionally");
// Independently exercise public-reader rights separately from write membership.
await actor(pending);ok((await rpc('read_circle_discussions',[publicCircle])).some(p=>p.id===publicPost),'unrelated authenticated reader may read public discussions');
await deny('select public.delete_community_post($1)','another user cannot delete public Circle contribution',[publicPost]);
await deny('select public.set_contribution_vote($1,true)','public reader without membership cannot vote',[publicPost]);
await rpc('change_circle_membership',[publicCircle,'join','']);await rpc('change_circle_membership',[publicCircle,'leave']);
ok((await rpc('read_circle_discussions',[publicCircle])).some(p=>p.id===publicPost),'left public member retains public reading');
await deny('select public.set_contribution_vote($1,true)','left public member cannot vote',[publicPost]);
await cool();await actor(pending);await rpc('change_circle_membership',[publicCircle,'join','']);
await actor('operator');const publicApplicant=(await rows('select id from public.circle_memberships where circle_id=$1 and user_id=$2',[publicCircle,pending]))[0].id;
await actor(owner);await rpc('review_circle_member',[publicCircle,publicApplicant,'remove']);await actor(pending);
ok((await rpc('read_circle_discussions',[publicCircle])).some(p=>p.id===publicPost),'removed public member retains only public reading');
await deny("select public.change_circle_membership($1,'join')",'removed public member cannot self-restore',[publicCircle]);
await deny("select public.react_community_post($1,'amen')",'removed public member cannot react',[publicPost]);
// A real queue cursor over distinct reporter fixtures; private notes never serialize.
await actor('operator');await db.query("insert into public.community_reports(reporter_id,target_kind,target_id,category,note) select id,'post',$1,'other','Private queue fixture' from auth.users where id::text like 'd%'",[secret]);
await actor(owner);const reportPage1=await rpc('read_circle_reports',[privateCircle]);const reportPage2=await rpc('read_circle_reports',[privateCircle,reportPage1.at(-1).id]);
ok(reportPage1.length===20&&reportPage2.length===3&&new Set([...reportPage1,...reportPage2].map(r=>r.id)).size===23,'report cursor has no lost or duplicate records');
ok(!JSON.stringify([...reportPage1,...reportPage2]).includes('Private queue fixture'),'paged review queue never includes private report notes');
for(const id of [null,outsider,owner]){
 await actor(id);
 for(const table of ["circles","circle_memberships"]){for(const sql of ["select * from public.","insert into public.","update public.","delete from public."]){const suffix=sql.startsWith("insert")?" default values":sql.startsWith("update")?" set id=gen_random_uuid()":"";await deny(sql+table+suffix,(id??"guest")+" raw "+sql.split(" ")[0]+" denied for "+table);}}
 await deny("update public.community_posts set circle_id=$1","client cannot forge Circle attribution",[privateCircle]);await deny("select public.circle_role($1)","internal role helper inaccessible",[privateCircle]);await deny("select public.contribution_reputation($1)","no private reputation oracle",[owner]);
}
await actor("operator");await deny("update public.circles set privacy='public' where id=$1","privacy immutable even on accidental operator UPDATE",[privateCircle]);await deny("update public.circles set owner_id=$1 where id=$2","owner immutable",[outsider,privateCircle]);
ok((await rows("select public.contribution_reputation($1) value",[owner]))[0].value===0,"private Circle activity never changes global reputation");
ok((await rows("select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity")).length===0,"every exposed table has RLS");ok((await rows("select proname from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and prosecdef and not coalesce(proconfig @> ARRAY['search_path=\"\"'],false)")).length===0,"all definer functions have safe search_path");
await actor(owner);await rpc("close_circle",[privateCircle]);await actor(moderator);ok((await rpc("read_circle_discussions",[privateCircle])).length===0,"closed Circle denies formerly active members");await deny("select public.read_circle_members($1)","closed Circle denies moderation queue",[privateCircle]);
await actor("operator");ok((await rows("select answer from public.circle_memberships where circle_id=$1",[privateCircle])).every(m=>m.answer===""),"closing erases all pending answers");ok((await rows("select id from public.moderation_audit where target_kind='circle_membership'")).length>10,"membership transitions leave private audit records");
await actor(member);for(const [sql,args] of [
 ["select public.change_circle_membership($1,'apply')",[privateCircle]],
 ["select public.publish_circle_post($1,'Closed contribution','question')",[privateCircle]],
 ["select public.publish_circle_post($1,'Closed reply','advice',$2)",[privateCircle,secret]],
 ["select public.set_contribution_vote($1,true)",[secret]],
 ["select public.react_community_post($1,'amen')",[secret]]
])await deny(sql,'closed Circle mutation denied: '+sql.split('(')[0],args);
await actor(owner);await deny("select public.review_circle_member($1,$2,'approve')",'closed Circle cannot approve applications',[privateCircle,mid(declined)]);
await deny("select public.edit_circle($1,'Closed edit','Closed description','')",'closed Circle cannot edit metadata',[privateCircle]);
await deny("select public.close_circle($1)",'closure is terminal, not a reopening operation',[privateCircle]);
await db.close();console.log(`${checks} Circle SQL checks passed (PGlite authorization with simulated JWTs, not linked Auth or simultaneous sessions).`);

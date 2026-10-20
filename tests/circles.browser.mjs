import {build} from "esbuild";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
// The version the app asks for is read from the app, so this fixture follows it when it changes.
const TERMS_VERSION=readFileSync("src/platform/auth.tsx","utf8").match(/TERMS_VERSION = "([^"]+)"/)[1];
export async function checkCircles(browser,base){
 const result=await build({entryPoints:["tests/fixtures/circles.tsx"],bundle:true,write:false,outfile:".tooling/circles-fixture.js",format:"iife",jsx:"automatic",loader:{".svg":"dataurl"},define:{"process.env.NODE_ENV":'"production"'},plugins:[{
 name:"controlled-circle-sdk",setup(b){
 b.onResolve({filter:/^\.\.\/supabase$/},()=>({path:"sdk",namespace:"fixture"}));
 b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents:`
 // Synthetic UI boundary data only. SQL authorization is tested separately.
 const owner='a0000000-0000-4000-8000-000000000001',other='b0000000-0000-4000-8000-000000000002';
 let actor=window.circleBootstrap ? window.circleBootstrap.actor : owner,listeners=[],count=window.circleBootstrap?.count??10,termsChecks=0;
 const id=()=> 'c0000000-0000-4000-8000-'+String(++count).padStart(12,'0');
 const memberships=window.circleBootstrap?.memberships??{};const posts=window.circleBootstrap?.posts??[];const reports=window.circleBootstrap?.reports??[];
 const circles=window.circleBootstrap?.circles??[{id:id(),slug:'public-walk',name:'Public fixture Walk',description:'Controlled public fixture description',privacy:'public',topic_id:'anxiety',application_question:'',created_at:'2026-10-08T00:00:00Z'}, {id:id(),slug:'private-walk',name:'Private fixture Walk',description:'Controlled discoverable fixture description',privacy:'private',topic_id:'anxiety',application_question:'Optional fixture introduction',created_at:'2026-10-07T00:00:00Z'}];
 const key=(cid,uid=actor)=>cid+':'+uid;
 circles.forEach(c=>{if(!memberships[key(c.id,owner)])memberships[key(c.id,owner)]={id:id(),display_name:'Fixture owner',role:'owner',state:'active',answer:''};});
 const session=()=>actor?{user:{id:actor},access_token:'synthetic-'+actor}:null;
 window.circleFixture={get actor(){return actor;},get count(){return count;},get termsChecks(){return termsChecks;},reports,fail:false,hang:false,signIn(uid){actor=uid;listeners.forEach(fn=>fn('SIGNED_IN',session()));},other,owner,posts,circles,memberships};
 function role(cid){const m=memberships[key(cid)];return m?.state==='active'?m.role:null;}
 function readable(cid){const c=circles.find(c=>c.id===cid);return c&&(c.privacy==='public'||role(cid));}
 function render(p){return {...p,is_owner:p.author===actor,voted:p.votes.includes(actor),upvotes:p.votes.length,score:p.votes.length,helped:p.helped.length,reputation:p.anonymous?null:0,replies:posts.filter(r=>r.parent_id===p.id&&!r.deleted&&!r.hidden).length};}
 async function call(name,a){
  if(window.circleFixture.delay)await new Promise(resolve=>setTimeout(resolve,window.circleFixture.delay));
  if(window.circleFixture.malformed&&name==='read_circle_discussions')return {data:[{}],error:null};
  if(window.circleFixture.fail)return {error:{message:'Controlled failure'},data:null};
  const c=circles.find(c=>c.id===a.selected_circle),m=c?memberships[key(c.id)]:null;
  if(name==='read_circles')return {data:circles.filter(c=>!c.closed&&(c.privacy==='public'||actor)&&(!a.selected_slug||c.slug===a.selected_slug)&&(!a.selected_topic||c.topic_id===a.selected_topic)&&(!a.own_only||role(c.id))).map(c=>({...c,role:role(c.id),membership:memberships[key(c.id)]?.state??null,member_count:role(c.id)?Object.entries(memberships).filter(([k,m])=>k.startsWith(c.id+':')&&m.state==='active').length:null})),error:null};
  if(name==='read_circle_discussions')return {data:readable(a.selected_circle)?posts.filter(p=>p.circle_id===a.selected_circle&&p.parent_id===(a.reply_to??null)&&!p.deleted&&!p.hidden).map(render):[],error:null};
  if(name==='read_circle_thread')return {data:readable(a.selected_circle)?posts.filter(p=>p.circle_id===a.selected_circle&&p.id===a.thread_id&&!p.deleted&&!p.hidden).map(render)[0]??null:null,error:null};
  if(name==='read_own_circle_application')return {data:m?{state:m.state,answer:m.state==='pending'?m.answer:null}:null,error:null};
  if(name==='read_circle_members')return {data:Object.entries(memberships).filter(([k,m])=>k.startsWith(a.selected_circle+':')&&m.state===a.queue).map(([k,m])=>({...m,answer:m.state==='pending'?m.answer:null,is_self:k===key(a.selected_circle)})),error:null};
  if(name==='read_circle_reports')return {data:reports.filter(r=>posts.some(p=>p.id===r.target_id&&p.circle_id===a.selected_circle&&(r.status==='open'||p.hidden))).map(r=>({...r,moderation_state:posts.find(p=>p.id===r.target_id).hidden?'hidden':'visible'})),error:null};
  if(name==='change_circle_membership'){if(a.membership_action==='leave'){m.state='left';m.role='member';m.answer='';}else memberships[key(c.id)]={id:m?.id??id(),display_name:'Fixture applicant',role:'member',state:c.privacy==='public'?'active':'pending',answer:c.privacy==='private'?a.application_answer:''};}
  if(name==='review_circle_member'){const target=Object.values(memberships).find(m=>m.id===a.membership_id);if(a.review_action==='approve'||a.review_action==='decline'){target.state=a.review_action==='approve'?'active':'declined';target.answer='';}else if(a.review_action==='remove'){target.state='removed';target.role='member';}else target.role=a.review_action==='promote'?'moderator':'member';}
  if(name==='publish_circle_post'){const p={id:id(),circle_id:a.selected_circle,parent_id:a.reply_to??null,author:actor,display_name:a.anonymous?'Anonymous':'Fixture author',body:a.post_body,post_type:a.post_kind,source_path:a.passage_path??null,sources:a.source_items??[],created_at:new Date().toISOString(),votes:[],helped:[],anonymous:a.anonymous};posts.unshift(p);return {data:p.id,error:null};}
  if(name==='set_contribution_vote'){const p=posts.find(p=>p.id===a.contribution_id);p.votes=a.voting?[...new Set([...p.votes,actor])]:p.votes.filter(uid=>uid!==actor);}
  if(name==='react_community_post'){const p=posts.find(p=>p.id===a.post_id);if(a.reaction_name==='helped')p.helped=p.helped.includes(actor)?p.helped.filter(uid=>uid!==actor):[...p.helped,actor];}
  if(name==='delete_community_post')posts.find(p=>p.id===a.post_id).deleted=true;
  if(name==='community_safety_action'&&a.action_name==='report'){const p=posts.find(p=>p.id===a.target_id);reports.push({id:id(),target_id:p.id,category:a.report_category,status:'open',body:p.body,display_name:p.display_name,moderation_state:'visible'});}
  if(name==='moderate_circle_post'){posts.find(p=>p.id===a.post_id).hidden=a.new_state!=='visible';reports.filter(r=>r.target_id===a.post_id).forEach(r=>r.status='resolved');}
  if(name==='create_circle'){const c={id:id(),slug:a.circle_slug,name:a.circle_name,description:a.circle_description,privacy:a.circle_privacy,topic_id:a.selected_topic,application_question:a.question,created_at:new Date().toISOString()};circles.push(c);memberships[key(c.id)]={id:id(),display_name:'Fixture owner',role:'owner',state:'active',answer:''};return {data:c.id,error:null};}
  if(name==='edit_circle')Object.assign(c,{name:a.circle_name,description:a.circle_description,application_question:a.question});
  if(name==='close_circle')c.closed=true;
  return {data:null,error:null};
 }
 export const supabase={auth:{getSession:async()=>({data:{session:session()},error:null}),onAuthStateChange(fn){listeners.push(fn);return {data:{subscription:{unsubscribe(){listeners=listeners.filter(x=>x!==fn)}}}};}},from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>{termsChecks++;return {data:{version:'${TERMS_VERSION}'},error:null};}};return q;},rpc(name,args={}){let signal;return {abortSignal(s){signal=s;return this;},then(resolve,reject){if(window.circleFixture.hang)return new Promise(r=>signal?.addEventListener('abort',()=>r({data:null,error:{message:'Aborted'}}),{once:true})).then(resolve,reject);return call(name,args).then(resolve,reject);}};}};
 `}));
 }}]});
 const c=await browser.newContext({serviceWorkers:"block"});const p=await c.newPage();const errors=[],consoleErrors=[],consoleWarnings=[];p.on("pageerror",e=>errors.push(e.message));p.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text());if(m.type()==="warning")consoleWarnings.push(m.text());});
 const js=result.outputFiles.find(f=>f.path.endsWith('.js'))?.text??result.outputFiles[0].text;
 const css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
 let checks=0,bootstrap=null;
 const check=async(label,fn)=>{await fn();checks++;console.log("PASS Circle browser:",label);};
 // Wait until the new account has settled: its Community Guidelines check ran, the view no longer asks to accept them
 // and no load runs for two frames. Acting earlier can hit the previous account's view or a load that is about to restart.
 const signIn=async(which)=>{
  const before=await p.evaluate(which=>{const f=window.circleFixture,before=f.termsChecks;f.settledFrames=0;f.signIn(f[which]);return before;},which);
  await p.waitForFunction(before=>{const f=window.circleFixture,refresh=[...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh Circles');
   const settled=f.termsChecks>before&&!!refresh&&!refresh.disabled&&!document.body.innerText.includes('Accept the current Community Guidelines');
   f.settledFrames=settled?f.settledFrames+1:0;return f.settledFrames>=2;},before);
 };
 const open=async(slug)=>{await p.evaluate(slug=>{history.pushState({},'', '/community/circles/'+slug);window.dispatchEvent(new PopStateEvent('popstate'));},slug);await p.getByRole('heading',{name:slug==='private-walk'?'Private fixture Walk':'Public fixture Walk',exact:true}).waitFor();};
 const confirm=async()=>{await p.getByRole('dialog').waitFor();await p.getByRole('button',{name:'Confirm',exact:true}).click();};
 try{
  await p.route(base+"/community/circles**",route=>route.request().resourceType()==='document'?route.fulfill({contentType:'text/html',body:'<style>'+css+'</style><div id="root"></div><script>window.circleBootstrap='+JSON.stringify(bootstrap).replaceAll('<', '\\u003c')+';</script><script>'+js+'</script>'}):route.continue());
  await p.goto(base+'/community/circles');
  await check('discovery and atomic owner creation/edit/close controls',async()=>{
   await p.getByRole('button',{name:'Create a Circle',exact:true}).click();await p.getByLabel('Circle name',{exact:true}).fill('Created fixture Circle');await p.getByLabel('Description',{exact:true}).fill('Created fixture description');await p.getByLabel('URL slug · immutable').fill('bad slug');assert.equal(await p.getByLabel('URL slug · immutable').evaluate(el=>el.validity.patternMismatch),true);await p.getByLabel('URL slug · immutable').fill('created-walk');assert.equal(await p.getByLabel('URL slug · immutable').evaluate(el=>el.checkValidity()),true);await p.getByRole('button',{name:'Create Circle',exact:true}).click();await p.getByRole('heading',{name:'Created fixture Circle',exact:true}).waitFor();
   await p.getByRole('button',{name:'Edit Circle details',exact:true}).click();await p.getByLabel('Circle name',{exact:true}).fill('Edited fixture Circle');await p.getByRole('button',{name:'Save Circle details',exact:true}).click();await p.getByRole('heading',{name:'Edited fixture Circle',exact:true}).waitFor();
   await p.getByRole('button',{name:'Close Circle',exact:true}).click();await confirm();await p.getByText('Circle unavailable.',{exact:false}).waitFor();
  });
  await check('public join, anonymous post, deep link, reply, vote, reaction and report',async()=>{
   await signIn('other');await open('public-walk');await p.getByRole('button',{name:'Join Circle',exact:true}).click();await p.getByLabel('Your Circle contribution',{exact:true}).fill('Public UI fixture words');await p.getByLabel('Source title · optional',{exact:true}).fill('Fixture source');await p.getByLabel('Source HTTPS URL · optional',{exact:true}).fill('https://example.org/source');const passageInput=p.getByLabel('Scripture / devotional path · optional',{exact:true});await passageInput.fill('/outside/path');assert.equal(await passageInput.evaluate(el=>el.validity.patternMismatch),true);for(const path of ['/bible/romans/8/28','/grow/growing-closer-to-god']){await passageInput.fill(path);assert.equal(await passageInput.evaluate(el=>el.checkValidity()),true);}await passageInput.fill('');await p.getByLabel('Display anonymously',{exact:true}).check();await p.getByRole('button',{name:'Publish to Circle',exact:true}).click();await p.getByText('Public UI fixture words',{exact:true}).waitFor();assert.ok(await p.getByRole('link',{name:'Fixture source · example.org'}).evaluate(el=>el.getBoundingClientRect().height>=44));assert.equal(await p.getByRole('link',{name:'Fixture source · example.org'}).getAttribute('rel'),'noopener noreferrer');
   await p.getByRole('button',{name:/Open discussion/}).click();await p.getByLabel('Your Circle contribution',{exact:true}).fill('Public reply UI fixture');await p.getByRole('button',{name:'Publish to Circle',exact:true}).click();await p.getByText('Public reply UI fixture',{exact:true}).waitFor();
   await signIn('owner');await p.getByRole('button',{name:'Upvote · 0',exact:true}).first().click();await p.getByRole('button',{name:'Remove upvote · 1',exact:true}).first().waitFor();await p.getByRole('button',{name:'This helped me · 0',exact:true}).first().click();
   await p.getByRole('button',{name:'Report this post',exact:true}).first().click();await p.getByRole('radio',{name:/^Spam/}).check();await p.getByRole('button',{name:'Send report',exact:true}).click();await p.getByRole('heading',{name:'Thank you for telling us',exact:true}).waitFor();await p.getByRole('button',{name:'Keep reading',exact:true}).click();
   await p.getByRole('button',{name:'Back to Circle discussions',exact:true}).click();assert.match(await p.locator('section').innerText(),/Public UI fixture words/);
   await p.getByText('Circle moderation · scoped to this Circle',{exact:true}).click();await p.getByRole('button',{name:'Hide contribution',exact:true}).click();await confirm();
   await p.getByRole('button',{name:'Keep visible',exact:true}).waitFor();assert.equal(await p.locator('article').filter({has:p.getByRole('heading',{name:'Anonymous',exact:true})}).count(),0);
   await p.getByRole('button',{name:'Keep visible',exact:true}).click();await confirm();await p.getByText('Public UI fixture words',{exact:true}).waitFor();
  });
  await check('private application pending hides content; owner approval grants access',async()=>{
   await signIn('owner');await open('private-walk');await p.getByLabel('Your Circle contribution',{exact:true}).fill('PRIVATE UI FIXTURE SECRET');await p.getByRole('button',{name:'Publish to Circle',exact:true}).click();await p.getByText('PRIVATE UI FIXTURE SECRET',{exact:true}).waitFor();
   await signIn('other');await p.getByLabel('Private application answer · optional').fill('PRIVATE APPLICATION FIXTURE');await p.getByRole('button',{name:'Submit application',exact:true}).click();await p.getByText('Application pending.',{exact:false}).waitFor();assert.ok(!(await p.locator('section').innerText()).includes('PRIVATE UI FIXTURE SECRET'));
   await signIn('owner');await p.getByText('Circle moderation · scoped to this Circle',{exact:true}).click();await p.getByText('PRIVATE APPLICATION FIXTURE',{exact:true}).waitFor();await p.getByRole('button',{name:'Approve application',exact:true}).click();await confirm();
   await signIn('other');await p.getByText('PRIVATE UI FIXTURE SECRET',{exact:true}).waitFor();assert.equal(await p.getByText('PRIVATE APPLICATION FIXTURE',{exact:true}).count(),0);
  });
  await check('moderator promotion/demotion/removal controls; removed account loses reads',async()=>{
   await signIn('owner');await p.getByText('Circle moderation · scoped to this Circle',{exact:true}).click();await p.getByLabel('Review list').selectOption('active');await p.getByRole('button',{name:'Promote moderator',exact:true}).click();await confirm();await p.getByRole('button',{name:'Demote moderator',exact:true}).waitFor();
   await signIn('other');await p.getByText('Circle moderation · scoped to this Circle',{exact:true}).click();await p.getByLabel('Review list').selectOption('active');await p.getByText('Owner membership is protected.',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Promote moderator',exact:true}).count(),0);
   await signIn('owner');await p.getByText('Circle moderation · scoped to this Circle',{exact:true}).click();await p.getByLabel('Review list').selectOption('active');await p.getByRole('button',{name:'Demote moderator',exact:true}).click();await confirm();await p.getByRole('button',{name:'Remove member',exact:true}).click();await confirm();
   await signIn('other');await p.getByText('Your membership was removed.',{exact:false}).waitFor();assert.ok(!(await p.locator('section').innerText()).includes('PRIVATE UI FIXTURE SECRET'));
  });
  await check('leave confirmation focuses Cancel, Escape cancels, confirmed leave persists in SDK state',async()=>{
   await open('public-walk');await p.getByRole('button',{name:'Leave Circle',exact:true}).click();assert.equal(await p.locator(':focus').innerText(),'Cancel');await p.keyboard.press('Escape');assert.equal(await p.getByRole('dialog').count(),0);assert.equal(await p.locator(':focus').innerText(),'Leave Circle');await p.getByRole('button',{name:'Leave Circle',exact:true}).click();await confirm();await p.getByRole('button',{name:'Join Circle',exact:true}).waitFor();
  });
  await check('account switching/offline clears private content and never persists it',async()=>{
   await signIn('owner');await open('private-walk');await p.getByText('PRIVATE UI FIXTURE SECRET',{exact:true}).waitFor();await c.setOffline(true);await p.getByText('Offline.',{exact:false}).waitFor();assert.ok(!(await p.locator('section').innerText()).includes('PRIVATE UI FIXTURE SECRET'));assert.ok(!await p.evaluate(()=>JSON.stringify({...localStorage}).includes('PRIVATE UI FIXTURE')));await c.setOffline(false);await p.getByText('PRIVATE UI FIXTURE SECRET',{exact:true}).waitFor();await signIn('other');await p.getByText('Your membership was removed.',{exact:false}).waitFor();assert.ok(!(await p.locator('section').innerText()).includes('PRIVATE UI FIXTURE SECRET'));
  });
  await check('Circle network error and aborted timeout recover with working refresh',async()=>{
   await p.evaluate(()=>window.circleFixture.fail=true);await p.getByRole('button',{name:'Refresh Circles',exact:true}).click();await p.getByText('Circles are unavailable or access changed.',{exact:false}).waitFor();assert.equal(await p.getByRole('button',{name:'Refresh Circles',exact:true}).isEnabled(),true);await p.evaluate(()=>window.circleFixture.fail=false);
   await p.clock.install();await p.evaluate(()=>window.circleFixture.hang=true);await p.getByRole('button',{name:'Refresh Circles',exact:true}).click();await p.clock.runFor(12500);await p.getByText('A timed-out submission may have saved',{exact:false}).waitFor();assert.equal(await p.getByRole('button',{name:'Refresh Circles',exact:true}).isEnabled(),true);await p.evaluate(()=>window.circleFixture.hang=false);await p.getByRole('button',{name:'Refresh Circles',exact:true}).click();await p.getByText('Your membership was removed.',{exact:false}).waitFor();
   await signIn('owner');await open('public-walk');const postCount=await p.evaluate(()=>window.circleFixture.posts.length);
   await p.getByLabel('Your Circle contribution',{exact:true}).fill('Retain failed mutation draft');await p.evaluate(()=>window.circleFixture.fail=true);await p.getByRole('button',{name:'Publish to Circle',exact:true}).click();
   await p.getByText('Circles are unavailable or access changed.',{exact:false}).waitFor();assert.equal(await p.locator('form textarea').first().inputValue(),'Retain failed mutation draft');assert.equal(await p.evaluate(()=>window.circleFixture.posts.length),postCount);
   await p.evaluate(()=>window.circleFixture.fail=false);
  });
  await check('slow valid RPCs finish without periodic refresh restarting the load',async()=>{
   await signIn('owner');await open('public-walk');await p.locator('form textarea').first().waitFor();
   await p.evaluate(()=>window.circleFixture.delay=9000);await p.getByRole('button',{name:'Refresh Circles',exact:true}).click();
   for(let i=0;i<5;i++)await p.clock.runFor(9500);
   assert.equal(await p.getByRole('button',{name:'Refresh Circles',exact:true}).isEnabled(),true,'background revalidation must not cancel an unfinished valid load');
   assert.ok(await p.locator('form textarea').first().isVisible());await p.evaluate(()=>window.circleFixture.delay=0);
  });
  await check('malformed successful RPC data fails closed with a recoverable error',async()=>{
   await p.evaluate(()=>window.circleFixture.malformed=true);await p.getByRole('button',{name:'Refresh Circles',exact:true}).click();
   await p.getByText('Circles are unavailable or access changed.',{exact:false}).waitFor();assert.equal(await p.getByRole('button',{name:'Refresh Circles',exact:true}).isEnabled(),true);
   assert.equal(await p.getByRole('heading',{name:'Anonymous',exact:true}).count(),0);await p.evaluate(()=>window.circleFixture.malformed=false);await p.getByRole('button',{name:'Refresh Circles',exact:true}).click();await p.locator('form textarea').first().waitFor();
  });
  await check('untrusted HTML and Unicode remain plain text in discussion/source rendering',async()=>{
   await signIn('owner');await open('public-walk');const text='<img src=x onerror="window.circleInjected=true"> 🕊️';const title='<script>window.circleInjected=true</script>';
   await p.locator('form textarea').first().fill(text);await p.getByLabel('Source title · optional',{exact:true}).fill(title);await p.getByLabel('Source HTTPS URL · optional',{exact:true}).fill('https://example.org/plain-text');await p.getByRole('button',{name:'Publish to Circle',exact:true}).click();
   await p.getByText(text,{exact:true}).waitFor();assert.equal(await p.locator('.circles img,.circles script').count(),0);assert.equal(await p.evaluate(()=>window.circleInjected),undefined);assert.equal(await p.getByRole('link',{name:title+' · example.org'}).getAttribute('href'),'https://example.org/plain-text');
  });
  await check('deep-link refresh, back/forward and signed-out private denial retain server-fixture state',async()=>{
   await signIn('owner');await open('private-walk');await p.getByText('PRIVATE UI FIXTURE SECRET',{exact:true}).waitFor();
   bootstrap=await p.evaluate(()=>{const f=window.circleFixture;return {actor:f.actor,count:f.count,circles:f.circles,memberships:f.memberships,posts:f.posts,reports:f.reports};});
   await p.reload();await p.getByText('PRIVATE UI FIXTURE SECRET',{exact:true}).waitFor();
   await open('public-walk');await p.goBack();await p.getByText('PRIVATE UI FIXTURE SECRET',{exact:true}).waitFor();await p.goForward();await p.getByRole('heading',{name:'Public fixture Walk',exact:true}).waitFor();
   await open('private-walk');await p.evaluate(()=>window.circleFixture.signIn(null));await p.getByText('Circle unavailable.',{exact:false}).waitFor();
   bootstrap=await p.evaluate(()=>{const f=window.circleFixture;return {actor:f.actor,count:f.count,circles:f.circles,memberships:f.memberships,posts:f.posts,reports:f.reports};});
   await p.reload();await p.getByText('Circle unavailable.',{exact:false}).waitFor();assert.ok(!(await p.locator('section').innerText()).includes('PRIVATE UI FIXTURE SECRET'));
  });
  await check('320/360/390/430/768/1280px, both modes: long names, composer and labels fit',async()=>{
   await signIn('owner');await open('public-walk');await p.evaluate(()=>{window.circleFixture.circles[0].name='L'.repeat(80);window.circleFixture.circles[0].description='D'.repeat(1000);});await p.getByRole('button',{name:'Refresh Circles',exact:true}).click();await p.getByRole('heading',{name:'L'.repeat(80),exact:true}).waitFor();
   for(const width of [320,360,390,430,768,1280])for(const theme of ['light','lamplight']){await p.setViewportSize({width,height:900});await p.evaluate(theme=>document.documentElement.dataset.mode=theme,theme);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),theme+' overflow at '+width);assert.equal(await p.locator('section h1').count(),1);assert.ok(await p.locator('form textarea').first().isVisible());assert.ok(await p.getByRole('button',{name:'Publish to Circle',exact:true}).evaluate(el=>el.getBoundingClientRect().height>=44));}
  });
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(consoleWarnings,[]);console.log(checks+' Circle SDK/browser boundary checks passed; synthetic fixtures only, no hosted claims.');
 } catch(error) {throw new Error(error.message+"\nSynthetic fixture DOM: "+await p.locator("body").innerText());} finally {await c.close();}
}

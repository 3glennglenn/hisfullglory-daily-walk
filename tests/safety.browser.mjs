import {build} from "esbuild";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
// The version the app asks for is read from the app, so this fixture follows it when it changes.
const TERMS_VERSION=readFileSync("src/platform/auth.tsx","utf8").match(/TERMS_VERSION = "([^"]+)"/)[1];
// The report dialog (UI-SPEC Surface 4) against a controlled SDK: states, focus, roles, sizes.
// Synthetic fixture data only; the server side (hold, limits) is tested in report-hold-schema.test.mjs.
const NOTE="PRIVATE NOTE 7391 do not log";
const REASON_LABELS=["Harassment or threats","Hate","Sexual content","Dangerous advice","Scam","Private information","Spam","Something else"];
export async function checkSafety(browser,base){
  const result=await build({entryPoints:["tests/fixtures/safety.tsx"],bundle:true,write:false,outfile:".tooling/safety-fixture.js",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{
    name:"controlled-safety-sdk",
    setup(b){
      b.onResolve({filter:/^\.\.\/supabase$/},()=>({path:"sdk",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents:`
        const user='a0000000-0000-4000-8000-000000000001';
        let actor=user,listeners=[];
        const session=()=>actor?{user:{id:actor},access_token:'synthetic'}:null;
        const f=window.safetyFixture={calls:[],mode:'ok',message:'',pending:null,changed:0,blocksChanged:0,blocks:[],blocksMode:'ok',blocksPending:null,
          signIn(uid){actor=uid;listeners.forEach(fn=>fn('SIGNED_IN',session()));},
          release(){const done=f.pending;f.pending=null;if(done)done({data:null,error:null});},
          releaseBlocks(){const done=f.blocksPending;f.blocksPending=null;if(done)done();}};
        window.addEventListener('hfg-blocks-changed',()=>{f.blocksChanged++;});
        function rpc(name,args){
          f.calls.push({name,args});
          if(name==='community_safety_action'){
            if(f.mode==='hold')return new Promise(resolve=>{f.pending=resolve;});
            if(f.mode==='error')return Promise.resolve({data:null,error:{message:f.message}});
            return Promise.resolve({data:null,error:null});
          }
          if(name==='read_own_blocks'){
            const answer=()=>f.blocksMode==='fail'?{data:null,error:{message:'unavailable'}}:{data:f.blocks.slice(),error:null};
            if(f.blocksMode==='hold')return new Promise(resolve=>{f.blocksPending=()=>resolve(answer());});
            return Promise.resolve(answer());
          }
          if(name==='remove_block'){f.blocks=f.blocks.filter(x=>x.id!==args.blocked_user);return Promise.resolve({data:null,error:null});}
          return Promise.resolve({data:null,error:null});
        }
        export const supabase={
          auth:{getSession:async()=>({data:{session:session()},error:null}),onAuthStateChange(fn){listeners.push(fn);return {data:{subscription:{unsubscribe(){listeners=listeners.filter(x=>x!==fn);}}}};}},
          from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{version:'${TERMS_VERSION}'},error:null})};return q;},
          rpc:(name,args)=>rpc(name,args||{})
        };
      `}));
    },
  }]});
  const js=result.outputFiles.find(f=>f.path.endsWith(".js"))?.text??result.outputFiles[0].text;
  const css=result.outputFiles.find(f=>f.path.endsWith(".css"))?.text??"";
  const c=await browser.newContext({serviceWorkers:"block",viewport:{width:375,height:812}});
  const p=await c.newPage();
  const errors=[],consoleAll=[];
  p.on("pageerror",e=>errors.push(e.message));
  p.on("console",m=>consoleAll.push(m.type()+": "+m.text()));
  let checks=0;
  const check=async(label,fn)=>{await fn();checks++;console.log("PASS Safety browser:",label);};
  const fixture=(fn,arg)=>p.evaluate(fn,arg);
  const trigger=()=>p.getByRole("button",{name:/^Report this/});
  const dialog=()=>p.getByRole("dialog");
  const open=async()=>{await trigger().click();await dialog().waitFor();};
  const reset=async()=>{
    if(await dialog().count())await p.keyboard.press("Escape");
    await fixture(()=>{const f=window.safetyFixture;f.mode="ok";f.message="";f.pending=null;f.calls.length=0;f.changed=0;f.blocksChanged=0;});
    await dialog().waitFor({state:"detached"});
  };
  const reports=()=>fixture(()=>window.safetyFixture.calls.filter(x=>x.name==="community_safety_action"));
  const alertText=async()=>(await p.getByRole("alert").innerText()).replace(/\s+/g," ").trim();
  try{
    await p.route(base+"/__safety-fixture",route=>route.fulfill({contentType:"text/html",body:"<style>"+css+"</style><div id=\"root\"></div><script>"+js+"</script>"}));
    await p.goto(base+"/__safety-fixture");
    await trigger().waitFor();

    await check("trigger says Report, is named for the thing, and announces a dialog",async()=>{
      assert.equal((await trigger().innerText()).trim(),"Report");
      assert.equal(await trigger().getAttribute("aria-label"),"Report this post");
      assert.equal(await trigger().getAttribute("aria-haspopup"),"dialog");
      assert.equal(await dialog().count(),0,"no dialog is mounted until it is opened");
      const size=await trigger().evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height};});
      assert.ok(size.width>=44&&size.height>=44,"the trigger is a 44px target: "+JSON.stringify(size));
    });

    await check("populated: eight reasons in harm-first order, none preselected, Send before Don't send",async()=>{
      await open();
      await p.getByRole("dialog",{name:"Report this post",exact:true}).waitFor();
      assert.equal(await p.getByRole("heading",{name:"Report this post",level:2}).count(),1);
      await p.getByText("A person reads every report. The author is not told who reported.",{exact:true}).waitFor();
      await p.getByRole("group",{name:"What is the problem?"}).waitFor();
      const radios=p.getByRole("radio");
      assert.equal(await radios.count(),8);
      assert.deepEqual(await radios.evaluateAll(list=>list.map(r=>r.checked)),Array(8).fill(false));
      assert.deepEqual(await radios.evaluateAll(list=>list.map(r=>r.value)),["harassment","hate","sexual content","dangerous advice","scam","private information","spam","other"]);
      const labels=await p.locator("dialog label.report-reason").evaluateAll(list=>list.map(l=>l.querySelector(".report-reason-label").textContent));
      assert.deepEqual(labels,REASON_LABELS);
      await p.getByLabel("Anything we should know? (optional)").waitFor();
      await p.getByText("Only our reviewers see this. Do not include passwords.",{exact:true}).waitFor();
      await p.getByText("If someone may be in danger right now, contact your local emergency services.",{exact:true}).waitFor();
      assert.deepEqual(await p.locator("dialog button").allInnerTexts(),["Send report","Don't send report"]);
      assert.equal(await p.locator("dialog textarea").getAttribute("maxlength"),"1000");
    });

    await check("empty: no reason shows the alert, links it to the fieldset, focuses the first radio and sends nothing",async()=>{
      await p.getByRole("button",{name:"Send report",exact:true}).click();
      await p.getByRole("alert").waitFor();
      assert.equal(await alertText(),"Error: Choose a reason so we know where to look.");
      const describedBy=await p.getByRole("group",{name:"What is the problem?"}).getAttribute("aria-describedby");
      assert.equal(await p.getByRole("alert").getAttribute("id"),describedBy);
      assert.equal(await fixture(()=>document.activeElement.value),"harassment");
      assert.equal((await reports()).length,0);
      await p.getByRole("radio",{name:/^Hate/}).check();
      assert.equal(await p.getByRole("alert").count(),0,"choosing a reason clears the alert");
    });

    await check("partial: a reason without a note sends an empty note and shows the confirmation with focus on its heading",async()=>{
      await reset();await open();
      await p.getByRole("radio",{name:/^Spam/}).check();
      await p.getByRole("button",{name:"Send report",exact:true}).click();
      await p.getByRole("heading",{name:"Thank you for telling us",level:2}).waitFor();
      const sent=await reports();
      assert.equal(sent.length,1);
      assert.deepEqual(sent[0].args,{target_kind:"post",target_id:"d0000000-0000-4000-8000-000000000001",action_name:"report",report_category:"spam",report_note:""});
      assert.equal(await fixture(()=>document.activeElement.textContent),"Thank you for telling us");
      await p.getByText("We have sent your report. A person will read it. The author is not told who reported.",{exact:true}).waitFor();
      assert.deepEqual(await p.locator("dialog button").allInnerTexts(),["Block this person","Keep reading"]);
      assert.equal(await fixture(()=>window.safetyFixture.changed),0,"lists refresh when the reader is done, not under the confirmation");
      await p.getByRole("button",{name:"Keep reading",exact:true}).click();
      await dialog().waitFor({state:"detached"});
      assert.equal(await fixture(()=>window.safetyFixture.changed),1);
      assert.equal(await fixture(()=>window.safetyFixture.blocksChanged),0,"reporting alone blocks nobody");
    });

    await check("loading: Sending… with aria-disabled, repeated presses send nothing more, dialog stays open",async()=>{
      await reset();await fixture(()=>{window.safetyFixture.mode="hold";});
      await open();
      await p.getByRole("radio",{name:/^Scam/}).check();
      const send=p.getByRole("button",{name:"Send report",exact:true});
      await send.click();
      const sending=p.getByRole("button",{name:"Sending…",exact:true});
      await sending.waitFor();
      assert.equal(await sending.getAttribute("aria-disabled"),"true");
      await sending.click({force:true});await sending.click({force:true});
      assert.equal((await reports()).length,1);
      assert.equal(await dialog().count(),1);
      await fixture(()=>window.safetyFixture.release());
      await p.getByRole("heading",{name:"Thank you for telling us"}).waitFor();
      assert.equal((await reports()).length,1);
    });

    await check("errors: send failed and report limit keep the reason and note; a vanished post offers only Close dialog",async()=>{
      await reset();await open();
      await p.getByRole("radio",{name:/^Hate/}).check();
      await p.getByLabel("Anything we should know? (optional)").fill(NOTE);
      await fixture(()=>{window.safetyFixture.mode="error";window.safetyFixture.message="fetch failed";});
      await p.getByRole("button",{name:"Send report",exact:true}).click();
      await p.getByRole("alert").waitFor();
      assert.equal(await alertText(),"Error: Your report was not sent. Check your connection and try again.");
      assert.equal(await p.getByRole("radio",{name:/^Hate/}).isChecked(),true);
      assert.equal(await p.getByLabel("Anything we should know? (optional)").inputValue(),NOTE);
      assert.equal(await p.getByRole("button",{name:"Sending…"}).count(),0,"the button is usable again");
      await fixture(()=>{window.safetyFixture.message="Report limit reached";});
      await p.getByRole("button",{name:"Send report",exact:true}).click();
      await p.getByText("You have sent a lot of reports in the last hour. Please try again later.").waitFor();
      assert.equal(await p.getByRole("radio",{name:/^Hate/}).isChecked(),true);
      await fixture(()=>{window.safetyFixture.message="Visible target required";});
      await p.getByRole("button",{name:"Send report",exact:true}).click();
      await p.getByText("This post is no longer available, so it cannot be reported.").waitFor();
      assert.deepEqual(await p.locator("dialog button").allInnerTexts(),["Close dialog"]);
      await p.getByRole("button",{name:"Close dialog",exact:true}).click();
      await dialog().waitFor({state:"detached"});
      await fixture(()=>{window.safetyFixture.mode="ok";});
      await open();
      assert.equal(await p.getByRole("radio",{name:/^Hate/}).isChecked(),false,"a new dialog starts empty");
    });

    await check("signed out: Sign in to report with one Close dialog button and no request",async()=>{
      await reset();
      await fixture(()=>window.safetyFixture.signIn(null));
      await open();
      await p.getByRole("heading",{name:"Sign in to report",level:2}).waitFor();
      await p.getByText("Reports are linked to an account so we can follow up and stop misuse. Open Profile to sign in.",{exact:true}).waitFor();
      assert.deepEqual(await p.locator("dialog button").allInnerTexts(),["Close dialog"]);
      assert.equal((await reports()).length,0);
      await p.getByRole("button",{name:"Close dialog",exact:true}).click();
      await dialog().waitFor({state:"detached"});
      await fixture(()=>window.safetyFixture.signIn("a0000000-0000-4000-8000-000000000001"));
      await trigger().waitFor();
    });

    await check("block: after the report, Block this person sends only a block and the area reads the status",async()=>{
      await reset();await open();
      await p.getByRole("radio",{name:/^Harassment/}).check();
      await p.getByLabel("Anything we should know? (optional)").fill(NOTE);
      await p.getByRole("button",{name:"Send report",exact:true}).click();
      await p.getByRole("heading",{name:"Thank you for telling us"}).waitFor();
      await p.getByText("You can also stop seeing posts from this person.",{exact:true}).waitFor();
      await p.getByText("You will not see their posts. You can undo this in Settings.",{exact:true}).waitFor();
      await fixture(()=>{window.safetyFixture.mode="error";window.safetyFixture.message="fetch failed";});
      await p.getByRole("button",{name:"Block this person",exact:true}).click();
      await p.getByRole("alert").waitFor();
      assert.equal(await alertText(),"Error: We could not save that. Check your connection and try again.");
      await fixture(()=>{window.safetyFixture.mode="ok";});
      await p.getByRole("button",{name:"Block this person",exact:true}).click();
      const status=dialog().getByRole("status");
      await p.getByText("Blocked. You will not see their posts. You can undo this in Settings.",{exact:true}).waitFor();
      assert.match(await status.innerText(),/^Blocked\. You will not see their posts\. You can undo this in Settings\.$/);
      const blockCall=(await reports()).filter(x=>x.args.action_name==="block").at(-1);
      assert.deepEqual(blockCall.args,{target_kind:"post",target_id:"d0000000-0000-4000-8000-000000000001",action_name:"block",report_category:"other",report_note:""});
      assert.equal(await p.getByRole("button",{name:"Block this person"}).count(),0);
      assert.equal(await fixture(()=>document.activeElement.textContent.trim()),"Keep reading","focus moves to Keep reading when the Block button goes away");
      assert.ok(!/reload/i.test(await dialog().innerText()),"nothing asks the reader to reload");
      await p.getByRole("button",{name:"Keep reading",exact:true}).click();
      await dialog().waitFor({state:"detached"});
      assert.equal(await fixture(()=>window.safetyFixture.blocksChanged),1);
      assert.equal(await fixture(()=>window.safetyFixture.changed),1);
    });

    await check("Escape closes and returns focus to the trigger; a backdrop click is ignored while the note has text",async()=>{
      await reset();await open();
      await p.keyboard.press("Escape");
      await dialog().waitFor({state:"detached"});
      assert.equal(await fixture(()=>document.activeElement.getAttribute("aria-label")),"Report this post");
      await open();
      await p.getByLabel("Anything we should know? (optional)").fill(NOTE);
      await p.mouse.click(3,3);
      await p.waitForTimeout(150);
      assert.equal(await dialog().count(),1,"a stray tap does not lose the note");
      assert.equal(await p.getByLabel("Anything we should know? (optional)").inputValue(),NOTE);
      await p.getByLabel("Anything we should know? (optional)").fill("");
      await p.mouse.click(3,3);
      await dialog().waitFor({state:"detached"});
      await open();
      await p.getByLabel("Anything we should know? (optional)").fill(NOTE);
      await p.getByRole("button",{name:"Don't send report",exact:true}).click();
      await dialog().waitFor({state:"detached"});
      assert.equal((await reports()).length,0,"Don't send report sends nothing");
      await open();
      assert.equal(await p.getByLabel("Anything we should know? (optional)").inputValue(),"","the note is discarded");
    });

    await check("long text: the counter shows only within 100 characters of the limit",async()=>{
      await reset();await open();
      const note=p.getByLabel("Anything we should know? (optional)");
      await note.fill("x".repeat(899));
      assert.equal(await p.getByText(/characters? left/).count(),0);
      await note.fill("x".repeat(900));
      await p.getByText("100 characters left",{exact:true}).waitFor();
      await note.fill("x".repeat(950));
      await p.getByText("50 characters left",{exact:true}).waitFor();
      await note.fill("x".repeat(999));
      await p.getByText("1 character left",{exact:true}).waitFor();
      await note.fill("word ".repeat(150));
      assert.ok(await note.evaluate(el=>el.scrollWidth<=el.clientWidth+1),"the note wraps instead of scrolling sideways");
    });

    await check("the noun follows the kind: chat message, prayer request, support request, unknown kind reads post",async()=>{
      await reset();
      for(const [kind,noun] of [["chat","chat message"],["prayer","prayer request"],["support","support request"],["post","post"]]){
        await fixture(kind=>window.dispatchEvent(new CustomEvent("fixture-kind",{detail:kind})),kind);
        await p.getByRole("button",{name:"Report this "+noun,exact:true}).waitFor();
      }
      await fixture(()=>window.dispatchEvent(new CustomEvent("fixture-kind",{detail:"chat"})));
      await open();
      await p.getByRole("heading",{name:"Report this chat message",level:2}).waitFor();
      assert.equal((await dialog().getAttribute("aria-labelledby"))!==null,true);
      await reset();
      await fixture(()=>window.dispatchEvent(new CustomEvent("fixture-kind",{detail:"post"})));
    });

    await check("concurrency: a late answer after the post changed does not touch the new view",async()=>{
      await reset();await fixture(()=>{window.safetyFixture.mode="hold";});
      await open();
      await p.getByRole("radio",{name:/^Spam/}).check();
      await p.getByRole("button",{name:"Send report",exact:true}).click();
      await p.getByRole("button",{name:"Sending…"}).waitFor();
      await fixture(()=>window.dispatchEvent(new CustomEvent("fixture-id",{detail:"d0000000-0000-4000-8000-000000000002"})));
      await dialog().waitFor({state:"detached"});
      await fixture(()=>window.safetyFixture.release());
      await p.waitForTimeout(200);
      assert.equal(await dialog().count(),0);
      assert.equal(await fixture(()=>window.safetyFixture.changed),0);
      await fixture(()=>{window.safetyFixture.mode="ok";});
      await open();
      assert.equal(await p.getByRole("button",{name:"Send report",exact:true}).count(),1,"the new post's dialog is fresh");
      assert.equal(await p.getByRole("heading",{name:"Thank you for telling us"}).count(),0);
    });

    await check("sizes at 320x568: every reason row and button is at least 44px, nothing overlaps, the dialog scrolls and both buttons are reachable",async()=>{
      await reset();
      await p.setViewportSize({width:320,height:568});
      await open();
      const rows=await p.locator("dialog label.report-reason").evaluateAll(list=>list.map(l=>{const r=l.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right};}));
      assert.equal(rows.length,8);
      for(const row of rows)assert.ok(row.height>=44,"reason row height "+row.height);
      for(let i=1;i<rows.length;i++)assert.ok(rows[i].top>=rows[i-1].bottom-0.5,"reason rows overlap at "+i);
      const box=await dialog().evaluate(d=>{const r=d.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,scrollHeight:d.scrollHeight,clientHeight:d.clientHeight,scrollWidth:d.scrollWidth,clientWidth:d.clientWidth};});
      assert.ok(box.scrollHeight>box.clientHeight,"the content is taller than the dialog, so it scrolls inside it");
      assert.ok(box.scrollWidth<=box.clientWidth+1,"no sideways scroll inside the dialog");
      assert.ok(box.top>=0&&box.bottom<=568&&box.left>=0&&box.right<=320,"the dialog stays inside the screen");
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"the page has no sideways scroll");
      for(const name of ["Send report","Don't send report"]){
        const button=p.getByRole("button",{name,exact:true});
        await button.scrollIntoViewIfNeeded();
        const r=await button.evaluate(el=>{const b=el.getBoundingClientRect(),d=el.closest("dialog").getBoundingClientRect();return {height:b.height,inside:b.top>=d.top&&b.bottom<=d.bottom&&b.top>=0&&b.bottom<=innerHeight};});
        assert.ok(r.height>=44,name+" height "+r.height);
        assert.ok(r.inside,name+" is reachable inside the screen");
      }
      const buttons=await p.locator("dialog button").evaluateAll(list=>list.map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
      assert.ok(buttons[1].top>=buttons[0].bottom-0.5,"the two buttons do not overlap");
      const textarea=await p.locator("dialog textarea").evaluate(el=>el.getBoundingClientRect().height);
      assert.ok(textarea>=44);
      await p.setViewportSize({width:375,height:812});
    });

    await check("the confirmation step is at least 44px per control at 320px too",async()=>{
      await reset();
      await p.setViewportSize({width:320,height:568});
      await open();
      await p.getByRole("radio",{name:/^Spam/}).check();
      await p.getByRole("button",{name:"Send report",exact:true}).click();
      await p.getByRole("heading",{name:"Thank you for telling us"}).waitFor();
      const heights=await p.locator("dialog button").evaluateAll(list=>list.map(b=>b.getBoundingClientRect().height));
      assert.equal(heights.length,2);
      for(const h of heights)assert.ok(h>=44,"button height "+h);
      await p.setViewportSize({width:375,height:812});
    });

    await check("blocked list: loading, empty, error, one and many rows, Remove, 44px targets, 320px wrap",async()=>{
      await reset();
      const OTHER="b0000000-0000-4000-8000-000000000002",ME="a0000000-0000-4000-8000-000000000001";
      const heading=p.getByRole("heading",{name:"Blocked authors",level:2});
      const emptyText=p.getByText("No blocked authors.",{exact:true});
      const unavailable=p.getByText("Block list unavailable.",{exact:true});
      // loading: the heading and the privacy sentence show, the empty text does not, until the answer arrives
      await fixture(()=>{window.safetyFixture.blocksMode="hold";window.safetyFixture.blocks=[];});
      await fixture(uid=>window.safetyFixture.signIn(uid),OTHER);
      await heading.waitFor();
      await p.getByText("These private entries do not reveal anonymous profile names.",{exact:true}).waitFor();
      await fixture(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await emptyText.count(),0,"no empty text while loading");
      assert.equal(await unavailable.count(),0);
      await fixture(()=>window.safetyFixture.releaseBlocks());
      await emptyText.waitFor();
      // error
      await fixture(()=>{window.safetyFixture.blocksMode="fail";});
      await fixture(uid=>window.safetyFixture.signIn(uid),ME);
      await unavailable.waitFor();
      assert.equal(await emptyText.count(),0,"an unavailable list is not an empty list");
      assert.equal(await p.getByRole("status").filter({hasText:"Block list unavailable."}).count(),1);
      // one row, then many
      await fixture(()=>{window.safetyFixture.blocksMode="ok";window.safetyFixture.blocks=[{id:"e0000000-0000-4000-8000-000000000001",action:"block",created_at:"2026-10-10T12:00:00Z"}];});
      await fixture(uid=>window.safetyFixture.signIn(uid),OTHER);
      await p.getByText(/^Author 1 · block · /).waitFor();
      assert.equal(await emptyText.count(),0);
      assert.equal(await unavailable.count(),0);
      await fixture(()=>{window.safetyFixture.blocks=[{id:"e0000000-0000-4000-8000-000000000001",action:"block",created_at:"2026-10-10T12:00:00Z"},{id:"e0000000-0000-4000-8000-000000000002",action:"mute",created_at:"2026-10-11T12:00:00Z"}];});
      await fixture(uid=>window.safetyFixture.signIn(uid),ME);
      await p.getByText(/^Author 2 · mute · /).waitFor();
      assert.equal(await p.getByRole("button",{name:/^Remove /}).count(),2);
      await p.getByRole("button",{name:"Remove block for Author 1",exact:true}).waitFor();
      await p.getByRole("button",{name:"Remove mute for Author 2",exact:true}).waitFor();
      // 320px: rows wrap, Remove stays a 44px target, nothing scrolls sideways
      await p.setViewportSize({width:320,height:568});
      const heights=await p.getByRole("button",{name:/^Remove /}).evaluateAll(list=>list.map(b=>b.getBoundingClientRect().height));
      for(const h of heights)assert.ok(h>=44,"Remove height "+h);
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"no sideways scroll at 320px");
      await p.setViewportSize({width:375,height:812});
      // Remove calls remove_block and the list reloads
      await p.getByRole("button",{name:/^Remove /}).first().click();
      await p.getByText(/^Author 2 · /).waitFor({state:"detached"});
      await p.getByText(/^Author 1 · mute · /).waitFor();
      assert.deepEqual(await fixture(()=>window.safetyFixture.calls.filter(x=>x.name==="remove_block").map(x=>x.args)),[{blocked_user:"e0000000-0000-4000-8000-000000000001"}]);
      // no names and no post text, only the anonymous row
      const listText=await p.locator("div.card").filter({has:heading}).innerText();
      assert.ok(!/Synthetic fixture post/.test(listText));
      await fixture(()=>{window.safetyFixture.blocks=[];});
      await fixture(uid=>window.safetyFixture.signIn(uid),OTHER);
      await emptyText.waitFor();
    });

    await check("privacy: the note and reason never reach the console, storage or the address",async()=>{
      await reset();await open();
      await p.getByRole("radio",{name:/^Private information/}).check();
      await p.getByLabel("Anything we should know? (optional)").fill(NOTE);
      await p.getByRole("button",{name:"Send report",exact:true}).click();
      await p.getByRole("heading",{name:"Thank you for telling us"}).waitFor();
      assert.equal((await reports())[0].args.report_note,NOTE);
      assert.ok(!consoleAll.some(line=>line.includes("PRIVATE NOTE")||line.includes("private information")),"nothing is logged");
      assert.ok(!(await p.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).includes("PRIVATE NOTE"),"nothing is stored");
      assert.ok(!p.url().includes("PRIVATE"),"nothing is in the address");
      await p.getByRole("button",{name:"Keep reading",exact:true}).click();
    });

    assert.deepEqual(errors,[]);
    assert.deepEqual(consoleAll.filter(line=>line.startsWith("error")||line.startsWith("warning")),[]);
    console.log(checks+" report dialog checks passed; synthetic fixtures only, no hosted claims.");
  }catch(error){
    throw new Error(error.message+"\nSafety fixture DOM: "+await p.locator("body").innerText().catch(()=>"(unavailable)"));
  }finally{await c.close();}
}

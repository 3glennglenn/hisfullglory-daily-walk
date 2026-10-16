import {build} from "esbuild";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// The Profile page and its account deletion, in a real browser against a controlled SDK.
const USER="c0000000-0000-4000-8000-000000000001",OTHER="c0000000-0000-4000-8000-000000000002";
const css=readFileSync("src/styles.css","utf8");

// The controlled SDK: a signed-in session, answers for profiles and community_terms, and a
// delete_my_account call that resolves, fails or hangs on demand (window.profileTest.rpcMode).
const sdk=`
const U=${JSON.stringify(USER)};
const listeners=[];let current={user:{id:U},access_token:'synthetic-test-only'};
const t=window.profileTest={rpcMode:'resolve',rpcCalls:0,signOutCalls:[],pending:[],
  release(error){const r=t.pending.splice(0);r.forEach(done=>done({data:null,error:error?{message:'synthetic failure'}:null}));}};
export const supabase={
  auth:{
    getSession:()=>Promise.resolve({data:{session:current},error:null}),
    onAuthStateChange:cb=>{listeners.push(cb);return {data:{subscription:{unsubscribe(){const i=listeners.indexOf(cb);if(i>=0)listeners.splice(i,1);}}}}},
    signOut:async options=>{t.signOutCalls.push(options);current=null;listeners.slice().forEach(l=>l('SIGNED_OUT',null));return {error:null};}
  },
  from(table){const q={select(){return q},eq(){return q},maybeSingle(){return Promise.resolve({data:table==='profiles'?{display_name:'Fixture reader'}:{version:'2026-10-07'},error:null});}};return q;},
  rpc(name){
    if(name!=='delete_my_account')return Promise.resolve({data:null,error:null});
    t.rpcCalls++;
    if(t.rpcMode==='hang')return new Promise(resolve=>t.pending.push(resolve));
    return Promise.resolve({data:null,error:t.rpcMode==='reject'?{message:'synthetic failure'}:null});
  }
};`;

async function bundle({supportReady}) {
  const result=await build({entryPoints:["tests/fixtures/profile.tsx"],bundle:true,write:false,format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{
    name:"controlled-test-sdk",
    setup(b){
      b.onResolve({filter:/^\.\.\/supabase$/},()=>({path:"sdk",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents:sdk}));
      // The shared support flag is flipped for one bundle only, so both states of the gating are tested.
      b.onLoad({filter:/site[\\/]src[\\/]data[\\/]legal\.ts$/},args=>{
        const source=readFileSync(args.path,"utf8");
        const changed=source.replace(/export const supportEmailReady = (?:false|true);/,`export const supportEmailReady = ${supportReady};`);
        assert.ok(changed.includes(`export const supportEmailReady = ${supportReady};`),"legal.ts still declares supportEmailReady");
        return {loader:"ts",contents:changed};
      });
    },
  }]});
  return result.outputFiles[0].text;
}

async function open(browser,base,{supportReady=false,viewport={width:375,height:812},settings=false}={}) {
  const script=await bundle({supportReady});
  const context=await browser.newContext({serviceWorkers:"block",viewport});
  const page=await context.newPage();
  const problems={errors:[],consoleErrors:[],consoleWarnings:[]};
  page.on("pageerror",e=>problems.errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")problems.consoleErrors.push(m.text());if(m.type()==="warning")problems.consoleWarnings.push(m.text());});
  await page.route(base+"/__profile",route=>route.fulfill({contentType:"text/html",body:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`}));
  await page.goto(base+"/__profile"+(settings?"#settings":""));
  await page.getByRole("heading",{name:settings?"About and legal":"Delete your account",exact:true}).waitFor();
  return {context,page,problems};
}
const clean=problems=>{assert.deepEqual(problems.errors,[]);assert.deepEqual(problems.consoleErrors,[]);assert.deepEqual(problems.consoleWarnings,[]);};

async function deletionFlow(browser,base) {
  const {context,page:p,problems}=await open(browser,base);
  try {
    // This account's private data and another account's, both on this device.
    await p.evaluate(([a,b])=>{localStorage.setItem(`hfg-private:${a}:probe`,"mine");localStorage.setItem(`hfg-private:${b}:probe`,"theirs");},[USER,OTHER]);
    await p.getByRole("button",{name:"Delete my account",exact:true}).click();
    await p.getByLabel("Type DELETE to confirm").fill("delete");
    await p.getByRole("button",{name:"Delete my account permanently",exact:true}).click();
    const done=p.getByRole("heading",{name:"Your account has been deleted",exact:true});
    await done.waitFor();
    assert.equal(await p.evaluate(()=>window.profileTest.rpcCalls),1,"delete_my_account was called exactly once");
    assert.deepEqual(await p.evaluate(()=>window.profileTest.signOutCalls),[{scope:"local"}],"only this device's session is ended");
    assert.equal(await done.evaluate(el=>el===document.activeElement),true,"the confirmation heading has focus");
    assert.equal(await p.evaluate(([a,b])=>[localStorage.getItem(`hfg-private:${a}:probe`),localStorage.getItem(`hfg-private:${b}:probe`)],[USER,OTHER]).then(v=>JSON.stringify(v)),JSON.stringify([null,"theirs"]),"this account's private data is gone and another account's stays");
    clean(problems);
  } finally {await context.close();}
}

const trigger=p=>p.getByRole("button",{name:"Delete my account",exact:true});
const permanent=p=>p.getByRole("button",{name:"Delete my account permanently",exact:true});
const keep=p=>p.getByRole("button",{name:"Keep my account",exact:true});
const field=p=>p.getByLabel("Type DELETE to confirm");
const focused=locator=>locator.evaluate(el=>el===document.activeElement);
const words=async locator=>(await locator.textContent()).replace(/\s+/g," ").trim();

// Empty, wrong and right words; what the card lists; focus when it opens and when it is dismissed.
async function cardStates(browser,base) {
  const {context,page:p,problems}=await open(browser,base);
  try {
    const card=p.locator("section.delete-account");
    assert.equal(await card.locator("h2").innerText(),"Delete your account");
    assert.equal(await card.getByRole("listitem").count(),6,"the six things that are deleted are a list");
    assert.match(await card.innerText(),/Export a private backup in Settings first if you want to keep them\./);
    const t=trigger(p);
    assert.equal(await t.getAttribute("aria-expanded"),"false");
    const controls=await t.getAttribute("aria-controls");
    assert.ok(controls&&await p.locator("#"+controls).count()===1,"aria-controls names the confirmation region");
    assert.equal(await field(p).count(),0,"the confirmation is not offered before the trigger is pressed");

    await t.click();
    assert.equal(await t.getAttribute("aria-expanded"),"true");
    assert.equal(await focused(field(p)),true,"opening moves focus to the field");
    assert.equal(await card.locator("h3").innerText(),"Confirm deletion");
    assert.deepEqual(await card.locator("form button").allInnerTexts(),["Delete my account permanently","Keep my account"],"the dangerous button comes first and the safe one is named");
    for(const [name,value] of [["autocomplete","off"],["autocapitalize","characters"],["spellcheck","false"],["inputmode","text"]]) assert.equal(await field(p).getAttribute(name),value,name);
    assert.equal(await permanent(p).isDisabled(),true,"empty word: the permanent button is disabled");
    assert.equal(await p.locator("#delete-account-hint").count(),0,"empty word: no hint yet");

    await field(p).fill("remove");
    assert.equal(await permanent(p).isDisabled(),true,"wrong word: still disabled");
    const hint=p.getByText("Type DELETE exactly to confirm.",{exact:true});
    assert.equal(await hint.isVisible(),true,"wrong word: the hint is shown");
    assert.equal(await field(p).getAttribute("aria-describedby"),await hint.getAttribute("id"),"the hint is linked to the field");
    await field(p).fill("DELETED");
    assert.equal(await permanent(p).isDisabled(),true,"DELETED is not DELETE");
    await field(p).fill("");
    assert.equal(await hint.count(),0,"clearing the field removes the hint");
    await field(p).fill(" Delete ");
    assert.equal(await permanent(p).isDisabled(),false,"any letter case and surrounding spaces are accepted");
    assert.equal(await hint.count(),0);

    await keep(p).click();
    assert.equal(await t.getAttribute("aria-expanded"),"false","Keep my account collapses the form");
    assert.equal(await focused(t),true,"and returns focus to the trigger");
    await t.click();
    assert.equal(await field(p).inputValue(),"","and the word was cleared");
    clean(problems);
  } finally {await context.close();}
}

// While the call is pending, a second press changes nothing; a failure keeps the form and the word.
async function busyAndFailure(browser,base) {
  const {context,page:p,problems}=await open(browser,base);
  try {
    await p.evaluate(()=>{window.profileTest.rpcMode="hang";});
    await trigger(p).click();
    await field(p).fill("DELETE");
    await permanent(p).click();
    await p.getByRole("button",{name:"Deleting…",exact:true}).waitFor();
    const form=p.locator("section.delete-account form");
    assert.equal(await form.getAttribute("aria-busy"),"true","the form is busy");
    assert.equal(await p.getByRole("status").filter({hasText:"Deleting your account."}).count(),1,"the progress is announced");
    assert.equal(await keep(p).isDisabled(),true,"Keep my account is disabled while deleting");
    assert.equal(await p.getByRole("button",{name:"Deleting…",exact:true}).getAttribute("aria-disabled"),"true");
    // A second press from every direction: click, the keyboard on the button, Enter in the field.
    await p.getByRole("button",{name:"Deleting…",exact:true}).click({force:true});
    await p.getByRole("button",{name:"Deleting…",exact:true}).press("Enter");
    await field(p).press("Enter");
    assert.equal(await p.evaluate(()=>window.profileTest.rpcCalls),1,"delete_my_account was called exactly once");
    await p.evaluate(()=>window.profileTest.release(false));
    await p.getByRole("heading",{name:"Your account has been deleted",exact:true}).waitFor();
    assert.equal(await p.evaluate(()=>window.profileTest.rpcCalls),1,"and still once after it finished");
    clean(problems);
  } finally {await context.close();}

  const failing=await open(browser,base);
  try {
    const q=failing.page;
    await q.evaluate(()=>{window.profileTest.rpcMode="reject";});
    await trigger(q).click();
    await field(q).fill("delete");
    await permanent(q).click();
    const alert=q.getByRole("alert");
    await alert.waitFor();
    assert.equal(await words(alert),"Error: Your account was not deleted, and nothing was removed. Try again later.","the failure says what happened and what to do");
    assert.equal(await q.locator("section.delete-account form").getAttribute("aria-busy"),"false");
    assert.equal(await field(q).inputValue(),"delete","the typed word is kept");
    assert.equal(await permanent(q).isDisabled(),false,"and the form is ready for another try");
    assert.equal(await alert.locator("a").count(),0,"no support address in the failure while forwarding is not proven");
    await q.evaluate(()=>{window.profileTest.rpcMode="resolve";});
    await permanent(q).click();
    await q.getByRole("heading",{name:"Your account has been deleted",exact:true}).waitFor();
    assert.equal(await q.evaluate(()=>window.profileTest.rpcCalls),2,"the retry is a second, separate call");
    clean(failing.problems);
  } finally {await failing.context.close();}
}

// The shared flag turns the support sentence on, and nothing else changes in the failure.
async function supportReady(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{supportReady:true});
  try {
    await p.evaluate(()=>{window.profileTest.rpcMode="reject";});
    await trigger(p).click();
    await field(p).fill("delete");
    await permanent(p).click();
    const alert=p.getByRole("alert");
    await alert.waitFor();
    assert.equal(await words(alert),"Error: Your account was not deleted, and nothing was removed. Try again. If it keeps failing, email support@hisfullglory.com.");
    assert.equal(await alert.locator("a").getAttribute("href"),"mailto:support@hisfullglory.com");
    clean(problems);
  } finally {await context.close();}
}

// The Profile card speaks of codes, and the support address is shown only when forwarding is proven.
async function profileCopyAndSupport(browser,base) {
  for(const ready of [false,true]) {
    const {context,page:p,problems}=await open(browser,base,{supportReady:ready});
    try {
      const card=p.locator(".card",{has:p.getByRole("heading",{name:"Account and privacy",exact:true})});
      const text=await words(card);
      assert.match(text,/You sign in with a 6-digit code we email you\. Signing in does not upload your private journal or prayers\./);
      assert.match(text,/Use Settings to export your private data\. You can delete your account on this page at any time\./);
      assert.doesNotMatch(text,/magic|secure link|email links|Google and Apple/i);
      const mailtos=await p.locator("a[href^='mailto:']").count();
      if(ready) {
        assert.equal(mailtos,1,"ready: exactly one support link");
        assert.equal(await card.getByRole("link",{name:"Contact support",exact:true}).getAttribute("href"),"mailto:support@hisfullglory.com");
      } else {
        assert.equal(mailtos,0,"not ready: no mailto link on the page");
        assert.equal(await p.getByText("support@hisfullglory.com").count(),0,"not ready: the address is not printed either");
        assert.equal(await p.getByRole("link",{name:"Contact support"}).count(),0);
      }
      clean(problems);
    } finally {await context.close();}
  }
}

// The trust pages are linked from Profile and from the last card of Settings (GATE-02, UI-SPEC 6d).
async function legalLinks(browser,base) {
  const pages=[["Privacy policy","https://hisfullglory.com/privacy"],["Terms of use","https://hisfullglory.com/terms"],["How account deletion works","https://hisfullglory.com/delete-account"]];
  for(const settings of [false,true]) for(const ready of [false,true]) for(const viewport of [{width:375,height:812},{width:320,height:568}]) {
    const where=(settings?"Settings":"Profile")+", support "+(ready?"ready":"not ready")+", "+viewport.width+"px";
    const {context,page:p,problems}=await open(browser,base,{supportReady:ready,settings,viewport});
    try {
      const nav=p.getByRole("navigation",{name:"Privacy and help",exact:true});
      assert.equal(await nav.count(),1,where+": one nav named Privacy and help");
      const links=nav.getByRole("link");
      assert.equal(await links.count(),ready?4:3,where+": three links, four when support is ready");
      for(const [name,href] of pages) {
        const a=nav.getByRole("link",{name:name+" (opens in a new tab)",exact:true});
        assert.equal(await a.count(),1,where+": "+name+" is announced as opening in a new tab");
        assert.equal(await a.getAttribute("href"),href,where+": "+name+" href");
        assert.equal(await a.getAttribute("target"),"_blank",where+": "+name+" opens in a new tab");
        assert.match(await a.getAttribute("rel"),/(^|\s)noopener(\s|$)/,where+": "+name+" has rel noopener");
        assert.equal(await a.evaluate(el=>el.querySelector(".sr-only")?.textContent)," (opens in a new tab)",where+": the hint is visually hidden text");
        assert.equal(await a.evaluate(el=>[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join("")),name,where+": the visible words are only the name");
      }
      // Every list link is a block at least 44px tall and stays inside the screen.
      for(let i=0;i<await links.count();i++) {
        const box=await links.nth(i).boundingBox();
        assert.ok(box&&box.height>=44,where+": link "+i+" is at least 44px tall ("+box?.height+")");
        assert.ok(box.x+box.width<=viewport.width,where+": link "+i+" stays inside the screen");
      }
      assert.equal(await p.locator("a[target='_blank']:not([rel~='noopener'])").count(),0,where+": every new-tab link has rel noopener");
      const support=nav.getByRole("link",{name:"Contact support",exact:true});
      if(ready) {
        assert.equal(await support.getAttribute("href"),"mailto:support@hisfullglory.com",where);
        assert.equal(await support.getAttribute("target"),null,where+": a mail link does not open a tab");
      } else {
        assert.equal(await p.locator("a[href^='mailto:']").count(),0,where+": no mailto while forwarding is unproven");
        assert.equal(await p.getByText("support@hisfullglory.com").count(),0,where+": and the address is not printed");
      }
      const card=p.locator(".card",{has:nav});
      if(settings) {
        assert.equal(await card.locator("h2").innerText(),"About and legal");
        assert.equal(await card.evaluate(el=>el===el.parentElement.lastElementChild),true,where+": About and legal is the final card of Settings");
      } else {
        assert.equal(await card.locator("h2").innerText(),"Account and privacy",where+": in Profile the links sit in the Account and privacy card");
      }
      clean(problems);
    } finally {await context.close();}
  }
}

// 320px wide, text at 200%: the open form, the failure and the success card neither scroll sideways nor
// clip, and every control is at least 44px tall.
async function reflow(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{viewport:{width:320,height:568}});
  try {
    await p.evaluate(()=>{document.documentElement.style.fontSize="200%";});
    const fits=async label=>{
      const m=await p.evaluate(()=>{
        const card=document.querySelector(".delete-account")??document.querySelector("section.card[role='status']");
        const right=[...card.querySelectorAll("*")].reduce((max,el)=>Math.max(max,el.getBoundingClientRect().right),0);
        return {page:document.documentElement.scrollWidth,view:window.innerWidth,cardScroll:card.scrollWidth,cardClient:card.clientWidth,right};
      });
      assert.ok(m.page<=m.view,label+": the page does not scroll sideways ("+m.page+" > "+m.view+")");
      assert.ok(m.cardScroll<=m.cardClient,label+": nothing in the card is wider than the card");
      assert.ok(m.right<=m.view,label+": nothing is pushed past the right edge ("+m.right+")");
    };
    const tall=async(locator,label)=>{const box=await locator.boundingBox();assert.ok(box&&box.height>=44,label+" is at least 44px tall ("+box?.height+")");assert.ok(box.width>=44,label+" is at least 44px wide");};
    await fits("collapsed");
    await tall(trigger(p),"the Delete my account trigger");
    await p.evaluate(()=>{window.profileTest.rpcMode="reject";});
    await trigger(p).click();
    await field(p).fill("delete");
    await fits("open");
    await tall(permanent(p),"Delete my account permanently");
    await tall(keep(p),"Keep my account");
    await tall(field(p),"the confirm field");
    await permanent(p).click();
    await p.getByRole("alert").waitFor();
    await fits("failed");
    await p.evaluate(()=>{window.profileTest.rpcMode="resolve";});
    await permanent(p).click();
    const done=p.getByRole("heading",{name:"Your account has been deleted",exact:true});
    await done.waitFor();
    await fits("deleted");
    await tall(p.getByRole("link",{name:"Go to Today",exact:true}),"Go to Today");
    assert.equal(await p.getByRole("link",{name:"Go to Today",exact:true}).getAttribute("href"),"/");
    clean(problems);
  } finally {await context.close();}
}

export async function checkProfile(browser,base) {
  await deletionFlow(browser,base);
  await cardStates(browser,base);
  await busyAndFailure(browser,base);
  await supportReady(browser,base);
  await profileCopyAndSupport(browser,base);
  await legalLinks(browser,base);
  await reflow(browser,base);
}

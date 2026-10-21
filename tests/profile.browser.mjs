import {build} from "esbuild";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// The Profile page and its account deletion, in a real browser against a controlled SDK.
const USER="c0000000-0000-4000-8000-000000000001",OTHER="c0000000-0000-4000-8000-000000000002";
const css=readFileSync("src/styles.css","utf8");

// The controlled SDK: a signed-in session, answers for profiles and community_terms, and a
// delete_my_account call that resolves, fails or hangs on demand (window.profileTest.rpcMode).
// The version the app asks for is read from the app, so this fixture follows it when it changes.
const TERMS_VERSION=readFileSync("src/platform/auth.tsx","utf8").match(/TERMS_VERSION = "([^"]+)"/)[1];
// The age sentence the app imports from legal.ts, so this test follows the wording instead of copying it.
const AGE_LABEL=JSON.parse(`"${readFileSync("site/src/data/legal.ts","utf8").match(/export const ageLabel = need\(\s*"ageLabel",\s*"((?:[^"\\]|\\.)*)"/)[1]}"`);

// Besides deletion, the SDK answers the sign-in calls (signInWithOtp, verifyOtp) and the terms
// acceptance (accept_community_terms), each resolving, failing or hanging on demand through
// window.profileTest: rpcMode, otpMode, verifyMode, acceptMode. Hanging calls wait in .pending.
const sdk=({signedOut,accepted})=>`
const U=${JSON.stringify(USER)};
const listeners=[];let current=${signedOut?"null":"{user:{id:U},access_token:'synthetic-test-only'}"};
const t=window.profileTest={rpcMode:'resolve',rpcCalls:0,signOutCalls:[],pending:[],profileName:'Fixture reader',
  oauthMode:'resolve',oauthCalls:[],otpMode:'resolve',otpCalls:[],verifyMode:'reject',verifyCalls:[],signInOnVerify:false,acceptMode:'resolve',acceptCalls:[],
  release(error){const r=t.pending.splice(0);r.forEach(done=>done({data:null,error:error?{message:'synthetic failure'}:null}));},
  // A Google sign-in that finished: the session carries the name and picture Google sent, which the app must never use.
  googleSignedIn(){current={user:{id:U,user_metadata:{full_name:'Gwen Googler',name:'Gwen Googler',avatar_url:'https://example.invalid/gwen.png',picture:'https://example.invalid/gwen.png'}},access_token:'synthetic-test-only'};listeners.slice().forEach(l=>l('SIGNED_IN',current));}};
const answer=mode=>{
  if(mode==='hang')return new Promise(resolve=>t.pending.push(resolve));
  // The shape of supabase-js's AuthApiError for an address the built-in email sender may not write to.
  if(mode==='not-authorized')return Promise.resolve({data:{},error:{name:'AuthApiError',status:400,code:'email_address_not_authorized',message:'Email address "reader@example.org" cannot be used as it is not authorized'}});
  return Promise.resolve({data:{},error:mode==='reject'?{message:'synthetic failure'}:null});
};
export const supabase={
  auth:{
    getSession:()=>Promise.resolve({data:{session:current},error:null}),
    onAuthStateChange:cb=>{listeners.push(cb);return {data:{subscription:{unsubscribe(){const i=listeners.indexOf(cb);if(i>=0)listeners.splice(i,1);}}}}},
    signOut:async options=>{t.signOutCalls.push(options);current=null;listeners.slice().forEach(l=>l('SIGNED_OUT',null));return {error:null};},
    signInWithOAuth:args=>{t.oauthCalls.push(args);return answer(t.oauthMode);},
    signInWithOtp:args=>{t.otpCalls.push(args);return answer(t.otpMode);},
    verifyOtp:async args=>{
      t.verifyCalls.push(args);
      const result=await answer(t.verifyMode);
      if(!result.error&&t.signInOnVerify){current={user:{id:U},access_token:'synthetic-test-only'};listeners.slice().forEach(l=>l('SIGNED_IN',current));}
      return result;
    }
  },
  from(table){const q={error:null,select(){return q},eq(){return q},update(){return q},insert(){return q},maybeSingle(){return Promise.resolve({data:table==='profiles'?(t.profileName===null?null:{display_name:t.profileName}):${accepted?`{version:${JSON.stringify(TERMS_VERSION)}}`:"null"},error:null});}};return q;},
  rpc(name,args){
    if(name==='accept_community_terms'){t.acceptCalls.push(args);return answer(t.acceptMode);}
    if(name!=='delete_my_account')return Promise.resolve({data:null,error:null});
    t.rpcCalls++;
    if(t.rpcMode==='hang')return new Promise(resolve=>t.pending.push(resolve));
    return Promise.resolve({data:null,error:t.rpcMode==='reject'?{message:'synthetic failure'}:null});
  }
};`;

async function bundle({supportReady,signedOut,accepted}) {
  const result=await build({entryPoints:["tests/fixtures/profile.tsx"],bundle:true,write:false,format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{
    name:"controlled-test-sdk",
    setup(b){
      b.onResolve({filter:/^\.\.\/supabase$/},()=>({path:"sdk",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents:sdk({signedOut,accepted})}));
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

export async function open(browser,base,{supportReady=false,viewport={width:375,height:812},settings=false,signedOut=false,accepted=true,clock=false,address="",scale=1}={}) {
  const script=await bundle({supportReady,signedOut,accepted});
  const context=await browser.newContext({serviceWorkers:"block",viewport,deviceScaleFactor:scale});
  const page=await context.newPage();
  const problems={errors:[],consoleErrors:[],consoleWarnings:[]};
  page.on("pageerror",e=>problems.errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")problems.consoleErrors.push(m.text());if(m.type()==="warning")problems.consoleWarnings.push(m.text());});
  // A function, so the same page also opens with a query or a hash on the address (the way back from Google).
  await page.route(url=>url.pathname==="/__profile",route=>route.fulfill({contentType:"text/html",body:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`}));
  // A clock the test steps by hand (the resend countdown), stopped ten seconds after the page opened.
  if(clock) await page.clock.install({time:new Date("2026-10-16T10:00:00Z")});
  await page.goto(base+"/__profile"+(settings?"#settings":address));
  await page.getByRole("heading",{name:settings?"About and legal":signedOut?"Sign in when you are ready":"Delete your account",exact:true}).waitFor();
  if(clock) await page.clock.pauseAt(new Date("2026-10-16T10:00:10Z"));
  return {context,page,problems};
}
export const clean=problems=>{assert.deepEqual(problems.errors,[]);assert.deepEqual(problems.consoleErrors,[]);assert.deepEqual(problems.consoleWarnings,[]);};

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
export const words=async locator=>(await locator.textContent()).replace(/\s+/g," ").trim();

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

// The Account page speaks of codes, and the support address is shown only when forwarding is proven.
async function profileCopyAndSupport(browser,base) {
  for(const ready of [false,true]) {
    const {context,page:p,problems}=await open(browser,base,{supportReady:ready});
    try {
      const card=p.locator("section.group",{has:p.getByRole("heading",{name:"Account and privacy",exact:true})});
      const text=await words(card);
      assert.match(text,/You sign in with Google or with a 6-digit code we email you\. Signing in does not upload your private journal or prayers\./);
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

// The trust pages are linked from Account and from the last group of Settings (GATE-02, UI-SPEC 6d).
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
      const card=p.locator("section.group",{has:nav});
      if(settings) {
        assert.equal(await card.locator("h2").innerText(),"About and legal");
        assert.equal(await card.evaluate(el=>el===el.parentElement.lastElementChild),true,where+": About and legal is the final group of Settings");
      } else {
        assert.equal(await card.locator("h2").innerText(),"Account and privacy",where+": in Profile the links sit in the Account and privacy group");
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

// Signed out: the sign-in form and the code entry speak of a 6-digit code like the email does (UI-SPEC 6b, E10).
const withoutHint=text=>text.replace(/ \(opens in a new tab\)/g,"");
export const signInCard=p=>p.locator("section.card",{has:p.getByRole("heading",{name:"Sign in when you are ready",exact:true})});
export const emailField=p=>p.getByLabel("Email",{exact:true});
export const sendCode=p=>p.getByRole("button",{name:"Email me a sign-in code",exact:true});
const codeField=p=>p.getByLabel("Enter the 6-digit code from your email");
const codeButton=p=>p.getByRole("button",{name:/^Sign in with code$|^Signing in…$/});
const resendButton=p=>p.getByRole("button",{name:/^Send a new code$|^Sending…$/});
const WAIT_TEXT=n=>`You can ask again in ${n} ${n===1?"second":"seconds"}.`;
async function signInForm(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{signedOut:true});
  try {
    const card=signInCard(p);
    assert.equal(await sendCode(p).count(),1,"the button names the outcome");
    const text=withoutHint(await words(card));
    assert.match(text,/We will email you a 6-digit code\. No password\. By continuing you agree to the Terms of use and the Privacy policy\./);
    assert.doesNotMatch(text,/link|magic|6 to 10|secure/i,"no sign-in text mentions a link, a magic link or a range of digits");
    for(const [name,href] of [["Terms of use","https://hisfullglory.com/terms"],["Privacy policy","https://hisfullglory.com/privacy"]]) {
      const a=card.getByRole("link",{name:name+" (opens in a new tab)",exact:true});
      assert.equal(await a.getAttribute("href"),href,name);
      assert.equal(await a.getAttribute("target"),"_blank");
      assert.match(await a.getAttribute("rel"),/(^|\s)noopener(\s|$)/);
      const box=await a.boundingBox();
      assert.ok(box&&box.height>=44,name+" is at least 44px tall ("+box?.height+")");
    }
    // Empty: the address is required, and nothing is sent.
    await sendCode(p).click();
    assert.equal(await emailField(p).evaluate(el=>el.validity.valueMissing),true,"an empty address is refused");
    assert.equal(await p.evaluate(()=>window.profileTest.otpCalls.length),0,"and nothing is sent");
    clean(problems);
  } finally {await context.close();}
}

async function signInCodeFlow(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{signedOut:true});
  try {
    const address="reader@example.org";
    const card=signInCard(p);
    // Loading: the send button shows its busy state while the email is requested.
    await p.evaluate(()=>{window.profileTest.otpMode="hang";});
    await emailField(p).fill(address);
    await sendCode(p).click();
    const busy=p.getByRole("button",{name:"Sending…",exact:true});
    await busy.waitFor();
    assert.equal(await busy.isDisabled(),true,"the send button is busy and cannot be pressed twice");
    assert.equal(await p.evaluate(()=>window.profileTest.otpCalls.length),1);
    // Error: a failed send says so in plain words and offers no code field.
    await p.evaluate(()=>window.profileTest.release(true));
    const alert=p.getByRole("alert");
    await alert.waitFor();
    assert.equal(await words(alert),"Error: We could not send the code. Check the address, wait a minute and try again.");
    assert.equal(await codeField(p).count(),0,"no code field after a failed send");
    assert.equal(await sendCode(p).isEnabled(),true,"and the form is ready for another try");
    // Success.
    await p.evaluate(()=>{window.profileTest.otpMode="resolve";});
    await sendCode(p).click();
    await codeField(p).waitFor();
    assert.equal(await p.evaluate(()=>JSON.stringify(window.profileTest.otpCalls.at(-1).email)),JSON.stringify(address));
    assert.equal(await alert.count(),0,"the error is gone after a good send");
    assert.equal(await p.getByRole("status").filter({hasText:"Check your email. The code usually arrives within a minute. Look in spam if you do not see it."}).count(),1,"the status sentence is announced");
    assert.equal(await card.getByText(`We sent a code to ${address}.`,{exact:true}).count(),1);
    assert.equal(await codeField(p).getAttribute("inputmode"),"numeric");
    assert.equal(await codeField(p).getAttribute("autocomplete"),"one-time-code");
    const hint=card.getByText("Never share this code. We will never ask you for it.",{exact:true});
    assert.equal(await hint.count(),1,"the code is a credential and the form says so");
    assert.equal(await codeField(p).getAttribute("aria-describedby"),await hint.getAttribute("id"),"and the hint is tied to the field");
    assert.doesNotMatch(withoutHint(await words(card)),/link|magic|6 to 10|secure/i,"still no link wording once the code is asked for");
    // Partial and pasted: fewer than six digits keep the button disabled; spaces and a dash are accepted.
    assert.equal(await codeButton(p).isDisabled(),true,"empty: disabled");
    await codeField(p).fill("12345");
    assert.equal(await codeButton(p).isDisabled(),true,"five digits: disabled");
    await codeField(p).fill("123 456");
    assert.equal(await codeButton(p).isDisabled(),false,"six digits with a space: enabled");
    await codeField(p).fill("123-456");
    assert.equal(await codeButton(p).isDisabled(),false,"six digits with a dash: enabled");
    await codeField(p).fill("12a456");
    assert.equal(await codeButton(p).isDisabled(),true,"a letter among the digits: disabled");
    // Loading, then a wrong or expired code.
    await codeField(p).fill("123 456");
    await p.evaluate(()=>{window.profileTest.verifyMode="hang";});
    await codeButton(p).click();
    const signing=p.getByRole("button",{name:"Signing in…",exact:true});
    await signing.waitFor();
    assert.equal(await signing.isDisabled(),true);
    await p.evaluate(()=>window.profileTest.release(true));
    await alert.waitFor();
    assert.equal(await words(alert),"Error: That code did not work. Check the 6 digits, or ask for a new email.");
    assert.deepEqual(await p.evaluate(()=>window.profileTest.verifyCalls),[{email:address,token:"123456",type:"email"}],"the cleaned digits and the address are what is checked");
    assert.equal(await codeField(p).inputValue(),"123 456","the typed code is kept for another look");
    // Success.
    await p.evaluate(()=>{window.profileTest.verifyMode="resolve";});
    await codeButton(p).click();
    await p.getByRole("status").filter({hasText:"Signed in."}).waitFor();
    assert.equal(await alert.count(),0,"the error is gone after a good code");
    // The code is a credential: it is in the field and nowhere else.
    assert.equal(p.url().includes("123456"),false,"never in the address");
    const kept=await p.evaluate(()=>JSON.stringify([{...localStorage},{...sessionStorage}]));
    assert.equal(kept.includes("123456"),false,"never in storage");
    clean(problems);
  } finally {await context.close();}
}

// The resend wait is a visible countdown on a clock the test steps by hand; it is never an error.
async function signInResend(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{signedOut:true,clock:true});
  try {
    await emailField(p).fill("reader@example.org");
    await sendCode(p).click();
    await codeField(p).waitFor();
    const resend=resendButton(p);
    assert.equal(await resend.isDisabled(),true,"asking again is unavailable right after sending");
    assert.equal(await p.getByText(WAIT_TEXT(60),{exact:true}).count(),1,"the wait is shown as text, from 60");
    await p.clock.runFor(18_000);
    assert.equal(await p.getByText(WAIT_TEXT(42),{exact:true}).count(),1,"and counts down");
    await p.clock.runFor(41_000);
    assert.equal(await p.getByText(WAIT_TEXT(1),{exact:true}).count(),1,"to one second, in the singular");
    assert.equal(await resend.isDisabled(),true,"still unavailable one second before the minute is over");
    await p.clock.runFor(1_000);
    assert.equal(await resend.isEnabled(),true,"available at exactly sixty seconds");
    assert.equal(await p.getByText(/You can ask again in/).count(),0,"and the countdown is gone, never negative");
    assert.equal(await p.getByRole("alert").count(),0,"the wait was never an error");
    await resend.click();
    await p.getByText("A new code is on its way. Check your email.",{exact:true}).waitFor();
    assert.equal(await p.evaluate(()=>window.profileTest.otpCalls.length),2,"one more email was requested");
    assert.equal(await p.getByText(WAIT_TEXT(60),{exact:true}).count(),1,"and the wait starts again");
    assert.equal(await resendButton(p).isDisabled(),true);
    // A failed second send is said plainly; the wait stays where it was.
    await p.clock.runFor(60_000);
    await p.evaluate(()=>{window.profileTest.otpMode="reject";});
    await resendButton(p).click();
    const alert=p.getByRole("alert");
    await alert.waitFor();
    assert.equal(await words(alert),"Error: We could not send a new code. Wait a minute and try again.");
    clean(problems);
  } finally {await context.close();}
}

// A long address wraps inside the card at 320px and at 200% text, and the controls stay at 44px.
async function signInReflow(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{signedOut:true,viewport:{width:320,height:568}});
  try {
    await p.evaluate(()=>{document.documentElement.style.fontSize="200%";});
    await emailField(p).fill("a-very-long-address-that-keeps-going-and-going-and-going@a-very-long-domain-name-example.org");
    await sendCode(p).click();
    await codeField(p).waitFor();
    const line=p.getByText(/^We sent a code to /);
    assert.equal(await line.evaluate(el=>getComputedStyle(el).overflowWrap),"anywhere","the address may wrap anywhere");
    const m=await p.evaluate(()=>({page:document.documentElement.scrollWidth,view:window.innerWidth,card:[...document.querySelectorAll("section.card")].map(c=>c.scrollWidth-c.clientWidth)}));
    assert.ok(m.page<=m.view,"no sideways scroll ("+m.page+" > "+m.view+")");
    assert.ok(m.card.every(extra=>extra<=0),"nothing is wider than its card");
    for(const [label,locator] of [["the email field",emailField(p)],["the send button",sendCode(p)],["the code field",codeField(p)],["Sign in with code",codeButton(p)],["Send a new code",resendButton(p)]]) {
      const box=await locator.boundingBox();
      assert.ok(box&&box.height>=44&&box.width>=44,label+" is at least 44px ("+box?.width+"x"+box?.height+")");
      assert.ok(box.x>=0&&box.x+box.width<=m.view,label+" stays inside the screen");
    }
    clean(problems);
  } finally {await context.close();}
}

// Terms acceptance (UI-SPEC 6c, E11): the label names the age, links the terms and privacy pages and shows the version.
const termsBox=p=>p.getByRole("checkbox");
const saveButton=p=>p.getByRole("button",{name:/^Save profile( and accept rules)?$|^Saving…$/});
async function termsAcceptance(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{accepted:false});
  try {
    const label=p.locator("label.check");
    const text=withoutHint(await words(label));
    assert.equal(text,`${AGE_LABEL}. I accept the Terms of use and the community rules, and I have read the Privacy policy. I understand that reports are reviewed by a person. Version ${TERMS_VERSION}.`);
    assert.equal(await label.locator(".terms-version").evaluate(el=>getComputedStyle(el).display),"block","the version has its own line");
    for(const [name,href] of [["Terms of use","https://hisfullglory.com/terms"],["Privacy policy","https://hisfullglory.com/privacy"]]) {
      const a=label.getByRole("link",{name:name+" (opens in a new tab)",exact:true});
      assert.equal(await a.getAttribute("href"),href,name);
      assert.equal(await a.getAttribute("target"),"_blank");
      assert.match(await a.getAttribute("rel"),/(^|\s)noopener(\s|$)/);
      const box=await a.boundingBox();
      assert.ok(box&&box.height>=44,name+" is at least 44px tall ("+box?.height+")");
    }
    // Empty: unticked, the person saves their name and accepts nothing.
    assert.equal(await termsBox(p).isChecked(),false);
    assert.equal(await saveButton(p).textContent(),"Save profile");
    await saveButton(p).click();
    await p.getByRole("status").filter({hasText:"Profile saved."}).waitFor();
    assert.equal(await p.evaluate(()=>window.profileTest.acceptCalls.length),0,"nothing is accepted without the tick");
    // Ticked: the button says what it does; loading shows the busy state and calls once.
    await termsBox(p).check();
    assert.equal(await saveButton(p).textContent(),"Save profile and accept rules");
    await p.evaluate(()=>{window.profileTest.acceptMode="hang";});
    await saveButton(p).click();
    const saving=p.getByRole("button",{name:"Saving…",exact:true});
    await saving.waitFor();
    assert.equal(await saving.isDisabled(),true,"the save button is busy and cannot be pressed twice");
    assert.deepEqual(await p.evaluate(()=>window.profileTest.acceptCalls),[{terms_version:TERMS_VERSION}],"the version the person saw is the version sent");
    await p.evaluate(()=>window.profileTest.release(false));
    await p.getByRole("status").filter({hasText:"Profile saved."}).waitFor();
    // Error: said in plain words as an alert, and the tick stays for another try.
    await p.evaluate(()=>{window.profileTest.acceptMode="reject";});
    await saveButton(p).click();
    const alert=p.getByRole("alert");
    await alert.waitFor();
    assert.equal(await words(alert),"Error: We could not save that. Check your connection and try again.");
    assert.equal(await termsBox(p).isChecked(),true,"the tick is kept");
    assert.equal(await saveButton(p).isEnabled(),true);
    clean(problems);
  } finally {await context.close();}

  // Overflow and long text: 320px wide, text at 200%.
  const narrow=await open(browser,base,{accepted:false,viewport:{width:320,height:568}});
  try {
    const q=narrow.page;
    await q.evaluate(()=>{document.documentElement.style.fontSize="200%";});
    const m=await q.evaluate(()=>{const l=document.querySelector("label.check"),r=l.getBoundingClientRect(),box=l.querySelector("input").getBoundingClientRect();return {page:document.documentElement.scrollWidth,view:window.innerWidth,height:r.height,right:r.right,scroll:l.scrollWidth-l.clientWidth,box:[box.width,box.height]};});
    assert.ok(m.page<=m.view,"no sideways scroll ("+m.page+" > "+m.view+")");
    assert.ok(m.right<=m.view&&m.scroll<=0,"the label wraps inside the screen");
    assert.ok(m.height>=44,"the row is at least 44px tall ("+m.height+")");
    assert.deepEqual(m.box,[22,22],"the checkbox keeps its 22px size beside the wrapped text");
    for(const name of ["Terms of use","Privacy policy"]) {
      const box=await q.locator("label.check").getByRole("link",{name:name+" (opens in a new tab)",exact:true}).boundingBox();
      assert.ok(box&&box.height>=44&&box.x>=0&&box.x+box.width<=320,name+" stays tappable inside the screen");
    }
    clean(narrow.problems);
  } finally {await narrow.context.close();}
}

// Account and Settings as grouped lists (UI-SPEC A12): the titles, the order of the sections, the retired stats card
// and long privacy paragraph, "Sign out" as a plain link row, deletion last, and the one-line privacy sentence.
async function groupedStructure(browser,base) {
  const account=await open(browser,base);
  try {
    const p=account.page;
    assert.equal(await p.locator("h1").innerText(),"Account");
    assert.deepEqual(await p.locator("main h2").allInnerTexts(),["Your community profile","Account and privacy","Delete your account"],"Account: sign-in or details, legal links, deletion last");
    assert.equal(await p.getByText(/daily walks completed|chapters read|private journal entries/).count(),0,"the stats card left Account (the count lives on You)");
    assert.equal(await p.locator("section.delete-account").evaluate(el=>el===el.parentElement.lastElementChild),true,"the deletion card is the last section");
    const out=p.getByRole("button",{name:"Sign out",exact:true});
    const style=await out.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,border:s.borderTopWidth+"|"+s.borderLeftWidth};});
    assert.equal(style.background,"rgba(0, 0, 0, 0)","Sign out has no filled background");
    assert.equal(style.color,"rgb(141, 92, 75)","Sign out is written in the link colour");
    assert.ok((await out.boundingBox()).height>=52,"Sign out is a full-height row");
    await out.click();
    assert.equal(await p.evaluate(()=>window.profileTest.signOutCalls.length),1,"Sign out still calls the sign-out handler");
    await p.getByRole("heading",{name:"Sign in when you are ready",exact:true}).waitFor();
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"no sideways scroll");
    clean(account.problems);
  } finally {await account.context.close();}
  const settings=await open(browser,base,{settings:true});
  try {
    const p=settings.page;
    assert.equal(await p.locator("h1").innerText(),"Settings");
    assert.deepEqual(await p.locator("main h2").allInnerTexts(),["Daily rhythm","Privacy and your data","Blocked authors","About and legal"],"Settings sections (Appearance has its own screen), About and legal last");
    // The long paragraph, the browser-storage sentence and the cloud-sync sentence left Settings (the Privacy policy says it).
    for(const gone of [/remain in\s+browser storage/,/Browser storage\s+is unencrypted/,/No encrypted cloud sync/,/Profile page/])
      assert.equal(await p.getByText(gone).count(),0,String(gone)+" is gone from Settings");
    const line=p.getByRole("link",{name:"Your journal, prayers and reading progress stay on this device. (opens in a new tab)",exact:true});
    assert.equal(await line.getAttribute("href"),"https://hisfullglory.com/privacy");
    assert.equal(await line.getAttribute("target"),"_blank");
    assert.match(await line.getAttribute("rel"),/(^|\s)noopener(\s|$)/);
    assert.equal(await p.locator("section#privacy h2").innerText(),"Privacy and your data");
    for(const label of ["Minutes","Time","Faith journey"]) {
      const select=p.getByLabel(label,{exact:true});
      assert.equal(await select.count(),1,label+" is one labelled select");
      assert.ok((await select.boundingBox()).height>=48,label+" select is 48px tall");
    }
    await p.getByLabel("Minutes",{exact:true}).selectOption("10");
    assert.equal(await p.getByLabel("Minutes",{exact:true}).inputValue(),"10");
    const chips=p.locator("li.list-row-block .chips button");
    for(let i=0;i<3;i++)await chips.nth(i).click();
    assert.equal(await chips.nth(3).isDisabled(),true,"at most three focus areas");
    const [download]=await Promise.all([p.waitForEvent("download"),p.getByRole("button",{name:"Export private backup",exact:true}).click()]);
    assert.match(download.suggestedFilename(),/^hisfullglory-private-backup-\d{4}-\d{2}-\d{2}\.json$/);
    await p.getByText("Private backup exported. Store it securely.",{exact:true}).waitFor();
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"no sideways scroll");
    clean(settings.problems);
  } finally {await settings.context.close();}
}

export async function checkProfile(browser,base) {
  await groupedStructure(browser,base);
  await deletionFlow(browser,base);
  await cardStates(browser,base);
  await busyAndFailure(browser,base);
  await supportReady(browser,base);
  await profileCopyAndSupport(browser,base);
  await legalLinks(browser,base);
  await signInForm(browser,base);
  await signInCodeFlow(browser,base);
  await signInResend(browser,base);
  await signInReflow(browser,base);
  await termsAcceptance(browser,base);
  await reflow(browser,base);
}

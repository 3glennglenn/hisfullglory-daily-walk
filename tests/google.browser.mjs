import assert from "node:assert/strict";
import {clean,emailField,open,sendCode,signInCard,words} from "./profile.browser.mjs";

// "Continue with Google" in the sign-in panel, in a real browser against the controlled SDK of
// profile.browser.mjs. Google and Supabase are never reached: signInWithOAuth is a recording stub.
// The button follows Google's branding guidelines; the colours below are theirs.
const LIGHT={background:"rgb(255, 255, 255)",color:"rgb(31, 31, 31)",border:"rgb(116, 119, 117)"};
const DARK={background:"rgb(19, 19, 20)",color:"rgb(227, 227, 227)",border:"rgb(142, 145, 143)"};
const googleButton=p=>p.getByRole("button",{name:/^Continue with Google$|^Opening Google…$/});
const calls=p=>p.evaluate(()=>window.profileTest.oauthCalls);
const look=(p,l,m)=>p.evaluate(([l,m])=>{document.documentElement.dataset.look=l;document.documentElement.dataset.mode=m;},[l,m]);
const FAILED="Error: Google sign-in did not finish. Try again.";

// Google first, then a quiet "or", then the email way; the button's colours, mark, size and focus ring in both
// looks and both modes.
async function googleFirst(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{signedOut:true,viewport:{width:390,height:844}});
  try {
    const card=signInCard(p);
    assert.equal(await googleButton(p).innerText(),"Continue with Google","the exact label");
    // Order in the panel: heading, the Google button, "or", the email field, "Email me a sign-in code".
    const order=await card.evaluate(el=>{
      const at=node=>[...el.querySelectorAll("*")].indexOf(node);
      const google=el.querySelector(".google-button"),or=el.querySelector(".sign-in-or"),email=el.querySelector("input[type=email]"),send=[...el.querySelectorAll("button")].find(b=>b.textContent.trim()==="Email me a sign-in code");
      return {heading:at(el.querySelector("h2")),google:at(google),or:at(or),email:at(email),send:at(send),firstButton:el.querySelector("button")===google,orText:or.textContent};
    });
    assert.ok(order.heading<order.google&&order.google<order.or&&order.or<order.email&&order.email<order.send,"Google, then or, then the email way: "+JSON.stringify(order));
    assert.equal(order.firstButton,true,"the Google button is the first button of the panel");
    assert.equal(order.orText,"or");
    // The mark: Google's own four colours, decorative (the label names the button), 20px.
    const mark=await googleButton(p).locator("svg.google-mark").evaluate(svg=>({fills:[...svg.querySelectorAll("path")].map(path=>path.getAttribute("fill")),hidden:svg.getAttribute("aria-hidden"),box:[svg.getBoundingClientRect().width,svg.getBoundingClientRect().height]}));
    assert.deepEqual(mark.fills,["#EA4335","#4285F4","#FBBC05","#34A853"],"the multicolour G, unchanged");
    assert.equal(mark.hidden,"true");
    assert.deepEqual(mark.box,[20,20]);
    // Colours, edge and size in the two looks, light and Lamplight (Google's light button and dark button).
    for(const [lookName,mode,want] of [["cover","light",LIGHT],["marked","light",LIGHT],["cover","lamplight",DARK],["marked","lamplight",DARK]]) {
      await look(p,lookName,mode);
      const seen=await googleButton(p).evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {background:s.backgroundColor,color:s.color,border:s.borderTopColor,edge:s.borderTopWidth,height:r.height,width:r.width};});
      const where=`${lookName} ${mode}`;
      assert.equal(seen.background,want.background,where+": fill");
      assert.equal(seen.color,want.color,where+": text");
      assert.equal(seen.border,want.border,where+": edge colour");
      assert.equal(seen.edge,"1px",where+": a 1px edge");
      assert.ok(seen.height>=44,where+": a 44px target ("+seen.height+")");
    }
    await look(p,"cover","light");
    // At least as prominent as the email way: as wide, and not shorter.
    const sizes=await p.evaluate(()=>{const g=document.querySelector(".google-button").getBoundingClientRect(),e=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Email me a sign-in code").getBoundingClientRect();return {gw:g.width,ew:e.width,gh:g.height,eh:e.height};});
    assert.equal(sizes.gw,sizes.ew,"as wide as the email button");
    assert.ok(sizes.gh>=sizes.eh,"not smaller than the email button");
    // The panel reads in the same order for a keyboard: the first Tab stop is the Google button, with the focus ring.
    // (The page starts with its toolbar link, so Tab until a form control is reached: that must be the Google button.)
    for(let i=0;i<4&&!await googleButton(p).evaluate(el=>el===document.activeElement);i++)await p.keyboard.press("Tab");
    assert.equal(await googleButton(p).evaluate(el=>el===document.activeElement),true,"the first control a keyboard reaches is Google");
    const ring=await googleButton(p).evaluate(el=>{const s=getComputedStyle(el);return {width:s.outlineWidth,style:s.outlineStyle,offset:s.outlineOffset};});
    assert.deepEqual(ring,{width:"3px",style:"solid",offset:"3px"},"the visible focus ring");
    // The button is the only sign-in control that sends nothing by itself.
    assert.equal(await p.evaluate(()=>window.profileTest.otpCalls.length+window.profileTest.oauthCalls.length),0,"nothing is sent before a press");
    clean(problems);
  } finally {await context.close();}
}

// A press calls signInWithOAuth once, with provider "google" and a same-origin way back that keeps the page and nothing else.
async function googlePress(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{signedOut:true,address:"?tab=x"});
  try {
    const origin=new URL(base).origin;
    // The address has a query now; the way back must drop it (a hash as well, set by hand).
    await p.evaluate(()=>history.replaceState(null,"","/__profile?code=pkce-code&access_token=abc#access_token=def&refresh_token=ghi"));
    await p.evaluate(()=>{window.profileTest.oauthMode="hang";});
    await googleButton(p).click();
    const busy=p.getByRole("button",{name:"Opening Google…",exact:true});
    await busy.waitFor();
    assert.equal(await busy.isDisabled(),true,"busy: the button waits and cannot be pressed twice");
    assert.equal(await busy.getAttribute("aria-busy"),"true");
    assert.equal(await sendCode(p).isDisabled(),true,"and the email way waits too");
    assert.equal(await p.getByRole("button",{name:"Continue with Google",exact:true}).count(),0,"the label changed while it is busy");
    const made=await calls(p);
    assert.equal(made.length,1,"signInWithOAuth was called exactly once");
    assert.deepEqual(made[0],{provider:"google",options:{redirectTo:origin+"/__profile"}},"provider google, and a way back on this origin with the path only");
    assert.equal(new URL(made[0].options.redirectTo).origin,origin,"same origin");
    const sent=JSON.stringify(made);
    for(const secret of ["pkce-code","access_token","refresh_token","abc","def","ghi"])assert.equal(sent.includes(secret),false,secret+" is never passed on");
    assert.equal(await p.evaluate(()=>window.profileTest.otpCalls.length),0,"no email was requested");
    // Google could not be started: the failure is said in plain words and the button is ready again.
    await p.evaluate(()=>window.profileTest.release(true));
    const alert=p.getByRole("alert");
    await alert.waitFor();
    assert.equal(await words(alert),FAILED);
    assert.equal(await googleButton(p).innerText(),"Continue with Google");
    assert.equal(await googleButton(p).isEnabled(),true);
    // A new try clears the message. When it works the browser leaves for Google, so the busy state stays.
    await p.evaluate(()=>{window.profileTest.oauthMode="resolve";});
    await googleButton(p).click();
    await p.getByRole("button",{name:"Opening Google…",exact:true}).waitFor();
    assert.equal(await alert.count(),0,"the message is gone on the next try");
    assert.equal((await calls(p)).length,2);
    // Back from Google with the Back button can restore the page as it was left: it is not stuck waiting.
    await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true})));
    await p.getByRole("button",{name:"Continue with Google",exact:true}).waitFor();
    // Nothing from Google is requested by the page: no outside request at all.
    clean(problems);
  } finally {await context.close();}
}

// Supabase sends the reader back with an error on the address (hash or query): one plain message, the address cleaned.
async function googleReturnError(browser,base) {
  for(const [name,address] of [
    ["the hash","#error=access_denied&error_code=bad_oauth_callback&error_description=Unable+to+exchange+external+code"],
    ["the query","?error=server_error&error_code=unexpected_failure&error_description=Error+getting+user+profile+from+external+provider"],
  ]) {
    const {context,page:p,problems}=await open(browser,base,{signedOut:true,address});
    try {
      const alert=p.getByRole("alert");
      await alert.waitFor();
      assert.equal(await words(alert),FAILED,"the error in "+name);
      const text=await p.locator("body").innerText();
      assert.equal(/access_denied|bad_oauth|unexpected_failure|external|exchange/i.test(text),false,"the developer's words are not shown");
      assert.equal(await p.evaluate(()=>location.href),base+"/__profile","the error parameters left the address bar");
      assert.equal(await googleButton(p).isEnabled(),true,"and Google can be tried again");
      // A reload shows nothing, because the address no longer says so.
      await p.reload();
      await signInCard(p).waitFor();
      assert.equal(await p.getByRole("alert").count(),0,"no message after a reload");
      clean(problems);
    } finally {await context.close();}
  }
  // The error is cleared by the next try of either way in.
  const {context,page:p,problems}=await open(browser,base,{signedOut:true,address:"#error=access_denied"});
  try {
    await p.getByRole("alert").waitFor();
    await emailField(p).fill("reader@example.org");
    await sendCode(p).click();
    await p.getByRole("status").filter({hasText:"Check your email."}).waitFor();
    assert.equal(await p.getByRole("alert").count(),0,"the error is gone once the email way is tried");
    clean(problems);
  } finally {await context.close();}
}

// Supabase's built-in email sender only reaches team members: that error gets its own words, others keep today's.
async function emailNotOpen(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{signedOut:true});
  try {
    await p.evaluate(()=>{window.profileTest.otpMode="not-authorized";});
    await emailField(p).fill("reader@example.org");
    await sendCode(p).click();
    const alert=p.getByRole("alert");
    await alert.waitFor();
    assert.equal(await words(alert),"Error: Signing in by email is not open yet. Use Continue with Google.");
    assert.equal(await p.getByLabel("Enter the 6-digit code from your email").count(),0,"no code field");
    assert.equal(await googleButton(p).isEnabled(),true,"Google is still offered");
    assert.equal(await sendCode(p).isEnabled(),true);
    // Any other failure keeps today's message.
    await p.evaluate(()=>{window.profileTest.otpMode="reject";});
    await sendCode(p).click();
    await p.getByText("We could not send the code. Check the address, wait a minute and try again.").waitFor();
    assert.equal(await words(alert),"Error: We could not send the code. Check the address, wait a minute and try again.");
    assert.equal(await p.getByText("Signing in by email is not open yet.").count(),0);
    assert.equal((await calls(p)).length,0,"the email way never starts Google by itself");
    clean(problems);
  } finally {await context.close();}
}

// Someone who signed in with Google has no display name here yet: the same step as for email, with nothing taken from Google.
async function googleNewReader(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{signedOut:true,accepted:false});
  try {
    await p.evaluate(()=>{window.profileTest.profileName=null;});
    await p.evaluate(()=>window.profileTest.googleSignedIn());
    await p.getByRole("heading",{name:"Your community profile",exact:true}).waitFor();
    const field=p.getByLabel("Display name",{exact:true});
    await field.waitFor();
    assert.equal(await field.inputValue(),"","the display name starts empty: Google's name is not copied");
    assert.equal(await p.getByRole("button",{name:"Save profile",exact:true}).isDisabled(),true,"saving waits for a name of 2 characters");
    assert.equal(await p.getByRole("checkbox").count(),1,"the terms acceptance runs as for an email reader");
    // What the reader can see, every attribute and every field value: not the test's own script text.
    const page=await p.evaluate(()=>document.body.innerText+" "+[...document.body.querySelectorAll("*:not(script)")].flatMap(el=>[...el.attributes].map(a=>a.value)).join(" ")+" "+[...document.querySelectorAll("input")].map(i=>i.value).join(" "));
    assert.equal(/Gwen|Googler|gwen\.png|example\.invalid/.test(page),false,"neither Google's name nor its picture is on the page");
    assert.equal(await p.locator("img").count(),0,"no picture");
    await field.fill("Pilgrim");
    assert.equal(await p.getByRole("button",{name:"Save profile",exact:true}).isEnabled(),true);
    const kept=await p.evaluate(()=>JSON.stringify([{...localStorage},{...sessionStorage}]));
    assert.equal(/Gwen|Googler|gwen\.png/.test(kept),false,"nothing of Google's profile is kept on the device");
    clean(problems);
  } finally {await context.close();}
}

// 320px wide, text at 200 %: no sideways scroll, the label wraps inside the button, both modes, idle and busy.
async function googleReflow(browser,base) {
  const {context,page:p,problems}=await open(browser,base,{signedOut:true,viewport:{width:320,height:568}});
  try {
    await p.evaluate(()=>{document.documentElement.style.fontSize="200%";});
    for(const mode of ["light","lamplight"]) {
      await look(p,"cover",mode);
      for(const busy of [false,true]) {
        if(busy) {
          await p.evaluate(()=>{window.profileTest.oauthMode="hang";});
          await googleButton(p).click();
          await p.getByRole("button",{name:"Opening Google…",exact:true}).waitFor();
        }
        const m=await p.evaluate(()=>{const b=document.querySelector(".google-button"),r=b.getBoundingClientRect(),label=b.querySelector("span").getBoundingClientRect();return {page:document.documentElement.scrollWidth,view:innerWidth,card:[...document.querySelectorAll("section.card")].map(c=>c.scrollWidth-c.clientWidth),left:r.left,right:r.right,height:r.height,inside:b.scrollWidth-b.clientWidth,labelRight:label.right,labelLeft:label.left};});
        const where=`${mode}${busy?" busy":""}`;
        assert.ok(m.page<=m.view,where+": no sideways scroll ("+m.page+" > "+m.view+")");
        assert.ok(m.card.every(extra=>extra<=0),where+": nothing is wider than its card");
        assert.ok(m.left>=0&&m.right<=m.view,where+": the button stays inside the screen");
        assert.ok(m.height>=44,where+": at least 44px high ("+m.height+")");
        assert.ok(m.inside<=0,where+": the label does not spill out of the button");
        assert.ok(m.labelLeft>=m.left&&m.labelRight<=m.right,where+": the label sits inside the button");
      }
      await p.evaluate(()=>window.profileTest.release(true));
      await googleButton(p).filter({hasText:"Continue with Google"}).waitFor();
    }
    clean(problems);
  } finally {await context.close();}
}

export async function checkGoogle(browser,base) {
  await googleFirst(browser,base);
  await googlePress(browser,base);
  await googleReturnError(browser,base);
  await emailNotOpen(browser,base);
  await googleNewReader(browser,base);
  await googleReflow(browser,base);
}

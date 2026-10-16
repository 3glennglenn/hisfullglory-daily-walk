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

async function open(browser,base,{supportReady=false,viewport={width:375,height:812}}={}) {
  const script=await bundle({supportReady});
  const context=await browser.newContext({serviceWorkers:"block",viewport});
  const page=await context.newPage();
  const problems={errors:[],consoleErrors:[],consoleWarnings:[]};
  page.on("pageerror",e=>problems.errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")problems.consoleErrors.push(m.text());if(m.type()==="warning")problems.consoleWarnings.push(m.text());});
  await page.route(base+"/__profile",route=>route.fulfill({contentType:"text/html",body:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`}));
  await page.goto(base+"/__profile");
  await page.getByRole("heading",{name:"Delete your account",exact:true}).waitFor();
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

export async function checkProfile(browser,base) {
  await deletionFlow(browser,base);
}

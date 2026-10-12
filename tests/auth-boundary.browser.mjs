import {build} from "esbuild";
import assert from "node:assert/strict";

export async function checkAuthBoundary(browser,base) {
  const result=await build({entryPoints:["tests/fixtures/auth-boundary.tsx"],bundle:true,write:false,format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{
    name:"controlled-test-sdk",
    setup(b){
      b.onResolve({filter:/^\.\.\/supabase$/},()=>({path:"sdk",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents:`
        let listener,initialResolve,current=null;
        const terms=[];
        const session=id=>id?{user:{id},access_token:'synthetic-test-only'}:null;
        window.testAuth={
          initial(id){current=session(id);initialResolve({data:{session:current},error:null});},
          switch(id,event='SIGNED_IN'){current=session(id);listener(event,current);},
          termCount(){return terms.length;},
          resolveTerm(index,accepted){terms[index]({data:accepted?{version:'2026-10-07'}:null,error:null});}
        };
        export const supabase={
          auth:{getSession:()=>new Promise(resolve=>initialResolve=resolve),onAuthStateChange:callback=>{listener=callback;return {data:{subscription:{unsubscribe(){}}}}}},
          from(){const q={select(){return q},eq(){return q},maybeSingle(){return new Promise(resolve=>terms.push(resolve))}};return q}
        };
      `}));
    },
  }]});
  const c=await browser.newContext({serviceWorkers:"block"});const p=await c.newPage();const errors=[],consoleErrors=[],consoleWarnings=[];
  p.on("pageerror",e=>errors.push(e.message));p.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text());if(m.type()==="warning")consoleWarnings.push(m.text());});
  try {
    await p.route(base+"/__auth-boundary",route=>route.fulfill({contentType:"text/html",body:'<div id="root"></div><script>'+result.outputFiles[0].text+'</script>'}));
    await p.goto(base+"/__auth-boundary");
    await p.getByRole("heading",{name:"Opening your private profile",exact:true}).waitFor();
    assert.equal(await p.locator("#private").count(),0,"no private state while auth pending");
    await p.evaluate(()=>window.testAuth.initial(null));
    await p.getByRole("heading",{name:"guest",exact:true}).waitFor();
    await p.getByLabel("Private draft").fill("synthetic-guest-only");await p.getByRole("button",{name:"Save locally"}).click();
    await p.getByLabel("Private draft").fill("unsaved-guest-draft");
    const a="a0000000-0000-4000-8000-000000000001",b="b0000000-0000-4000-8000-000000000002";
    await p.evaluate(a=>window.testAuth.switch(a),a);
    await p.getByRole("heading",{name:a,exact:true}).waitFor();
    assert.equal(await p.locator("#private").innerText(),"");assert.equal(await p.getByLabel("Private draft").inputValue(),"");
    await p.getByLabel("Private draft").fill("synthetic-A-only");await p.getByRole("button",{name:"Save locally"}).click();
    await p.waitForFunction(()=>window.testAuth.termCount()===1);
    await p.evaluate(b=>window.testAuth.switch(b),b);await p.getByRole("heading",{name:b,exact:true}).waitFor();
    await p.waitForFunction(()=>window.testAuth.termCount()===2);
    await p.evaluate(()=>window.testAuth.resolveTerm(0,true));
    assert.equal(await p.locator("#terms").innerText(),"false","stale A response cannot authorize B");
    assert.equal(await p.locator("#private").innerText(),"");
    await p.evaluate(()=>window.testAuth.resolveTerm(1,true));await p.waitForFunction(()=>document.querySelector("#terms").textContent==="true");
    await p.evaluate(b=>window.testAuth.switch(b,"TOKEN_REFRESHED"),b);
    await p.waitForFunction(()=>window.testAuth.termCount()===3);
    await p.evaluate(()=>window.testAuth.resolveTerm(2,true));await p.waitForFunction(()=>document.querySelector("#terms").textContent==="true");
    await p.evaluate(a=>window.testAuth.switch(a),a);await p.getByRole("heading",{name:a,exact:true}).waitFor();
    assert.equal(await p.locator("#private").innerText(),"synthetic-A-only");
    await p.evaluate(()=>window.testAuth.switch(null,"SIGNED_OUT"));await p.getByRole("heading",{name:"guest",exact:true}).waitFor();
    assert.equal(await p.locator("#private").innerText(),"synthetic-guest-only");assert.equal(await p.getByLabel("Private draft").inputValue(),"");
    await p.reload();await p.getByRole("heading",{name:"Opening your private profile",exact:true}).waitFor();
    await p.evaluate(a=>window.testAuth.switch(a),a);await p.getByRole("heading",{name:a,exact:true}).waitFor();
    await p.evaluate(()=>window.testAuth.initial(null));
    assert.equal(await p.locator("h1").innerText(),a,"late initial-session response cannot restore guest over A");
    assert.equal(await p.locator("#private").innerText(),"synthetic-A-only");
    assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(consoleWarnings,[]);
  } finally {await c.close();}
}

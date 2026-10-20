import {build} from "esbuild";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
// The version the app asks for is read from the app, so this fixture follows it when it changes.
const TERMS_VERSION=readFileSync("src/platform/auth.tsx","utf8").match(/TERMS_VERSION = "([^"]+)"/)[1];
export async function checkTopicComposer(browser,base){
  const result=await build({entryPoints:["tests/fixtures/topic-hub.tsx"],bundle:true,write:false,format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{
    name:"controlled-topic-sdk",
    setup(b){
      b.onResolve({filter:/^\.\.\/supabase$/},()=>({path:"sdk",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents:`
        const post={id:'b0000000-0000-4000-8000-000000000002',display_name:'Synthetic fixture',body:'Test-only public post',post_type:'question',created_at:'2026-10-07T00:00:00Z',is_owner:false,score:0,upvotes:0,voted:false,helped:0,reputation:0,replies:0,sources:[]};
        const owned={...post,id:'b0000000-0000-4000-8000-000000000009',body:'Test-only post of the reader',is_owner:true,upvotes:3};
        window.topicFixture={publishResolve:null,deleteResolve:null,calls:[]};
        export const supabase={
          auth:{getSession:async()=>({data:{session:{user:{id:'a0000000-0000-4000-8000-000000000001'}}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
          from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{version:'${TERMS_VERSION}'}}),then(callback){return Promise.resolve({data:[{topic_id:'anxiety'},{topic_id:'grief'}],error:null}).then(callback)}};return q},
          rpc(name,args){window.topicFixture.calls.push({name,args});if(name==='delete_community_post')return new Promise(resolve=>window.topicFixture.deleteResolve=()=>resolve({data:null,error:null}));if(name==='publish_topic_post')return new Promise(resolve=>window.topicFixture.publishResolve=()=>resolve({data:'c0000000-0000-4000-8000-000000000003',error:null}));return Promise.resolve({data:name==='read_topic_discussions'?[post,owned]:null,error:null})}
        };
      `}));
    },
  }]});
  const c=await browser.newContext({serviceWorkers:"block"});const p=await c.newPage();const errors=[],consoleErrors=[],consoleWarnings=[];p.on("pageerror",e=>errors.push(e.message));p.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text());if(m.type()==="warning")consoleWarnings.push(m.text());});
  try{
    await p.route(base+"/__topic-fixture",route=>route.fulfill({contentType:"text/html",body:'<div id="root"></div><script>'+result.outputFiles[0].text+'</script>'}));
    await p.goto(base+"/__topic-fixture");await p.locator("form textarea").waitFor();
    await p.locator("form textarea").fill("Keep this draft when voting");
    await p.getByRole("button",{name:"Upvote · 0",exact:true}).click();
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await p.locator("form textarea").inputValue(),"Keep this draft when voting");
    await p.getByRole("button",{name:"Publish publicly",exact:true}).click();
    await p.waitForFunction(()=>window.topicFixture.publishResolve!==null);
    await p.evaluate(()=>window.dispatchEvent(new CustomEvent("fixture-topic",{detail:"grief"})));
    await p.getByRole("heading",{name:"Grief",exact:true}).waitFor();
    await p.locator("form textarea").fill("New topic draft must survive old response");
    await p.evaluate(()=>window.topicFixture.publishResolve());
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await p.locator("form textarea").inputValue(),"New topic draft must survive old response");
    // Deleting your own public contribution asks in the app's own dialog (UI-SPEC A15).
    const del=p.getByRole("dialog",{name:"Delete this public contribution?",exact:true});
    const deleteCalls=()=>p.evaluate(()=>window.topicFixture.calls.filter(c=>c.name==="delete_community_post"));
    const trigger=p.getByRole("button",{name:"Delete my contribution",exact:true});
    assert.equal(await trigger.count(),1,"only the reader's own contribution offers deletion");
    await trigger.click();await del.waitFor();
    assert.equal(await del.getByText("It is removed for everyone. This cannot be undone.",{exact:true}).count(),1);
    assert.deepEqual(await del.getByRole("button").allInnerTexts(),["Delete contribution","Keep contribution"]);
    await del.getByRole("button",{name:"Keep contribution",exact:true}).click();await del.waitFor({state:"detached"});
    assert.equal((await deleteCalls()).length,0,"Keep contribution deletes nothing");
    assert.equal(await p.evaluate(()=>document.activeElement?.textContent?.trim()),"Delete my contribution","focus returns to the control that opened the dialog");
    await trigger.click();await del.waitFor();await p.keyboard.press("Escape");await del.waitFor({state:"detached"});
    assert.equal((await deleteCalls()).length,0,"Escape deletes nothing");
    await trigger.click();await del.waitFor();await p.mouse.click(4,4);await del.waitFor({state:"detached"});
    assert.equal((await deleteCalls()).length,0,"the backdrop deletes nothing");
    await trigger.click();await del.waitFor();
    await del.getByRole("button",{name:"Delete contribution",exact:true}).click();
    await del.getByRole("button",{name:"Deleting…",exact:true}).waitFor();
    assert.equal(await del.getByRole("button",{name:"Deleting…",exact:true}).getAttribute("aria-disabled"),"true");
    assert.deepEqual((await deleteCalls()).map(c=>c.args),[{post_id:"b0000000-0000-4000-8000-000000000009"}]);
    await p.keyboard.press("Escape");
    assert.equal(await del.count(),1,"the dialog waits for the work to finish");
    await p.evaluate(()=>window.topicFixture.deleteResolve());
    await del.waitFor({state:"detached"});
    assert.equal((await deleteCalls()).length,1);
    assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(consoleWarnings,[]);
  }catch(error){throw new Error(error.message+"\nFixture DOM: "+await p.locator("body").innerText());}finally{await c.close();}
}

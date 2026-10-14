import test from "node:test";
import assert from "node:assert/strict";
import {freshPlatform,loadPlatform,savePlatform,recoverPlatform,scopedStorage,backupData,forgetAccount,V1_KEY,V2_KEY,V3_KEY} from "../src/platform/persistence.ts";
import {blankState} from "../src/storage.ts";
import {findTopic,validTopics,recommendResources,topicGraph} from "../src/topics/graph.ts";
import {safeSourceUrl} from "../src/social/sources.ts";
import {knowledgeFor,assembleGrounding,type KnowledgeRecord} from "../src/bible/knowledge.ts";
import {readFileSync} from "node:fs";
import {prayerTransition} from "../src/platform/models.ts";
import {parseRoute} from "../src/platform/router.ts";
class Memory {
  data=new Map<string,string>();
  getItem(k:string){return this.data.get(k)??null;}
  setItem(k:string,v:string){this.data.set(k,v);}
  get length(){return this.data.size;}
  key(i:number){return [...this.data.keys()][i]??null;}
}
test("v1 and production-shaped v2 migrate to v3, retain originals, and reload idempotently",()=>{
  for(const version of [1,2]) {
    const memory=new Memory();
    const old={...freshPlatform(),version:2,theme:"dark",local:{...blankState(),onboarded:true,installDismissed:true,activePlan:"peace-in-god",journals:{"2026-10-05":"Preserved words"},completedDates:["2026-10-05"],progress:{"peace-in-god":[0,1]}},bookmarks:["/bible/romans/8/28"],highlights:{"/bible/romans/8/28":"sage"},devotionalProgress:{anxiety:[0,1]},notifications:{Replies:true},prayers:[{id:"p",title:"Hope",body:"Private prayer",answer:"Help came",status:"Answered",createdAt:"2026-10-05",updates:[{date:"2026-10-06",body:"Private update"}]}]};
    const raw=JSON.stringify(version===1?old.local:old),key=version===1?V1_KEY:V2_KEY;
    memory.setItem(key,raw);
    const loaded=loadPlatform(memory);
    assert.equal(loaded.blocked,false);assert.equal(loaded.state.version,3);
    assert.equal(loaded.state.local.onboarded,true);assert.equal(loaded.state.local.journals["2026-10-05"],"Preserved words");
    assert.deepEqual(loaded.state.local.progress["peace-in-god"],[0,1]);
    if(version===2){assert.equal(loaded.state.theme,"dark");assert.deepEqual(loaded.state.prayers,old.prayers);assert.deepEqual(loaded.state.bookmarks,old.bookmarks);assert.deepEqual(loaded.state.devotionalProgress,old.devotionalProgress);assert.deepEqual(loaded.state.notifications,old.notifications);}
    assert.equal(memory.getItem(key),raw);assert.deepEqual(loadPlatform(memory).state,loaded.state);
  }
});
test("guest / A / B switches isolate private data, recommendations, backups and offline reload",()=>{
  const memory=new Memory(),guest=scopedStorage(memory,null),a=scopedStorage(memory,"user-a"),b=scopedStorage(memory,"user-b");
  const ga=loadPlatform(guest).state;ga.privateTopics=["grief"];savePlatform(guest,ga);
  assert.deepEqual(loadPlatform(a).state.privateTopics,[]); // no silent guest adoption
  const sa=loadPlatform(a).state;sa.privateTopics=["addiction"];sa.entries=[{id:"a",date:"2026-10-05",type:"free journal",title:"A private",body:"A-only-secret"}];savePlatform(a,sa);
  const sb=loadPlatform(b).state;assert.equal(sb.entries.length,0);assert.deepEqual(sb.privateTopics,[]);
  assert.ok(!backupData(b).includes("A-only-secret"));assert.ok(!JSON.stringify(recommendResources(sb.privateTopics,sb.followedTopics)).includes("addiction"));
  assert.equal(loadPlatform(a).state.entries[0].body,"A-only-secret");assert.deepEqual(loadPlatform(guest).state.privateTopics,["grief"]);
  assert.ok(backupData(a).includes("A-only-secret"));assert.ok(!backupData(a).includes('"grief"'));
});
test("corrupt, unknown, full and unavailable v3 storage never overwrites recoverable sources",()=>{
  for(const raw of ["broken",'{"version":99}']) {
    const memory=new Memory();memory.setItem(V3_KEY,raw);const loaded=loadPlatform(memory);
    assert.equal(loaded.blocked,true);assert.equal(savePlatform(memory,loaded.state,loaded.blocked),false);assert.equal(memory.getItem(V3_KEY),raw);
  }
  const memory=new Memory(),old=JSON.stringify({...freshPlatform(),version:2,entries:[{id:"x",title:"Retain",body:"Recoverable",type:"free journal",date:"2026-10-05"}]});memory.setItem(V2_KEY,old);memory.setItem=()=>{throw Error("full");};
  const loaded=loadPlatform(memory);assert.equal(loaded.blocked,true);assert.equal(loaded.state.entries[0].body,"Recoverable");assert.equal(memory.getItem(V2_KEY),old);
  assert.equal(loadPlatform({getItem(){throw Error("unavailable");},setItem(){throw Error("unavailable");}}).blocked,true);
});
test("canonical topic aliases, invalid IDs and deterministic resource privacy",()=>{
  assert.equal(findTopic("sexual-temptation")?.id,"temptation");assert.equal(findTopic("missing"),undefined);
  assert.deepEqual(validTopics(["sexual-temptation","temptation",null,"missing"]),["temptation"]);
  assert.equal(new Set(topicGraph.map(t=>t.id)).size,topicGraph.length);
  assert.deepEqual(recommendResources(["grief"],[]),recommendResources(["grief"],[]));
  assert.ok(recommendResources(["grief"],[]).every(r=>r.path.startsWith("/bible/")||r.path.startsWith("/grow/")));
});
test("sources reject unsafe protocols, credentials, IP/private hosts, whitespace and backslashes",()=>{
  assert.equal(safeSourceUrl("https://example.org/article"),"https://example.org/article");
  for(const value of ["javascript:alert(1)","data:text/html,hi","http://example.org","https://user:pass@example.org/a","https://127.0.0.1/x","https://localhost/x","https://host.local/x","https://example.org\\@evil.org/x","https://example.org/a\nb"])
    assert.equal(safeSourceUrl(value),null,value);
});
test("knowledge hierarchy prefers specific sourced records and leaves missing coverage unavailable",()=>{
  const base={book:"psalms",text:"Checked observation",source:"WEB Psalm 23",editor:"Test editor",interpretiveStatus:"editorial observation" as const};
  const records:KnowledgeRecord[]=[{...base,id:"book",scope:"book"},{...base,id:"chapter",scope:"chapter",chapter:23},{...base,id:"passage",scope:"passage",chapter:23,start:2,end:4},{...base,id:"verse",scope:"verse",chapter:23,start:3}];
  assert.equal(knowledgeFor("psalms",23,3,records)?.id,"verse");
  assert.equal(knowledgeFor("psalms",23,2,records)?.id,"passage");
  assert.equal(knowledgeFor("psalms",23,1,records)?.id,"chapter");
  assert.equal(knowledgeFor("psalms",24,1,records)?.id,"book");
  assert.equal(knowledgeFor("genesis",1,1,records),undefined);
  const bible=JSON.parse(readFileSync("public/bible/web.json","utf8"));
  const sources=assembleGrounding(bible,"romans",8,28);
  assert.equal(sources[0].authority,"Scripture");assert.match(sources[0].text,/all things work together/);
  assert.equal(sources[1].authority,"Editorial observation");
  assert.deepEqual(assembleGrounding(bible,"unknown",1),[]);
  assert.deepEqual(assembleGrounding(bible,"luke",17,36),[]);
});
test("private challenge/path progress and real testimony relationships reload idempotently",()=>{
  const memory=new Memory();const s=freshPlatform();
  s.joinedChallenges=["seven-days-in-scripture"];s.challengeProgress={"seven-days-in-scripture":[0,0,6,20,99]};s.pathProgress={"return-to-scripture":[0,0,2,99]};
  const id="a0000000-0000-4000-8000-000000000001";
  s.savedDiscussions=[id];s.savedDiscussionTopics={[id]:"grief"};
  const prayer=prayerTransition({id:"private-p",title:"Hope",body:"Do not upload",answer:"",status:"Active",updates:[],createdAt:"2026-10-07"},"Answered","Help came");
  s.prayers=[{...prayer,testimonyIds:[id]}];savePlatform(memory,s);
  const loaded=loadPlatform(memory).state;
  assert.deepEqual(loaded.challengeProgress["seven-days-in-scripture"],[0,6]);assert.deepEqual(loaded.pathProgress["return-to-scripture"],[0,2]);
  assert.equal(loaded.savedDiscussionTopics[id],"grief");assert.deepEqual(loaded.prayers[0].testimonyIds,[id]);assert.ok(loaded.prayers[0].answeredAt);
  assert.deepEqual(loadPlatform(memory).state,loaded);
  loaded.joinedChallenges=[];savePlatform(memory,loaded);assert.deepEqual(loadPlatform(memory).state.challengeProgress["seven-days-in-scripture"],[0,6]);
  assert.equal(parseRoute("/community/grief","?thread="+id).thread,id);assert.equal(parseRoute("/community/grief","?thread=secret").page,"not-found");
});

test("recovery retains corrupt v3 and prefers latest readable v2 over older v1",()=>{
 const memory=new Memory();memory.setItem(V3_KEY,"recoverable-corrupt-source");
 const older={...blankState(),journals:{"2026-10-05":"Older v1"}};memory.setItem(V1_KEY,JSON.stringify(older));
 const newer=freshPlatform();newer.entries=[{id:"newer",type:"free journal",date:"2026-10-05",title:"Later",body:"Latest v2"}];
 memory.setItem(V2_KEY,JSON.stringify({...newer,version:2}));const result=recoverPlatform(memory);
 assert.equal(result.entries[0].body,"Latest v2");assert.ok(backupData(memory).includes("recoverable-corrupt-source"));
 assert.ok(backupData(memory).includes("Older v1"));assert.equal(loadPlatform(memory).state.entries[0].body,"Latest v2");
 const clock=Date.now;try {Date.now=()=>123;
  memory.setItem(V3_KEY,"first-source");recoverPlatform(memory);
  memory.setItem(V3_KEY,"second-source");recoverPlatform(memory);
  const exported=backupData(memory);assert.ok(exported.includes("first-source"));assert.ok(exported.includes("second-source"));
 }finally{Date.now=clock;}
});
test("deleting an account removes only that account's private data from the device",()=>{
  class Removable extends Memory{removeItem(k:string){this.data.delete(k);}}
  const memory=new Removable(),guest=scopedStorage(memory,null),a=scopedStorage(memory,"user-a"),b=scopedStorage(memory,"user-b");
  for(const [storage,body] of [[guest,"guest-note"],[a,"A-only-secret"],[b,"B-only-secret"]] as const){const s=loadPlatform(storage).state;s.entries=[{id:"x",date:"2026-10-14",type:"free journal",title:"Note",body}];savePlatform(storage,s);}
  assert.ok(forgetAccount(memory,"user-a")>0);
  assert.ok(![...memory.data.keys()].some(k=>k.startsWith("hfg-private:user-a:")));
  assert.equal(forgetAccount(memory,"user-a"),0);
  assert.equal(loadPlatform(a).state.entries.length,0);
  assert.equal(loadPlatform(b).state.entries[0].body,"B-only-secret");
  assert.equal(loadPlatform(guest).state.entries[0].body,"guest-note");
  assert.throws(()=>forgetAccount(memory,"../user-b"),/Invalid private profile/);
});

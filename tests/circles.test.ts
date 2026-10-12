import test from "node:test";
import assert from "node:assert/strict";
import {parseRoute} from "../src/platform/router.ts";
import {detectCapabilities} from "../src/platform/capabilities.ts";
test("Circle discovery/detail/thread deep links preserve the Community namespace",()=>{
 assert.equal(parseRoute("/community/circles").page,"circles");
 assert.equal(parseRoute("/community/circles/a-walk").id,"a-walk");
 assert.equal(parseRoute("/community/circles/a-walk","?thread=a0000000-0000-4000-8000-000000000001").thread,"a0000000-0000-4000-8000-000000000001");
 for(const path of ["/community/circles/x","/community/circles/%2Fprivate","/community/circles/UPPER","/community/circles/a-walk/extra"])assert.equal(parseRoute(path).page,"not-found");
 assert.equal(parseRoute("/community/circles/a-walk","?thread=private-text").page,"not-found");
 assert.equal(parseRoute("/community/anxiety").page,"community");
 assert.equal(parseRoute("/bible/romans/8/28","?tab=community").tab,"community");
});
test("Circle configuration never activates future billing/verification capabilities",()=>{
 assert.equal(detectCapabilities(false).circles,false);assert.equal(detectCapabilities(true).circles,true);
 assert.equal(detectCapabilities(true).churchProBilling,false);assert.equal(detectCapabilities(true).trustedContributorVerification,false);
});

import {validCircleResult} from '../src/social/circleContracts.ts';
test('Circle output contracts reject malformed, oversized and unsafe records',()=>{
 for(const name of ['read_circles','read_circle_discussions','read_circle_members','read_circle_reports'] as const){assert.equal(validCircleResult(name,[{}]),false);assert.equal(validCircleResult(name,null),false);assert.equal(validCircleResult(name,[]),true);}
 assert.equal(validCircleResult('read_circles',Array(21).fill({})),false);
 assert.equal(validCircleResult('read_circle_thread',null),true);assert.equal(validCircleResult('read_circle_thread',{}),false);
 assert.equal(validCircleResult('read_own_circle_application',{state:'approved',answer:null}),false);
 assert.equal(validCircleResult('read_own_circle_application',{state:'active',answer:'must be erased'}),false);
 assert.equal(validCircleResult('read_own_circle_application',{state:'pending',answer:'plain text'}),true);
 assert.equal(validCircleResult('create_circle','unverified-success'),false);assert.equal(validCircleResult('close_circle',{}),false);assert.equal(validCircleResult('close_circle',null),true);
 const post={id:'a0000000-0000-4000-8000-000000000001',display_name:'Snapshot',body:'Plain text',post_type:'reflection',created_at:'2026-10-08T00:00:00Z',source_path:null,is_owner:false,score:0,upvotes:0,voted:false,helped:0,reputation:null,replies:0,sources:[]};
 assert.equal(validCircleResult('read_circle_discussions',[post]),true);
 for(const change of [{upvotes:-1},{voted:'false'},{sources:null},{sources:[{title:'Unsafe',url:'javascript:alert(1)'}]}])assert.equal(validCircleResult('read_circle_discussions',[{...post,...change}]),false);
});

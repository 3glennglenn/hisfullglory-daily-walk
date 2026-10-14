import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
// Runs migration 009 against the hosted rls_auto_enable() and its event trigger, which no migration
// creates: the definition below is pg_get_functiondef from project fccwqguqhnbayuowmamy (2026-10-14).
const hosted=`CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') EXECUTE FUNCTION public.rls_auto_enable();`;
let checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;console.log("PASS",label);};
const db=new PGlite();
const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
const migration=readFileSync("supabase/migrations/009_rls_auto_enable_grants.sql","utf8");
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;`);

// A database built only from this repo has no rls_auto_enable(); 009 must not fail there.
await db.exec(migration);
ok((await rows("select to_regprocedure('public.rls_auto_enable()') fn"))[0].fn===null,"009 is a no-op where the function does not exist");

// The hosted order: the function and trigger came first, then the app's schema and migrations.
await db.exec(hosted);
await db.exec(readFileSync("supabase/schema.sql","utf8"));
for(const file of ["001_platform.sql","002_support.sql","003_aggregate_feed.sql","004_qa_guards.sql","005_topic_discussions.sql","006_circles.sql"]) await db.exec(readFileSync("supabase/migrations/"+file,"utf8"));
const canExecute=async role=>(await rows("select has_function_privilege($1,'public.rls_auto_enable()','execute') v",[role]))[0].v;
const aclFor=async grantee=>(await rows("select count(*)::int n from pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.rls_auto_enable()'::regprocedure and a.privilege_type='EXECUTE' and a.grantee=$1",[grantee]))[0].n;
ok(await canExecute("anon")&&await canExecute("authenticated"),"before 009, guests and signed-in users can execute it, as the advisor reports");
await db.exec("set role anon");
await assert.rejects(()=>db.query("select public.rls_auto_enable()"),error=>error.code==="0A000");
await db.exec("reset role");
ok(true,"even then, a direct call only gets 'trigger functions can only be called as triggers'");

const definition=async()=>(await rows("select pg_get_functiondef('public.rls_auto_enable()'::regprocedure) def,prosecdef,proconfig,proowner::regrole::text owner from pg_proc where oid='public.rls_auto_enable()'::regprocedure"))[0];
const otherAcls=async()=>rows("select p.oid::regprocedure::text fn,p.proacl::text acl from pg_proc p where p.pronamespace='public'::regnamespace and p.proname<>'rls_auto_enable' order by 1");
const trigger=async()=>(await rows("select evtevent,evtenabled,evtfoid::regproc::text fn,evttags from pg_event_trigger where evtname='ensure_rls'"))[0];
const before={definition:await definition(),others:await otherAcls(),trigger:await trigger()};
await db.exec(migration);
await db.exec(migration);
ok(true,"009 applies twice without error");

for(const role of ["anon","authenticated","service_role"]) ok(!await canExecute(role),role+" can no longer execute it");
ok(await aclFor(0)===0,"PUBLIC no longer has EXECUTE");
ok(await aclFor((await rows("select proowner from pg_proc where oid='public.rls_auto_enable()'::regprocedure"))[0].proowner)===1,"the owner keeps EXECUTE");
for(const role of ["anon","authenticated"]) {
 await db.exec("set role "+role);
 await assert.rejects(()=>db.query("select public.rls_auto_enable()"),error=>error.code==="42501");
 await db.exec("reset role");
 ok(true,role+" calling it over the API now gets permission denied");
}
assert.deepEqual(await definition(),before.definition);ok(true,"the function's body, SECURITY DEFINER, search_path and owner are unchanged");
assert.deepEqual(await otherAcls(),before.others);ok(true,"no other function's grants changed");
assert.deepEqual(await trigger(),before.trigger);ok(true,"ensure_rls is still enabled on ddl_command_end and calls rls_auto_enable()");

// The trigger still fires, also for a role that has no EXECUTE on the function.
await db.exec("create table public.after_owner(id int)");
await db.exec("create role table_maker;grant create on schema public to table_maker;set role table_maker;create table public.after_maker(id int);create table public.after_maker_as as select 1 id;reset role");
ok(await canExecute("table_maker")===false,"table_maker has no EXECUTE on rls_auto_enable()");
const rls=async name=>(await rows("select relrowsecurity v from pg_class where oid=to_regclass($1)",[name]))[0].v;
ok(await rls("public.after_owner"),"a table the owner creates after 009 gets RLS");
ok(await rls("public.after_maker")&&await rls("public.after_maker_as"),"tables another role creates (CREATE TABLE, CREATE TABLE AS) get RLS");
ok((await rows("select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind in ('r','p') and not relrowsecurity")).length===0,"every table in public has RLS");
await db.close();
console.log(`${checks} rls_auto_enable checks passed`);

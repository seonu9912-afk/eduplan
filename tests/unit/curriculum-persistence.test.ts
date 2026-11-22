import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { recoveryPreviewContext } from "../../src/app/recovery-preview/fixture";
import { evaluateCell, initializeDesign, withTermWeeks, withWeeklyHours } from "../../src/lib/curriculum-design";

// Real PostgreSQL functions, tables, RLS and transactions. Only the Auth service
// bootstrap is emulated. No network, credentials or hosted school data is used.
const db = new PGlite();
const sql = (name: string) => readFileSync(`supabase/migrations/${name}.sql`, "utf8");
const actor="10000000-0000-4000-8000-000000000001";
const workspace="20000000-0000-4000-8000-000000000001";
const planId="30000000-0000-4000-8000-000000000001";
const subject="40000000-0000-4000-8000-000000000001";
const group="50000000-0000-4000-8000-000000000001";
const nextMigration="20261122023852_curriculum_consistent_term_hours";
const cell={subjectId:subject,grade:1,semester:1,weekly:3,manual:0,adjustments:[]};
const doc={format:"eduplan-curriculum-v2",cohortYear:2027,
  weeks:{"2027":{count:16,status:"confirmed"}},
  termWeeks:{"2027:1":{count:17,status:"confirmed"}},cells:[cell]};
async function save(document:unknown,planVersion=1,docVersion=0){
  return db.query<{value:{planVersion:number;documentVersion:number}}>(
    "select public.curriculum_design_save($1,$2,$3,$4::jsonb) as value",
    [planId,planVersion,docVersion,JSON.stringify(document)]);
}
async function hours(){return (await db.query<{hours:number}>("select hours from curriculum_hours where plan_id=$1",[planId])).rows[0]?.hours;}

describe("curriculum PostgreSQL persistence",()=>{
  beforeAll(async()=>{
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema extensions;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;`);
    // pgcrypto is used only by invitation functions, outside these scenarios.
    await db.exec(sql("20261107134127_eduplan_foundation").replace("create extension if not exists pgcrypto with schema extensions;",""));
    for(const migration of ["20261108002808_validate_rpc_payloads","20261108062036_school_levels",
      "20261108104848_lock_school_grade_scope","20261118113000_curriculum_design_documents"])
      await db.exec(sql(migration));
    await db.exec(`insert into auth.users(id,email) values('${actor}','fixture@example.invalid');
      insert into workspaces(id,kind,name,owner_id) values('${workspace}','school','격리 검증 학교','${actor}');
      insert into workspace_members(workspace_id,user_id,role) values('${workspace}','${actor}','admin');
      select set_config('request.jwt.claim.sub','${actor}',false);
      insert into subject_groups(id,workspace_id,name) values('${group}','${workspace}','국어');
      insert into subjects(id,workspace_id,group_id,name) values('${subject}','${workspace}','${group}','국어');
      insert into curriculum_plans(id,workspace_id,cohort_year) values('${planId}','${workspace}',2027);
      select set_config('request.jwt.claim.sub','${actor}',false);
      set role authenticated;
      select public.curriculum_design_acquire('${planId}');`);
  },30000);
  afterAll(()=>db.close());

  it("reproduces the old 51-on-screen / 48-in-storage bug then fixes it without rewriting data",async()=>{
    await save(doc);
    expect(await hours()).toBe(48);
    await db.exec("reset role");
    await db.exec(sql(nextMigration));
    expect(await hours()).toBe(48); // migration itself must not rewrite any school data
    await db.exec("set role authenticated");
    await save(doc,2,1);
    expect(await hours()).toBe(51);
    const saved=await db.query<{document:typeof doc}>("select document from curriculum_design_documents where plan_id=$1",[planId]);
    expect(saved.rows[0].document).toEqual(doc);
  });
  it("rejects stale and null versions atomically",async()=>{
    await expect(save({...doc,cells:[{...cell,weekly:5}]},2,1)).rejects.toThrow();
    await expect(db.query("select public.curriculum_design_save($1,3,null,$2::jsonb)",[planId,JSON.stringify(doc)])).rejects.toThrow();
    expect(await hours()).toBe(51);
  });
  it("validates direct RPC exclusion, choices, weeks and numeric payloads",async()=>{
    for(const bad of [
      {...doc,excludedSubjectIds:[subject]},
      {...doc,termWeeks:{"2027:1":{count:18,status:"confirmed"}}},
      {...doc,cells:[{...cell,weekly:null}]},
      {...doc,cells:[{...cell,manual:null}]},
      {...doc,cells:[{...cell,weekly:101}]},
      {...doc,choiceSets:[{id:"choice",grade:1,semester:1,requiredCount:1,subjectIds:[subject,subject]}]},
    ])await expect(save(bad,3,2)).rejects.toThrow();
    expect(await hours()).toBe(51);
  });
  it("preserves old recurring-decimal weekly values and 16-week documents",async()=>{
    await save({...doc,termWeeks:undefined,cells:[{...cell,weekly:50/17,manual:50-(50/17)*16}]},3,2);
    expect(await hours()).toBe(50);
    await save({...doc,termWeeks:undefined},4,3);
    expect(await hours()).toBe(48);
  });
  it("keeps confirmation snapshots and blocks viewers/expired leases",async()=>{
    await expect(db.query("select public.curriculum_design_confirm_version($1,4,3)",[planId])).rejects.toThrow(/변경/);
    await db.query("select public.curriculum_design_confirm_version($1,5,4)",[planId]);
    await save(doc,5,4);
    const snapshots=await db.query<{hours:{hours:number}[]}>("select hours from curriculum_design_snapshots where plan_id=$1",[planId]);
    expect(snapshots.rows[0].hours[0].hours).toBe(48);
    await db.exec(`reset role; update workspace_members set role='viewer' where workspace_id='${workspace}'; set role authenticated;`);
    await expect(save(doc,6,5)).rejects.toThrow(/권한/);
    await db.exec(`reset role; update workspace_members set role='admin' where workspace_id='${workspace}';
      update curriculum_design_locks set expires_at=now()-interval '1 minute'; set role authenticated;`);
    await expect(save(doc,6,5)).rejects.toThrow(/만료/);
    expect(await hours()).toBe(51);
  });
});

it("keeps a 50-hour legacy value exact when initializing a 17-week term",()=>{
  const c=recoveryPreviewContext(),p=c.plans[0];
  const initial=withTermWeeks(initializeDesign(c,p),p.cohort_year,1,{count:17,status:"confirmed"});
  const existing={...initial,cells:[]};
  const context={...c,hours:[{...c.hours[0],plan_id:p.id,subject_id:c.subjects[0].id,grade:1,semester:1,hours:50}]};
  const reopened=initializeDesign(context,p,existing);
  const target=reopened.cells.find(x=>x.subjectId===c.subjects[0].id&&x.grade===1&&x.semester===1)!;
  expect(evaluateCell(reopened,target).total).toBe(50);
  expect(target.weekly).toBe(2);
  expect(target.manual).toBe(16);
  expect(evaluateCell(withWeeklyHours(reopened,target.subjectId,1,1,3),{...target,weekly:3}).total).toBe(67);
});

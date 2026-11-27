import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveSchoolTask, taskAudience, taskOverdue, taskPlanSources, taskCommandSchema, taskSaveSchema, type SchoolTask } from "../../src/lib/school-tasks";
import type { SchoolPlanPublication } from "../../src/lib/school-publications";

const id = (n: number) => `16800000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [sender, a, b, admin, other, unlinked] = [1, 2, 3, 4, 5, 6].map(id);
const [school, outsideSchool, year, outsideYear, firstClass, secondClass] = [10, 11, 12, 13, 14, 15].map(id);
const [sendTeacher, teacherA, teacherB, teacherOther] = [20, 21, 22, 23].map(id);
const versionOneSource = { id: "published-work", text: "교육과정 자료", date: "2026-12-03", department: "교무부", kind: "업무" };
const taskInput = { kind: "distributed", title: "자료 제출", description: "", department: "교무부",
  due_date: "2026-12-12", due_time: "16:30", resources: [], audience: [] as { teacher_id: string; user_id: string }[] };
const pool = [
  { teacher_id: sendTeacher, user_id: sender }, { teacher_id: teacherA, user_id: a }, { teacher_id: teacherB, user_id: b },
];
const taskMock = {
  id: id(99), title: "최초 업무", source_business_id: versionOneSource.id,
  deadline_from_source: true, due_date: null, due_time: "16:30:00",
} as SchoolTask;

describe("task audiences and published sources", () => {
  it("unions department, homeroom and individual targets and reports deadlines at local time", () => {
    const roster = pool.map((teacher, index) => ({ ...teacher, display_name: String(index),
      department: index < 2 ? "교무부" : "연구부", grade: index === 0 ? null : index }));
    expect(taskAudience(roster, { all: false, homerooms: false, departments: ["교무부"], grades: [1], teachers: [teacherA] })
      .map((row) => row.teacher_id)).toEqual([sendTeacher, teacherA]);
    expect(taskAudience(roster, { all: true, homerooms: true, departments: [], grades: [], teachers: [teacherA] })).toHaveLength(3);
    expect(taskOverdue("2026-11-27", "16:30", "2026-11-27", "16:29")).toBe(false);
    expect(taskOverdue("2026-11-27", "16:30", "2026-11-27", "16:30")).toBe(true);
    expect(taskOverdue("2026-11-27", null, "2026-11-27", "23:59")).toBe(false);
    expect(taskOverdue("2026-11-27", null, "2026-11-28", "00:00")).toBe(true);
  });
  it("follows effective releases and keeps the last published identity and date if the item is removed", () => {
    const releases: SchoolPlanPublication[] = [
      { id: id(32), domain: "plans", starts_on: "2026-03-01", source_version: 1, published_at: "2026-03-01", payload: { business: [versionOneSource] } },
      { id: id(33), domain: "plans", starts_on: "2026-11-27", source_version: 2, published_at: "2026-04-01", payload: { business: [{ ...versionOneSource, text: "변경된 자료", date: "2026-12-04" }] } },
      { id: id(34), domain: "plans", starts_on: "2026-12-06", source_version: 3, published_at: "2026-04-02", payload: { business: [] } },
    ].map((release) => ({
      ...release, domain: "plans", workspace_id: school, academic_year_id: year, published_by: admin, change_note: "",
    }));
    const resolve = (today: string, task = taskMock) => resolveSchoolTask(task, taskPlanSources(releases, 2026, today));
    expect(resolve("2026-11-26")).toMatchObject({ title: "교육과정 자료", dueDate: "2026-12-03", sourceMissing: false });
    expect(resolve("2026-11-27")).toMatchObject({ title: "변경된 자료", dueDate: "2026-12-04", sourceMissing: false });
    expect(resolve("2026-12-07")).toMatchObject({ title: "변경된 자료", dueDate: "2026-12-04", sourceMissing: true });
    expect(resolve("2026-12-07", { ...taskMock, deadline_from_source: false, due_date: "2026-12-30" }).dueDate).toBe("2026-12-30");
  });
});

describe("school task database boundaries", () => {
  const db = new PGlite();
  const q = (sql: string, ...params: unknown[]) => db.query(sql, params);
  const as = (actor: string) => q("select set_config('request.jwt.claim.sub',$1,false)", actor);
  const save = (task: string, version: number, values: unknown, workspace = school, yearId = year) =>
    q("select public.save_school_task($1,$2,$3,$4,$5::jsonb)", workspace, yearId, task, version, JSON.stringify(values));
  const change = (task: string, version: number, command: string, input: unknown = {}, workspace = school) =>
    q("select public.change_school_task($1,$2,$3,$4,$5::jsonb)", workspace, task, version, command, JSON.stringify(input));
  const visible = (task: string) => q("select id from school_tasks where id=$1", task);
  const statuses = (task: string) => q("select teacher_id,completed_at is not null as completed,removed_at is not null as removed from school_task_recipients where task_id=$1 order by teacher_id", task);

  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema extensions; create schema vault;
      create table vault.decrypted_secrets(id uuid,decrypted_secret text);
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function extensions.jsonb_matches_schema(json,jsonb) returns boolean language sql immutable as $$select true$$;
      create function auth.role() returns text language sql stable as $$select 'service_role'::text$$;
      grant usage on schema auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
    `);
    const dir = "supabase/migrations";
    for (const migration of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(`${dir}/${migration}`, "utf8")
        .replace(/create extension if not exists (pgcrypto|pg_jsonschema|pg_net) with schema extensions;/g, "")
        .replace("create extension if not exists pg_cron;", ""));
    }
    for (const user of [sender, a, b, admin, other, unlinked])
      await q("insert into auth.users(id,email) values($1,$2)", user, `${user}@example.invalid`);
    await q("insert into workspaces(id,kind,owner_id,name) values ($1,'school',$2,'가상 A학교'),($3,'school',$4,'가상 B학교')", school, admin, outsideSchool, other);
    await q("insert into schools(id) values($1),($2)", school, outsideSchool);
    await q("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'admin'),($1,$3,'viewer'),($1,$4,'viewer'),($1,$5,'viewer'),($1,$6,'viewer'),($7,$8,'admin')",
      school, admin, sender, a, b, unlinked, outsideSchool, other);
    await as(admin);
    await q("insert into academic_years(id,workspace_id,year) values($1,$2,2026)", year, school);
    await as(other);
    await q("insert into academic_years(id,workspace_id,year) values($1,$2,2026)", outsideYear, outsideSchool);
    await as(admin);
    await q("insert into classes(id,workspace_id,academic_year_id,grade,class_number) values($1,$2,$3,1,1),($4,$2,$3,2,1)", firstClass, school, year, secondClass);
    for (const [teacher, account, name, workspace, yearId, home] of [
      [sendTeacher, sender, "배포 교원", school, year, null], [teacherA, a, "김가상", school, year, firstClass],
      [teacherB, b, "이가상", school, year, secondClass], [teacherOther, other, "타교 교원", outsideSchool, outsideYear, null],
    ]) {
      await as(workspace === school ? admin : other);
      await q("insert into school_teachers(id,workspace_id) values($1,$2)", teacher, workspace);
      await q(`insert into staff_appointments(workspace_id,academic_year_id,teacher_id,user_id,display_name,department,homeroom_class_id,
        employment,status,target_hours,reduction_hours) values($1,$2,$3,$4,$5,'교무부',$6,'정규','재직',20,0)`,
        workspace, yearId, teacher, account, name, home);
    }
    await as(admin);
    await q(`insert into school_plan_publications(workspace_id,academic_year_id,domain,source_version,starts_on,published_by,payload)
      values($1,$2,'plans',1,'2026-03-01',$3,$4::jsonb)`, school, year, admin, JSON.stringify({ business: [versionOneSource] }));
    await db.exec("set role authenticated");
  }, 45_000);
  afterAll(() => db.close());

  it("keeps a personal task private, including from the school administrator", async () => {
    const task = id(50);
    const values = { ...taskInput, kind: "personal", department: "", title: "나만 보는 할 일", due_date: null, due_time: null };
    await as(a);
    await save(task, 0, values);
    expect((await visible(task)).rows).toHaveLength(1);
    await as(admin);
    expect((await visible(task)).rows).toEqual([]);
    await expect(change(task, 1, "complete", { completed: true })).rejects.toMatchObject({ code: "42501" });
    await expect(save(task, 1, values)).rejects.toMatchObject({ code: "42501" });
    await as(other);
    expect((await visible(task)).rows).toEqual([]);
    await as(a);
    await change(task, 1, "complete", { completed: true });
    expect((await q("select completed_at is not null as done from school_tasks where id=$1", task)).rows).toEqual([{ done: true }]);
    await change(task, 2, "complete", { completed: false });
    await change(task, 3, "delete");
    expect((await visible(task)).rows).toEqual([]);
  });

  it("takes a deduplicated recipient snapshot and keeps completion, notice and author controls separate", async () => {
    const task = id(51);
    const values = { ...taskInput, audience: [...pool, pool[1]] };
    await as(unlinked);
    expect((await q("select public.school_task_audience($1,$2)", school, year)).rows).toEqual([{ school_task_audience: [] }]);
    await expect(save(task, 0, values)).rejects.toMatchObject({ code: "42501" });
    await as(admin);
    await expect(save(task, 0, values)).rejects.toMatchObject({ code: "42501" });
    await as(sender);
    await expect(save(task, 0, { ...taskInput, audience: [{ teacher_id: teacherOther, user_id: other }] }))
      .rejects.toMatchObject({ code: "40001" });
    await save(task, 0, values);
    expect((await statuses(task)).rows).toHaveLength(3);
    await as(a);
    expect((await visible(task)).rows).toHaveLength(1);
    await expect(save(task, 1, { ...taskInput, title: "탈취" })).rejects.toMatchObject({ code: "42501" });
    await expect(change(task, 1, "cancel")).rejects.toMatchObject({ code: "42501" });
    await expect(q("update school_task_recipients set completed_at=now() where task_id=$1", task))
      .rejects.toMatchObject({ code: "42501" });
    await q("update operation_notifications set read_at=now() where task_id=$1", task);
    expect((await statuses(task)).rows).toEqual([{ teacher_id: teacherA, completed: false, removed: false }]);
    await change(task, 1, "complete", { completed: true });
    await as(b);
    expect((await statuses(task)).rows).toEqual([{ teacher_id: teacherB, completed: false, removed: false }]);
    await as(admin);
    expect((await visible(task)).rows).toEqual([]);
    expect((await statuses(task)).rows).toEqual([]);
    await as(other);
    expect((await visible(task)).rows).toEqual([]);
    await expect(change(task, 1, "complete", { completed: true }, outsideSchool)).rejects.toMatchObject({ code: "42501" });
    await as(sender);
    await save(task, 1, { ...taskInput, title: "마감 변경한 업무", due_date: "2026-12-21" });
    expect((await statuses(task)).rows).toEqual([
      { teacher_id: sendTeacher, completed: false, removed: false },
      { teacher_id: teacherA, completed: true, removed: false },
      { teacher_id: teacherB, completed: false, removed: false },
    ]);
    await change(task, 2, "cancel");
    await as(a);
    expect((await q("select cancelled_at is not null as cancelled from school_tasks where id=$1", task)).rows).toEqual([{ cancelled: true }]);
    expect((await statuses(task)).rows[0]).toMatchObject({ completed: true });
    expect((await q("select title from operation_notifications where task_id=$1 order by task_version", task)).rows)
      .toEqual([{ title: "새 업무 배포" }, { title: "업무 마감 변경" }, { title: "업무 취소" }]);
  });

  it("prevents duplicate source distribution and supports adding, excluding and explicit redo", async () => {
    const task = id(52);
    const values = { ...taskInput, audience: [pool[1]], source_business_id: versionOneSource.id,
      due_date: null, deadline_from_source: true };
    await as(sender);
    await expect(save(task, 0, { ...values, source_business_id: "unpublished-draft" })).rejects.toMatchObject({ code: "22023" });
    await save(task, 0, values);
    await expect(save(id(53), 0, values)).rejects.toMatchObject({ code: "23505" });
    await as(a);
    await change(task, 1, "complete", { completed: true });
    await as(sender);
    await change(task, 1, "remove", { teacher_id: teacherA });
    await as(a);
    expect((await visible(task)).rows).toEqual([]);
    await as(sender);
    await change(task, 2, "add", { audience: [pool[1], pool[2], pool[1]] });
    expect((await statuses(task)).rows).toEqual([
      { teacher_id: teacherA, completed: true, removed: false }, { teacher_id: teacherB, completed: false, removed: false },
    ]);
    await db.exec("reset role");
    await q("update staff_appointments set department='연구부',homeroom_class_id=null where teacher_id=$1", teacherA);
    await db.exec("set role authenticated");
    expect((await statuses(task)).rows).toHaveLength(2);
    await change(task, 3, "redo", { teacher_id: teacherA });
    await as(a);
    expect((await statuses(task)).rows[0]).toMatchObject({ completed: false });
    await expect(change(task, 3, "complete", { completed: true })).rejects.toMatchObject({ code: "40001" });
  });
});

it("accepts existing PostgreSQL task UUIDs without weakening ownership checks",()=>{
 const legacy="12345678-1234-1234-1234-123456789abc";
 const command={workspace:school,id:legacy,version:1,command:"complete",completed:true};
 expect(taskCommandSchema.safeParse(command).success).toBe(true);
 expect(taskCommandSchema.safeParse({...command,completed:false}).success).toBe(true);
 expect(taskCommandSchema.safeParse({...command,id:"not-a-uuid"}).success).toBe(false);
 expect(taskCommandSchema.safeParse({...command,version:0}).success).toBe(false);
 expect(taskSaveSchema.safeParse({workspace:school,year,id:legacy,version:1,kind:"personal",title:"기존 할 일",description:"",department:"",due_date:null,due_time:null,resources:[],submission_url:null,source_business_id:null,deadline_from_source:false}).success).toBe(true);
});

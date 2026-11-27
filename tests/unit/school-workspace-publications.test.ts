import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { defaultAnnual } from "../../src/lib/academic";

const db = new PGlite();
const admin = "15000000-0000-4000-8000-000000000001";
const teacher = "15000000-0000-4000-8000-000000000002";
const outsider = "15000000-0000-4000-8000-000000000003";
const school = "25000000-0000-4000-8000-000000000001";
const year = "35000000-0000-4000-8000-000000000001";
const oldDoc = { ...defaultAnnual([1, 2, 3]), holidays: { "2026-05-11": "공개 행사일" } };
const newDoc = { ...oldDoc, holidays: { "2026-05-12": "미공개 초안" } };
const query = (sql: string, ...params: unknown[]) => db.query(sql, params);
const act = (user: string) => query("select set_config('request.jwt.claim.sub',$1,false)", user);

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions; create schema vault;
    create table vault.decrypted_secrets(id uuid, decrypted_secret text);
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function extensions.jsonb_matches_schema(json,jsonb) returns boolean language sql immutable as $$ select true $$;
    create function auth.role() returns text language sql stable as $$select 'service_role'::text$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
  `);
  const dir = "supabase/migrations";
  const migrations = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  const migrate = (name: string) => db.exec(readFileSync(`${dir}/${name}`, "utf8")
    .replace(/create extension if not exists (pgcrypto|pg_jsonschema|pg_net) with schema extensions;/g, "")
    .replace("create extension if not exists pg_cron;", ""));
  const reform = migrations.findIndex((name) => name.endsWith("_school_planning_reform.sql"));
  if (reform < 0) throw Error("School planning migration missing");
  for (const name of migrations.slice(0, reform)) await migrate(name);
  await query("insert into auth.users(id,email) values($1,'a@example.invalid'),($2,'b@example.invalid')", admin, teacher);
  await act(admin);
  await query(`insert into curriculum_plans(workspace_id,cohort_year)
    select id,2025 from workspaces where owner_id=$1 and kind='personal'`, admin);
  await act("");
  await query("insert into workspaces(id,kind,owner_id,name) values($1,'school',$2,'검증 중학교')", school, admin);
  await query("insert into schools(id,region) values($1,'서울')", school);
  await query("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'admin'),($1,$3,'viewer')", school, admin, teacher);
  await act(admin);
  await query("insert into academic_years(id,workspace_id,year) values($1,$2,2026)", year, school);
  await query("insert into annual_academic_plans(workspace_id,academic_year_id,document) values($1,$2,$3::jsonb)", school, year, JSON.stringify(oldDoc));
  await act("");
  for (const name of migrations.slice(reform)) await migrate(name);
  await query("insert into auth.users(id,email) values($1,'c@example.invalid')", outsider);
  await db.exec("set role authenticated");
}, 45_000);
afterAll(() => db.close());

it("isolates personal exports and initializes a school year once without touching the active year", async () => {
  await act(outsider);
  expect((await query("select public.personal_archive() bundle")).rows).toEqual([{ bundle: null }]);
  await expect(query("select public.ensure_school_year($1,2026)", school)).rejects.toMatchObject({ code: "42501" });
  await act(admin);
  const archived = await query("select public.personal_archive()->'curriculum_plans'->0->>'cohort_year' cohort");
  expect(archived.rows).toEqual([{ cohort: "2025" }]);
  expect((await query("select kind from workspaces")).rows).toEqual([{ kind: "school" }]);
  const future = await query("select public.ensure_school_year($1,2027)", school);
  expect((await query("select public.ensure_school_year($1,2027)", school)).rows).toEqual(future.rows);
  expect((await query("select version from academic_years where id=$1", year)).rows).toEqual([{ version: 1 }]);
  await expect(query("select public.create_school('검증중학교','서울','중학교')")).rejects.toThrow(/같은 학교명/);
});

it("grants only the assigned duty and keeps draft changes outside the published version", async () => {
  await act(admin);
  await expect(query("select public.publish_school_plan($1,$2,'calendar',1,'2026-03-01','')", school, year))
    .rejects.toMatchObject({ code: "42501" });
  await query("select public.save_planning_permission($1,$2,'calendar',true,0)", school, teacher);
  await act(teacher);
  await query("select public.publish_school_plan($1,$2,'calendar',1,'2026-03-01','공식 계획')", school, year);
  await expect(query("select public.publish_school_plan($1,$2,'plans',1,'2026-03-01','')", school, year))
    .rejects.toMatchObject({ code: "42501" });
  await query("select public.save_annual_plan($1,$2,1,$3::jsonb)", school, year, JSON.stringify(newDoc));
  await act(admin);
  await query("select public.save_planning_permission($1,$2,'calendar',false,1)", school, teacher);
  await act(teacher);
  expect((await query("select version from annual_academic_plans")).rows).toEqual([]);
  const release = await query("select payload->'document'->'holidays' holidays from school_plan_publications");
  expect(release.rows).toEqual([{ holidays: { "2026-05-11": "공개 행사일" } }]);
  await expect(query("select public.read_timetable_document($1,$2)", school, year)).rejects.toThrow();
  await act(outsider);
  expect((await query("select id from school_plan_publications")).rows).toEqual([]);
});

it("keeps scheduled revisions out of the official views and scopes co-authors to their assigned course", async () => {
  const planId = "45000000-0000-4000-8000-000000000001";
  const courseId = "55000000-0000-4000-8000-000000000001";
  const futureYearId = "35000000-0000-4000-8000-000000000002";
  const doc = JSON.stringify({
    lesson_status: "확정", units: [],
    evaluations: [{ semester: 1, mode: "weighted", status: "작성 중", notes: "", items: [] }],
  });
  const { rows: [schedule] } = await db.query<{ starts: string; cohort: number }>(`with d as (
    select (now() at time zone 'Asia/Seoul')::date+7 as date
  ) select to_char(date,'YYYY-MM-DD') starts,extract(year from date-interval '2 months')::int cohort from d`);
  expect(schedule).toBeDefined();
  await act(admin);
  await query("select public.save_planning_permission($1,$2,'curriculum',true,0)", school, admin);
  await db.exec("reset role");
  await query("insert into curriculum_plans(id,workspace_id,cohort_year) values($1,$2,$3)", planId, school, schedule.cohort);
  await query("insert into curriculum_design_documents(plan_id,workspace_id) values($1,$2)", planId, school);
  await query("insert into curriculum_design_snapshots(plan_id,workspace_id,version,document,hours,confirmed_by) values($1,$2,1,'{}','[]',$3)", planId, school, admin);
  await query("insert into academic_years(id,workspace_id,year) values($1,$2,$3) on conflict(workspace_id,year) do nothing", futureYearId, school, schedule.cohort);
  const { rows: [scopedYear] } = await db.query<{ id: string }>("select id from academic_years where workspace_id=$1 and year=$2", [school, schedule.cohort]);
  await act("");
  await query(`insert into teaching_courses(id,workspace_id,academic_year_id,grade,semester,subject_name,teacher_name,visibility,reference_snapshot,owner_id)
    values($1,$2,$3,1,1,'국어','가상 교사','workspace','{}',$4)`, courseId, school, scopedYear.id, admin);
  await query("insert into teaching_plans(course_id,workspace_id,academic_year_id,document) values($1,$2,$3,$4::jsonb)", courseId, school, scopedYear.id, doc);
  await query("select private.teaching_record_revision($1,'계획 확정')", courseId);
  await db.exec("set role authenticated");

  await act(admin);
  await query("select public.publish_curriculum_from($1,1,1,$2,'새 교육과정')", planId, schedule.starts);
  await expect(query("select public.set_teaching_plan_editors($1,1,array[$2]::uuid[])", courseId, outsider))
    .rejects.toMatchObject({ code: "42501" });
  await query("select public.set_teaching_plan_editors($1,1,array[$2]::uuid[])", courseId, teacher);
  await act(teacher);
  expect((await query("select id from teaching_courses where id=$1", courseId)).rows).toEqual([{ id: courseId }]);
  const published = await query("select public.publish_teaching_from($1,2,$2::jsonb,$3,'새 수업계획') version", courseId, doc, schedule.starts);
  expect(published.rows).toEqual([{ version: 3 }]);
  expect((await query("select starts_on::text,change_note from teaching_plan_versions where course_id=$1 and version=3", courseId)).rows)
    .toEqual([{ starts_on: schedule.starts, change_note: "새 수업계획" }]);
  expect((await query("select public.school_teaching_publications($1,$2)->0->>'version' version", school, scopedYear.id)).rows)
    .toEqual([{ version: "1" }]);
  expect((await query("select starts_on from curriculum_design_snapshots where plan_id=$1", planId)).rows)
    .toEqual([{ starts_on: null }]);
  expect((await query("select public.school_curriculum_publications($1)->0->>'change_note' note", school)).rows)
    .toEqual([{ note: "" }]);
  await act(outsider);
  await expect(query("select public.publish_teaching_from($1,3,$2::jsonb,$3,'')", courseId, doc, schedule.starts))
    .rejects.toMatchObject({ code: "42501" });
});

it("isolates school-wide links and restricts edits to school admins", async () => {
  await act(admin);
  const { rows: [link] } = await db.query<{ id: string }>(`insert into school_links(workspace_id,name,url,category,icon)
    values($1,'양식 모음','https://docs.google.com/document/d/123','documents','folder') returning id`, [school]);
  await expect(query("update school_links set url='javascript:alert(1)' where id=$1", link.id))
    .rejects.toMatchObject({ code: "23514" });
  await query("select public.ensure_school_year($1,2028)", school);
  await act(teacher);
  expect((await query("select name from school_links")).rows).toEqual([{ name: "양식 모음" }]);
  expect((await query("update school_links set name='다른 이름' where id=$1 returning id", link.id)).rows).toEqual([]);
  expect((await query("delete from school_links where id=$1 returning id", link.id)).rows).toEqual([]);
  await expect(query("insert into school_links(workspace_id,name,url,category,icon) values($1,'금지','https://example.com','common','link')", school))
    .rejects.toMatchObject({ code: "42501" });
  await act(outsider);
  expect((await query("select name from school_links")).rows).toEqual([]);
  await act(admin);
  await query("update school_links set position=2, name='공동 양식' where id=$1", link.id);
  expect((await query("select name,position from school_links")).rows).toEqual([{ name: "공동 양식", position: 2 }]);
  await query("delete from school_links where id=$1", link.id);
  expect((await query("select name from school_links")).rows).toEqual([]);
});

it("publishes resource links through existing calendar and work plan versioning", async () => {
  await act(admin);
  await query("select public.save_planning_permission($1,$2,'calendar',true,0)", school, admin);
  await query("select public.save_planning_permission($1,$2,'plans',true,0)", school, admin);
  const eventId = "45000000-0000-4000-8000-000000000098";
  const resources = [{ name: "참가 양식", url: "https://docs.google.com/spreadsheets/d/example" }];
  const change = { kind: "event", id: eventId, version: 0, beforeAllocations: [], allocations: [],
    value: { title: "학교 행사", start_date: "2026-08-20", end_date: "2026-08-20", event_type: "school",
      target_grades: [1, 2], target_class_ids: [], department: "교무부", description: "", activity_area: "없음", resources } };
  const invalid = { ...change, value: { ...change.value, resources: [{ name: "금지", url: "data:text/html,test" }] } };
  const commit = (value: unknown) => query("select public.save_calendar_changes($1,$2,$3::jsonb,$4::jsonb) saved",
    school, year, JSON.stringify([value]), JSON.stringify(oldDoc));
  await expect(commit(invalid)).rejects.toMatchObject({ code: "23514" });
  expect((await query("select id from events where id=$1", eventId)).rows).toEqual([]);
  expect((await commit(change)).rows[0]).toMatchObject({ saved: { ok: true } });

  // Legacy callers can update an event without providing resource fields.
  const { resources: ignored, ...legacy } = change.value;
  expect(ignored).toEqual(resources);
  expect((await commit({ ...change, version: 1, value: { ...legacy, title: "수정한 행사" } })).rows[0])
    .toMatchObject({ saved: { ok: true } });
  expect((await query("select resources from events where id=$1", eventId)).rows).toEqual([{ resources }]);

  const { rows: [plan] } = await db.query<{ version: number; document: typeof oldDoc }>(
    "select version,document from annual_academic_plans where academic_year_id=$1", [year],
  );
  await query("select public.publish_school_plan($1,$2,'calendar',$3,'2026-08-01','행사 자료 공개')", school, year, plan.version);
  await query("select public.save_annual_plan($1,$2,$3,$4::jsonb)", school, year, plan.version, JSON.stringify({
    ...plan.document, business: [{ id: "task", date: "2026-08-20", department: "교무부",
      kind: "업무", text: "자료 취합", resources }],
  }));
  await query("select public.publish_school_plan($1,$2,'plans',$3,'2026-08-01','업무 자료 공개')", school, year, plan.version + 1);
  await act(teacher);
  expect((await query("select resources from events where id=$1", eventId)).rows).toEqual([]);
  expect((await query(`select payload->'events'->0->'resources' resources from school_plan_publications
    where domain='calendar' and starts_on='2026-08-01'`)).rows).toEqual([{ resources }]);
  expect((await query("select payload->'business'->0->'resources' resources from school_plan_publications where domain='plans'")).rows)
    .toEqual([{ resources }]);
});

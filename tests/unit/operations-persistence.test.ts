import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const id = (n: number) =>
  `a2400000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  viewer = id(2),
  editor = id(3),
  workspace = id(10),
  other = id(11),
  year = id(20),
  otherYear = id(21),
  subject = id(30),
  otherSubject = id(31),
  group = id(40),
  classId = id(50);
const sql = (name: string) =>
  readFileSync(`supabase/migrations/${name}.sql`, "utf8");
const payload = {
  display_name: "가입 전 교원",
  user_id: null,
  subject_ids: [subject],
  primary_subject_id: subject,
  department: "교육과정부",
  duties: "교과 대표",
  homeroom_class_id: classId,
  employment: "기간제",
  status: "배치 예정",
  target_hours: 18,
  reduction_hours: 2,
};
const doc = {
  year: 2027,
  status: "draft",
  classes: [{ id: classId, label: "1학년 1반", grade: 1 }],
  subjects: [{ id: subject, label: "국어", kind: "subject" }],
  teachers: [{ id: admin, label: "교사" }],
  groups: [],
  rooms: [],
  dayRules: [],
  overrides: [],
  weekly: [
    {
      id: "slot",
      scope: "class",
      scopeId: classId,
      weekday: 1,
      period: 1,
      subjectId: subject,
      teacherId: admin,
      room: "",
    },
  ],
  timetableConfig: {
    periods: { "1": 6 },
    lessons: [],
    unavailable: [],
    bell: [{ type: "lesson", period: 1, start: "09:00", end: "09:45" }],
  },
};
async function actor(user: string) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
}
async function saveStaff(
  value: unknown,
  record: string | null = null,
  version: number | null = 0,
) {
  return (
    await db.query<{ value: { id: string; version: number } }>(
      "select public.save_staff_appointment($1,$2,$3,$4,$5::jsonb) value",
      [workspace, year, record, version, JSON.stringify(value)],
    )
  ).rows[0].value;
}
async function saveTable(value: unknown, version: number) {
  await db.query("select public.save_timetable_document($1,$2,$3,$4::jsonb)", [
    workspace,
    year,
    version,
    JSON.stringify(value),
  ]);
}
describe("operations PostgreSQL permissions, versions and immutable records", () => {
  beforeAll(async () => {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema extensions;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(
      sql("20261107134127_eduplan_foundation").replace(
        "create extension if not exists pgcrypto with schema extensions;",
        "",
      ),
    );
    await db.exec(sql("20261118090000_timetable_workspace_documents"));
    await db.exec(sql("20261124031226_workspace_operations"));
    await db.exec(`insert into auth.users(id,email) values('${admin}','admin@example.invalid'),('${viewer}','viewer@example.invalid'),('${editor}','editor@example.invalid');
   insert into workspaces(id,kind,name,owner_id) values('${workspace}','school','실습학교','${admin}'),('${other}','school','다른학교','${admin}');
   insert into workspace_members(workspace_id,user_id,role) values('${workspace}','${admin}','admin'),('${workspace}','${viewer}','viewer'),('${workspace}','${editor}','editor');
   insert into academic_years(id,workspace_id,year) values('${year}','${workspace}',2027),('${otherYear}','${other}',2027);
   insert into subject_groups(id,workspace_id,name) values('${group}','${workspace}','국어'),('${id(41)}','${other}','국어');
   insert into subjects(id,workspace_id,group_id,name) values('${subject}','${workspace}','${group}','국어'),('${otherSubject}','${other}','${id(41)}','국어');
   insert into classes(id,workspace_id,academic_year_id,grade,class_number) values('${classId}','${workspace}','${year}',1,1);
   set role authenticated;`);
    await actor(admin);
  }, 30000);
  afterAll(() => db.close());
  let appointment: string;
  it("registers without an account; administrator links later without changing identity", async () => {
    const saved = await saveStaff(payload);
    appointment = saved.id;
    expect(saved.version).toBe(1);
    const linked = await saveStaff(
      { ...payload, user_id: viewer },
      appointment,
      1,
    );
    expect(linked.id).toBe(appointment);
    expect(linked.version).toBe(2);
    expect(
      (
        await db.query(
          "select * from staff_appointment_history where appointment_id=$1",
          [appointment],
        )
      ).rows,
    ).toHaveLength(2);
  });
  it("rejects stale/null versions and cross-school references with no changes", async () => {
    await expect(
      saveStaff({ ...payload, display_name: "덮어쓰기" }, appointment, 1),
    ).rejects.toThrow(/변경/);
    await expect(saveStaff(payload, appointment, null)).rejects.toThrow();
    await expect(
      saveStaff({
        ...payload,
        subject_ids: [otherSubject],
        primary_subject_id: otherSubject,
      }),
    ).rejects.toThrow();
    const rows = await db.query<{ display_name: string }>(
      "select display_name from staff_appointments where id=$1",
      [appointment],
    );
    expect(rows.rows[0].display_name).toBe("가입 전 교원");
  });
  it("limits employment data and mutation to authorized staff, and directory strips workload", async () => {
    await actor(viewer);
    await expect(saveStaff(payload)).rejects.toThrow(/관리자/);
    expect(
      (await db.query("select * from staff_appointments")).rows,
    ).toHaveLength(1); // own row
    const directory = (
      await db.query<{ value: Record<string, unknown>[] }>(
        "select public.staff_directory($1,$2) value",
        [workspace, year],
      )
    ).rows[0].value;
    expect(directory[0]).not.toHaveProperty("target_hours");
    expect(directory[0]).not.toHaveProperty("status");
    await expect(
      db.query("select public.staff_directory($1,$2)", [other, otherYear]),
    ).rejects.toThrow();
    await actor(editor);
    await expect(saveStaff(payload)).rejects.toThrow(/관리자/);
    await actor(admin);
  });
  it("keeps published versions and queues private inbox notifications once per version", async () => {
    await saveTable(doc, 0);
    await db.query("select public.publish_timetable($1,$2,1)", [
      workspace,
      year,
    ]);
    await db.query("select public.publish_timetable($1,$2,1)", [
      workspace,
      year,
    ]);
    expect(
      (await db.query("select * from timetable_publications")).rows,
    ).toHaveLength(1);
    const changed = { ...doc, weekly: [{ ...doc.weekly[0], room: "도서실" }] };
    await saveTable(changed, 1);
    await expect(
      db.query("select public.publish_timetable($1,$2,1)", [workspace, year]),
    ).rejects.toThrow(/변경/);
    await db.query("select public.publish_timetable($1,$2,2)", [
      workspace,
      year,
    ]);
    const publications = await db.query<{ document: typeof doc }>(
      "select document from timetable_publications order by source_version",
    );
    expect(publications.rows[0].document.weekly[0].room).toBe("");
    await actor(viewer);
    const inbox = await db.query<{ user_id: string }>(
      "select * from operation_notifications",
    );
    expect(inbox.rows).toHaveLength(2);
    expect(inbox.rows.every((x) => x.user_id === viewer)).toBe(true);
    await expect(
      db.query("update operation_notifications set body='위조'"),
    ).rejects.toThrow();
    await expect(
      db.query("select public.publish_timetable($1,$2,2)", [workspace, year]),
    ).rejects.toThrow(/권한/);
    await actor(admin);
  });
  it("rejects direct RPC publication of collisions and prevents snapshot overwrites", async () => {
    await saveTable(
      { ...doc, weekly: [doc.weekly[0], { ...doc.weekly[0], id: "overlap" }] },
      2,
    );
    await expect(
      db.query("select public.publish_timetable($1,$2,3)", [workspace, year]),
    ).rejects.toThrow(/중복/);
    await expect(
      db.query("update timetable_publications set document='{}'"),
    ).rejects.toThrow();
    expect(
      (await db.query("select * from timetable_publications")).rows,
    ).toHaveLength(2);
  });
  it("enforces scenario ownership and immutable snapshots", async () => {
    await db.query(
      "insert into staffing_scenarios(workspace_id,academic_year_id,name,document,created_by) values($1,$2,'안1','{}',$3)",
      [workspace, year, admin],
    );
    await expect(
      db.query("update staffing_scenarios set document='{}'"),
    ).rejects.toThrow();
    await actor(viewer);
    expect(
      (await db.query("select * from staffing_scenarios")).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "insert into staffing_scenarios(workspace_id,academic_year_id,name,document,created_by) values($1,$2,'권한없음','{}',$3)",
        [workspace, year, viewer],
      ),
    ).rejects.toThrow();
    await actor(admin);
  });
  it("validates direct publications with missing fields, dated collisions and account aliases", async () => {
    let version = 3;
    const secondClass = { ...doc.classes[0], id: id(51), label: "1학년 2반" };
    const withClasses = { ...doc, classes: [...doc.classes, secondClass] };
    const invalids = [
      { ...doc, weekly: [{ ...doc.weekly[0], weekday: null }] },
      {
        ...withClasses,
        overrides: [
          {
            date: "2027-03-08",
            scope: "class",
            scopeId: secondClass.id,
            period: 1,
            action: "replace",
            subjectId: subject,
            teacherId: admin,
            room: "",
          },
        ],
      },
      {
        ...doc,
        timetableConfig: {
          ...doc.timetableConfig,
          bell: [
            ...doc.timetableConfig.bell,
            { type: "lesson", period: 2, start: "09:30", end: "10:15" },
          ],
        },
      },
      {
        ...withClasses,
        teachers: [
          ...doc.teachers,
          { id: viewer, label: "연결 계정" },
          { id: appointment, label: "명부 교원" },
        ],
        weekly: [
          { ...doc.weekly[0], teacherId: viewer },
          {
            ...doc.weekly[0],
            id: "linked",
            scopeId: secondClass.id,
            teacherId: appointment,
          },
        ],
      },
    ];
    for (const value of invalids) {
      await saveTable(value, version++);
      await expect(
        db.query("select public.publish_timetable($1,$2,$3)", [
          workspace,
          year,
          version,
        ]),
      ).rejects.toThrow();
    }
    const valid = {
      ...doc,
      overrides: [
        {
          date: "2027-03-08",
          scope: "class",
          scopeId: classId,
          period: 1,
          action: "replace",
          subjectId: subject,
          teacherId: admin,
          room: "도서실",
        },
      ],
    };
    await saveTable(valid, version++);
    await db.query("select public.publish_timetable($1,$2,$3)", [
      workspace,
      year,
      version,
    ]);
    const snapshots = await db.query("select * from timetable_publications");
    expect(snapshots.rows).toHaveLength(3);
  });
});

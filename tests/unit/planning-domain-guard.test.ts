import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const workspace = "20000000-0000-4000-8000-000000000001";

beforeAll(async () => {
  await db.exec(`
    create schema auth;
    create schema private;
    create function auth.uid() returns uuid language sql stable as
      $$ select '10000000-0000-4000-8000-000000000001'::uuid $$;
    create function private.can_plan(uuid, text) returns boolean language sql stable as
      $$ select $2 = any(string_to_array(current_setting('test.planning_areas'), ',')) $$;
    create table public.subject_groups(workspace_id uuid, name text);
    create table public.annual_academic_plans(
      workspace_id uuid, document jsonb, calendar_confirmation jsonb
    );
  `);
  await db.exec(readFileSync(
    "supabase/migrations/20261126140642_guard_calendar_fields_by_table.sql",
    "utf8",
  ));
  await db.exec(`
    create trigger planning_domain before insert or update or delete on public.subject_groups
      for each row execute function private.guard_planning_domain('curriculum');
    create trigger planning_domain before insert or update or delete on public.annual_academic_plans
      for each row execute function private.guard_planning_domain('calendar');
  `);
}, 30_000);

afterAll(() => db.close());

it("checks non-calendar writes without reading calendar fields", async () => {
  await db.exec("set test.planning_areas = 'curriculum'");
  await db.query("insert into subject_groups values ($1, '국어')", [workspace]);
  await db.exec("update subject_groups set name = '언어'");
  expect((await db.query("select name from subject_groups")).rows).toEqual([
    { name: "언어" },
  ]);
  await db.exec("set test.planning_areas = 'plans'");
  await expect(db.exec("delete from subject_groups")).rejects.toMatchObject({
    code: "42501",
  });
});

it("permits business edits without granting calendar or confirmation edits", async () => {
  await db.exec("set test.planning_areas = 'plans'");
  await db.query("insert into annual_academic_plans values ($1, '{}', null)", [
    workspace,
  ]);
  await db.exec(`update annual_academic_plans set document = '{"business":[]}'`);
  await expect(db.exec(
    `update annual_academic_plans set document = '{"days":[]}'`,
  )).rejects.toMatchObject({ code: "42501" });
  await expect(db.exec(
    `update annual_academic_plans set calendar_confirmation = '{"status":"confirmed"}'`,
  )).rejects.toMatchObject({ code: "42501" });
  await db.exec("set test.planning_areas = 'calendar'");
  await db.exec(`update annual_academic_plans set document = '{"days":[]}'`);
});

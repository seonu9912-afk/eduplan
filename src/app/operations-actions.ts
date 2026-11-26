"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/domain";
import {
  staffInputSchema,
  scenarioSchema,
  staffingReport,
  type StaffAppointment,
  type StaffingScenario,
} from "@/lib/staffing";
import { getWorkspaceContext } from "@/lib/data";
import { getOperationsData } from "@/lib/operations-data";
import { timetableDocumentSchema } from "@/lib/timetable-bridge";
import { timetableIssues } from "@/lib/school-operations";
import type { Json } from "@/lib/database.types";
import type { Result } from "@/lib/models";

const scopeSchema = z.object({ workspaceId: uuid, yearId: uuid });
async function authorized(workspaceId: string, roles: string[]) {
  const db = await createClient(),
    { data, error } = await db.auth.getUser();
  if (error || !data.user) throw Error("로그인이 만료되었습니다.");
  const member = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (member.error || !member.data || !roles.includes(member.data.role))
    throw Error("이 작업에 대한 학교 권한이 없습니다.");
  return { db, user: data.user };
}
async function run<T>(f: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await f();
    revalidatePath("/app", "layout");
    return { ok: true, data };
  } catch (e) {
    const v = e as { code?: string; message?: string };
    return {
      ok: false,
      error:
        e instanceof z.ZodError
          ? e.issues[0].message
          : v.code === "23505"
            ? "이미 연결된 계정 또는 자료입니다."
            : v.message && /[가-힣]/.test(v.message)
              ? v.message
              : "저장하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.",
    };
  }
}
export async function saveStaff(
  input: unknown,
): Promise<Result<StaffAppointment>> {
  return run(async () => {
    const v = scopeSchema
      .extend({
        id: uuid.nullable(),
        version: z.number().int().nonnegative(),
        staff: staffInputSchema,
      })
      .parse(input);
    const { db } = await authorized(v.workspaceId, ["admin"]);
    const result = await db.rpc("save_staff_appointment", {
      target: v.workspaceId,
      year_id: v.yearId,
      appointment_id: v.id as unknown as string,
      expected_version: v.version,
      payload: v.staff,
    });
    if (result.error) throw result.error;
    return result.data as unknown as StaffAppointment;
  });
}
export async function saveStaffingScenario(
  input: unknown,
): Promise<Result<string>> {
  return run(async () => {
    const v = scopeSchema.extend({ scenario: scenarioSchema }).parse(input),
      { db, user } = await authorized(v.workspaceId, ["admin", "editor"]);
    const year = await db
      .from("academic_years")
      .select("year")
      .eq("workspace_id", v.workspaceId)
      .eq("id", v.yearId)
      .single();
    if (year.error) throw year.error;
    const c = await getWorkspaceContext(v.workspaceId, String(year.data.year));
    c.operations = await getOperationsData(c);
    const reports = [1, 2].map((term) => staffingReport(c, term, v.scenario));
    const document = {
      scenario: v.scenario,
      reports,
      sourceVersions: Object.fromEntries(c.plans.map((p) => [p.id, p.version])),
    };
    const result = await db
      .from("staffing_scenarios")
      .insert({
        workspace_id: v.workspaceId,
        academic_year_id: v.yearId,
        name: v.scenario.name,
        created_by: user.id,
        document: JSON.parse(JSON.stringify(document)) as Json,
      })
      .select("id")
      .single();
    if (result.error) throw result.error;
    return result.data.id;
  });
}
export async function publishTimetable(
  input: unknown,
): Promise<Result<string>> {
  return run(async () => {
    const v = scopeSchema
        .extend({
          version: z.number().int().positive(),
          effectiveDate: z.iso.date(),
        })
        .parse(input),
      { db } = await authorized(v.workspaceId, ["admin", "editor"]);
    const saved = await db.rpc("read_timetable_document", {
      target: v.workspaceId,
      year_id: v.yearId,
    });
    if (saved.error) throw saved.error;
    const record = saved.data as unknown as {
      version: number;
      document: unknown;
    } | null;
    if (!record || record.version !== v.version)
      throw Error("시간표가 변경되었습니다. 다시 불러와 확인해 주세요.");
    const issues = timetableIssues(
      timetableDocumentSchema.parse(record.document),
    );
    if (issues.length) throw Error(issues[0]);
    const result = await db.rpc("publish_timetable_from", {
      target: v.workspaceId,
      year_id: v.yearId,
      expected_version: v.version,
      effective_date: v.effectiveDate,
    });
    if (result.error) throw result.error;
    return String((result.data as { id: string }).id);
  });
}
export async function markOperationRead(
  input: unknown,
): Promise<Result<undefined>> {
  return run(async () => {
    const v = z.object({ workspaceId: uuid, id: uuid }).parse(input),
      { db, user } = await authorized(v.workspaceId, [
        "admin",
        "editor",
        "viewer",
      ]);
    const result = await db
      .from("operation_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", v.id)
      .eq("workspace_id", v.workspaceId)
      .eq("user_id", user.id);
    if (result.error) throw result.error;
    return undefined;
  });
}
export async function previousStaff(
  input: unknown,
): Promise<Result<StaffAppointment[]>> {
  return run(async () => {
    const v = scopeSchema.parse(input),
      { db } = await authorized(v.workspaceId, ["admin"]);
    const result = await db
      .from("staff_appointments")
      .select("*")
      .eq("workspace_id", v.workspaceId)
      .eq("academic_year_id", v.yearId)
      .order("display_name");
    if (result.error) throw result.error;
    return result.data;
  });
}
// The UI can preview a scenario without persisting it; this import also documents the action contract.
export type ScenarioInput = StaffingScenario;

/** Re-read official sources immediately before a reminder; editor state is never an alert source. */
export async function currentLessonNotice(
  input: unknown,
): Promise<Result<{ title: string; signature: string } | null>> {
  try {
    const v = z
      .object({
        workspaceId: uuid,
        year: z.number().int().min(2000).max(2100),
        lead: z.number().int().min(0).max(15),
      })
      .parse(input);
    await authorized(v.workspaceId, ["admin", "editor", "viewer"]);
    const c = await getWorkspaceContext(
      v.workspaceId,
      String(v.year),
      "notifications",
    );
    c.operations = await getOperationsData(c, "notifications");
    const { lessonNotice } = await import("@/lib/push-notice");
    return { ok: true, data: lessonNotice(c, v.lead) };
  } catch {
    return {
      ok: false,
      error: "최신 수업 운영 정보를 확인하지 못해 수업 알림을 보류했습니다.",
    };
  }
}

"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  academicSchema,
  schoolTypeSchema,
  eventSchema,
  hourSchema,
  schoolYearSchema,
  uuid,
} from "@/lib/domain";
import { curriculumDraft, curriculumSource } from "@/lib/curriculum-draft";
import type { Result, Role } from "@/lib/models";

function userError(error: unknown): string {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message || "입력값을 확인해 주세요.";
  const e = error as { code?: string; message?: string };
  if (e.code === "23505")
    return "이미 등록된 항목입니다. 이름이나 학년도를 확인해 주세요.";
  if (e.code === "23503")
    return "연결된 자료의 범위를 확인해 주세요. 참조 중인 자료를 삭제하려면 먼저 연결을 해제해야 합니다.";
  if (e.code === "23514") return "입력값이 허용 범위를 벗어났습니다.";
  if (e.code === "42501")
    return "접근 권한이 없습니다. 작업공간과 역할을 확인해 주세요.";
  if (e.code === "invalid_credentials")
    return "이메일 또는 비밀번호를 확인해 주세요.";
  if (e.code === "email_not_confirmed")
    return "이메일 인증 후 로그인해 주세요.";
  if (e.code === "over_email_send_rate_limit")
    return "이메일 전송 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  if (e.message && /[가-힣]/.test(e.message)) return e.message;
  return "요청을 처리하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.";
}
async function run<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return { ok: false, error: userError(error) };
  }
}
async function authenticated() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user)
    throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  return { db, user: data.user };
}
async function authorized(id: string, allowed: Role[] = ["admin", "editor"]) {
  uuid.parse(id);
  const { db, user } = await authenticated();
  const { data, error } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !data || !allowed.includes(data.role as Role))
    throw new Error("이 작업을 수행할 권한이 없습니다.");
  return { db, user };
}
function refresh() {
  revalidatePath("/app", "layout");
}
function siteUrl() {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);
  if (!value) throw new Error("인증 주소 설정이 필요합니다.");
  return value.replace(/\/$/, "");
}
export async function login(input: unknown) {
  return run(async () => {
    const value = z
      .object({
        email: z.email("이메일 형식을 확인해 주세요."),
        password: z.string().min(1),
      })
      .parse(input);
    const db = await createClient();
    const { error } = await db.auth.signInWithPassword(value);
    if (error) throw error;
    refresh();
    return undefined;
  });
}
export async function signup(input: unknown) {
  return run(async () => {
    const value = z
      .object({
        email: z.email(),
        password: z
          .string()
          .min(10, "비밀번호는 10자 이상으로 설정해 주세요.")
          .max(128),
        display_name: z.string().trim().min(1).max(40),
      })
      .parse(input);
    const db = await createClient();
    const { data, error } = await db.auth.signUp({
      email: value.email,
      password: value.password,
      options: {
        data: { display_name: value.display_name },
        emailRedirectTo: `${siteUrl()}/auth/callback`,
      },
    });
    if (error) throw error;
    return { signedIn: !!data.session };
  });
}
export async function logout() {
  return run(async () => {
    const db = await createClient();
    const { error } = await db.auth.signOut();
    if (error) throw error;
    refresh();
  });
}
export async function requestPasswordReset(email: string) {
  return run(async () => {
    z.email().parse(email);
    const db = await createClient();
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
    });
    if (error) throw error;
  });
}
export async function updatePassword(password: string) {
  return run(async () => {
    z.string()
      .min(10, "비밀번호는 10자 이상으로 설정해 주세요.")
      .max(128)
      .parse(password);
    const { db } = await authenticated();
    const { error } = await db.auth.updateUser({ password });
    if (error) throw error;
  });
}
export async function saveProfile(input: unknown) {
  return run(async () => {
    const value = z
      .object({
        display_name: z.string().trim().min(1).max(40),
        default_workspace_id: uuid,
      })
      .parse(input);
    const { db, user } = await authenticated();
    const { error } = await db
      .from("profiles")
      .update(value)
      .eq("id", user.id)
      .select("id")
      .single();
    if (error) throw error;
    refresh();
  });
}
export async function createSchool(input: unknown) {
  return run(async () => {
    const value = z
      .object({
        school_name: z
          .string()
          .trim()
          .min(1, "학교명을 입력해 주세요.")
          .max(80),
        school_region: z.string().trim().max(40),
        school_type: schoolTypeSchema,
      })
      .parse(input);
    const { db } = await authenticated();
    const { data, error } = await db.rpc("create_school", value);
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function saveYear(input: unknown) {
  return run(async () => {
    const value = academicSchema.parse(input);
    const { db } = await authorized(value.target, ["admin"]);
    const { data, error } = await db.rpc("save_academic_year", value);
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function saveEvent(input: unknown) {
  return run(async () => {
    const { id, version, ...value } = eventSchema.parse(input);
    const { db } = await authorized(value.workspace_id);
    const result = id
      ? await db
          .from("events")
          .update(value)
          .eq("id", id)
          .eq("workspace_id", value.workspace_id)
          .eq("version", version ?? -1)
          .select("id")
          .maybeSingle()
      : await db.from("events").insert(value).select("id").single();
    if (result.error) throw result.error;
    if (!result.data)
      throw new Error(
        "일정이 변경되었거나 삭제되었습니다. 새로고침 후 다시 시도해 주세요.",
      );
    refresh();
    return result.data.id;
  });
}
export async function deleteEvent(
  id: string,
  workspaceId: string,
  version: number,
) {
  return run(async () => {
    uuid.parse(id);
    z.number().int().positive().parse(version);
    const { db } = await authorized(workspaceId);
    const { data, error } = await db
      .from("events")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .eq("version", version)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new Error(
        "일정이 변경되었거나 이미 삭제되었습니다. 새로고침해 주세요.",
      );
    refresh();
  });
}
export async function addSubject(input: unknown) {
  return run(async () => {
    const v = z
      .object({
        workspace_id: uuid,
        group_id: uuid,
        name: z.string().trim().min(1).max(60),
      })
      .parse(input);
    const { db } = await authorized(v.workspace_id);
    const { error } = await db.from("subjects").insert(v);
    if (error) throw error;
    refresh();
  });
}
export async function addGroup(workspaceId: string, name: string) {
  return run(async () => {
    z.string().trim().min(1).max(60).parse(name);
    const { db } = await authorized(workspaceId);
    const { error } = await db
      .from("subject_groups")
      .insert({ workspace_id: workspaceId, name: name.trim() });
    if (error) throw error;
    refresh();
  });
}
export async function deleteSubject(input: unknown) {
  return run(async () => {
    const v = z
      .object({
        target: uuid,
        target_subject: uuid,
        expected_plans: z
          .array(z.object({ id: uuid, version: z.number().int().positive() }))
          .max(101),
      })
      .parse(input);
    const { db } = await authorized(v.target);
    const { error } = await db.rpc("delete_subject", v);
    if (error) throw error;
    refresh();
  });
}
export async function createPlan(workspaceId: string, cohortYear: number) {
  return run(async () => {
    schoolYearSchema.parse(cohortYear);
    const { db } = await authorized(workspaceId);
    const { data, error } = await db
      .from("curriculum_plans")
      .insert({ workspace_id: workspaceId, cohort_year: cohortYear })
      .select("id")
      .single();
    if (error) throw error;
    refresh();
    return data.id;
  });
}
export async function saveCurriculum(input: unknown) {
  return run(async () => {
    const v = z
      .object({
        workspaceId: uuid,
        target_plan: uuid,
        expected_version: z.number().int().positive(),
        entries: z
          .array(
            z.object({
              subject_id: uuid,
              grade: z.number().int().min(1).max(6),
              semester: z.number().int().min(1).max(2),
              hours: hourSchema,
            }),
          )
          .max(3600),
      })
      .parse(input);
    const { db } = await authorized(v.workspaceId);
    const { data, error } = await db.rpc("save_curriculum", {
      target_plan: v.target_plan,
      expected_version: v.expected_version,
      entries: v.entries,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function createInvitation(input: unknown) {
  return run(async () => {
    const v = z
      .object({
        target: uuid,
        recipient: z.email(),
        member_role: z.enum(["editor", "viewer"]),
      })
      .parse(input);
    const { db } = await authorized(v.target, ["admin"]);
    const { data, error } = await db.rpc("create_invitation", v);
    if (error) throw error;
    refresh();
    return data as { id: string; token: string };
  });
}
export async function acceptInvitation(token: string) {
  return run(async () => {
    z.string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(token);
    const { db } = await authenticated();
    const { data, error } = await db.rpc("accept_invitation", { token });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function revokeInvitation(workspaceId: string, inviteId: string) {
  return run(async () => {
    uuid.parse(inviteId);
    const { db } = await authorized(workspaceId, ["admin"]);
    const { error } = await db.rpc("revoke_invitation", {
      invite_id: inviteId,
    });
    if (error) throw error;
    refresh();
  });
}
export async function manageMember(
  workspaceId: string,
  memberId: string,
  role: Role | null,
) {
  return run(async () => {
    uuid.parse(memberId);
    z.enum(["admin", "editor", "viewer"]).nullable().parse(role);
    const { db } = await authorized(workspaceId, ["admin"]);
    const { error } = await db.rpc("manage_member", {
      target: workspaceId,
      member_id: memberId,
      new_role: role as string,
    });
    if (error) throw error;
    refresh();
  });
}

export async function setSchoolType(workspaceId: string, schoolType: string) {
  return run(async () => {
    const value = schoolTypeSchema.parse(schoolType);
    const { db } = await authorized(workspaceId, ["admin"]);
    const { error } = await db.rpc("set_school_type", {
      target: workspaceId,
      new_school_type: value,
    });
    if (error) throw error;
    refresh();
  });
}

export async function saveAnnual(input: unknown) {
  return run(async () => {
    const { annualSchema } = await import("@/lib/academic");
    const v = z
      .object({
        workspaceId: uuid,
        yearId: uuid,
        version: z.number().int().min(0),
        document: annualSchema,
      })
      .parse(input);
    const { db } = await authorized(v.workspaceId);
    const { data: year } = await db
      .from("academic_years")
      .select("year")
      .eq("id", v.yearId)
      .eq("workspace_id", v.workspaceId)
      .single();
    if (!year) throw new Error("학년도를 확인해 주세요.");
    const start = `${year.year}-03-01`,
      end = `${year.year + 1}-03-01`;
    const dates = [
      ...Object.keys(v.document.days),
      ...Object.keys(v.document.holidays),
      ...v.document.allocations.map((a) => a.date),
      ...v.document.business.map((a) => a.date),
      ...v.document.vacations.flatMap((a) => [a.start, a.end]),
      ...v.document.recurring.flatMap((a) => a.exclude),
    ];
    if (dates.some((d) => d < start || d >= end))
      throw new Error("모든 날짜를 해당 학년도 안에서 선택해 주세요.");
    const { data, error } = await db.rpc("save_annual_plan", {
      target: v.workspaceId,
      year_id: v.yearId,
      expected_version: v.version,
      payload: v.document,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function previewHolidays(workspaceId: string, year: number) {
  return run(async () => {
    await authorized(workspaceId);
    schoolYearSchema.parse(year);
    const { getHolidays } = await import("@/lib/public-data");
    const { academicHolidayImport } = await import("@/lib/academic");
    const responses = await Promise.all([year, year + 1].map(getHolidays));
    return { ...academicHolidayImport(year, responses), responses };
  });
}
export async function previewWeather(workspaceId: string, settings: unknown) {
  return run(async () => {
    await authorized(workspaceId, ["admin", "editor", "viewer"]);
    const { annualSchema } = await import("@/lib/academic");
    const v = annualSchema.shape.weather.parse(settings);
    const { getForecast } = await import("@/lib/public-data");
    return await getForecast(v.nx, v.ny, v.landCode, v.tempCode);
  });
}

export async function saveSemesters(input: unknown) {
  return run(async () => {
    const value = academicSchema.parse(input);
    const { db } = await authorized(value.target);
    const { data: year, error: readError } = await db
      .from("academic_years")
      .select("id")
      .eq("workspace_id", value.target)
      .eq("year", value.school_year)
      .single();
    if (readError) throw readError;
    const { data, error } = await db.rpc("save_semesters", {
      target: value.target,
      year_id: year.id,
      expected_version: value.expected_version,
      terms: value.terms,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function createCurriculumDraft(
  workspaceId: string,
  cohort: number,
  vocational: boolean,
) {
  return run(async () => {
    schoolYearSchema.parse(cohort);
    z.boolean().parse(vocational);
    const { db } = await authorized(workspaceId);
    const { data: w, error: readError } = await db
      .from("workspaces")
      .select("school_type")
      .eq("id", workspaceId)
      .single();
    if (readError) throw readError;
    const type = schoolTypeSchema.parse(w.school_type),
      draft = curriculumDraft(type, vocational);
    if (cohort < draft.minCohort)
      throw new Error("총론의 시행 시점에 맞는 입학년도를 선택해 주세요.");
    const { data, error } = await db.rpc("create_curriculum_draft", {
      target: workspaceId,
      cohort,
      draft_rows: draft.rows,
      draft_unit: draft.unit === "학점" ? "credits" : "hours",
      draft_source: `${curriculumSource} ${draft.page}쪽${type === "고등학교" ? (vocational ? " 특성화고 기준" : " 일반고 기준") : ""}`,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}

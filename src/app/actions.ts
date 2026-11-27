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
import {
  middleRevisionForCohort,
  middleCurriculumCatalog,
  type MiddleRevision,
} from "@/lib/middle-curriculum";
import { subjectIsUsedInDesign } from "@/lib/curriculum-subject-removal";
import type { Result, Role } from "@/lib/models";
import { requirePlanPermission } from "@/lib/plan-permissions.server";
import type { PlanningDomain } from "@/lib/planning-completion";
import { neisSchoolCode, schoolLinkFields, weatherGrid } from "@/lib/external-links";
import { findNeisSchools, readNeisSchool } from "@/lib/neis";
import { schoolLocationKey } from "@/lib/school-location";

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
async function authorized(id: string, allowed: Role[] | PlanningDomain = "curriculum") {
  uuid.parse(id);
  const { db, user } = await authenticated();
  const { data, error } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !data || (Array.isArray(allowed) && !allowed.includes(data.role as Role)))
    throw new Error("이 작업을 수행할 권한이 없습니다.");
  if (typeof allowed === "string") await requirePlanPermission(db, id, allowed);
  return { db, user };
}
function refresh() {
  revalidatePath("/app", "layout");
}
function siteUrl() {
  const deploymentHost =
    process.env.VERCEL_ENV === "preview"
      ? process.env.VERCEL_URL
      : process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const value =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (deploymentHost ? `https://${deploymentHost}` : undefined);
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
export async function logout(
  deviceId: string | null = null,
  endpoint: string | null = null,
) {
  return run(async () => {
    const db = await createClient();
    if (deviceId) z.uuid().parse(deviceId);
    if (endpoint) z.url().max(2048).parse(endpoint);
    if (deviceId || endpoint) {
      const disconnected = await db.rpc("disconnect_push_device", {
        device: deviceId,
        endpoint_value: endpoint,
      });
      if (disconnected.error)
        throw Error(
          "기기 알림 연결을 해제하지 못했습니다. 연결 상태를 확인한 후 다시 로그아웃하세요.",
        );
    }
    const { error } = await db.auth.signOut({ scope: "local" });
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
        school_region: z.string().trim().min(1, "지역을 입력해 주세요.").max(40),
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
export async function saveSchoolLink(input: unknown) {
  return run(async () => {
    const { workspaceId, id, ...fields } = schoolLinkFields.extend({
      workspaceId: uuid, id: uuid.optional(),
    }).parse(input);
    const { db } = await authorized(workspaceId, ["admin"]);
    const write = id
      ? db.from("school_links").update(fields).eq("workspace_id", workspaceId).eq("id", id)
      : db.from("school_links").insert({ ...fields, workspace_id: workspaceId });
    const result = await write.select("id").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw Error("바로가기가 이미 변경되었거나 삭제되었습니다.");
    refresh();
  });
}
export async function deleteSchoolLink(workspaceId: string, id: string) {
  return run(async () => {
    const { db } = await authorized(workspaceId, ["admin"]);
    const result = await db.from("school_links").delete()
      .eq("workspace_id", workspaceId).eq("id", uuid.parse(id)).select("id").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw Error("바로가기가 이미 삭제되었습니다.");
    refresh();
  });
}
export async function searchNeisSchools(workspaceId: string, query: string) {
  return run(async () => {
    const name = z.string().trim().min(2, "학교명을 두 글자 이상 입력하세요.").max(80).parse(query);
    const { db } = await authorized(workspaceId, ["admin"]);
    const { data, error } = await db.from("schools").select("school_type").eq("id", workspaceId).single();
    if (error) throw error;
    return findNeisSchools(name, data.school_type);
  });
}
export async function connectNeisSchool(input: unknown) {
  return run(async () => {
    const { workspaceId, neis_office_code, neis_school_code } = neisSchoolCode.extend({ workspaceId: uuid }).parse(input);
    const { db } = await authorized(workspaceId, ["admin"]);
    const { data, error } = await db.from("schools").select("*").eq("id", workspaceId).single();
    if (error) throw error;
    const official = await readNeisSchool(neis_office_code, neis_school_code);
    if (!official || official.type !== data.school_type) throw Error("해당 학교급의 나이스 학교정보를 확인하지 못했습니다.");
    let nx: number | null = null, ny: number | null = null;
    if (official.road_address) {
      const index: Record<string, number> = (await import("@/lib/data/school-weather-grid.json")).schools;
      const packed = index[schoolLocationKey(official.name, official.road_address)];
      if (packed) {
        nx = Math.floor(packed / 256);
        ny = packed % 256;
      }
    }
    if (nx === null && data.neis_office_code === neis_office_code && data.neis_school_code === neis_school_code &&
      data.road_address === official.road_address) {
      nx = data.weather_nx;
      ny = data.weather_ny;
    }
    const result = await db.from("schools").update({
      neis_office_code, neis_school_code, road_address: official.road_address,
      homepage_url: official.homepage_url, foundation_day: official.foundation_day,
      weather_nx: nx, weather_ny: ny,
    }).eq("id", workspaceId).eq("school_type", official.type).select("id").single();
    if (result.error) throw result.error;
    refresh();
  });
}
export async function saveSchoolWeatherGrid(input: unknown) {
  return run(async () => {
    const { workspaceId, grid } = z.object({ workspaceId: uuid, grid: weatherGrid.nullable() }).parse(input);
    const { db } = await authorized(workspaceId, ["admin"]);
    const result = await db.from("schools").update(grid ?? { weather_nx: null, weather_ny: null })
      .eq("id", workspaceId).select("id").single();
    if (result.error) throw result.error;
    refresh();
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
    const { db } = await authorized(value.workspace_id, "calendar");
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
    const { db } = await authorized(workspaceId, "calendar");
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
/** Merge national subject/creative defaults into one school's editable catalog.
 * Existing rows and their linked hours are left as-is. No backfilling of hours.
 * The current schema shares subjects across all cohort years, so we only add rows.
 */
async function mergeMiddleCurriculumDefaults(
  db: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  revision: MiddleRevision,
) {
  const { data: groups, error: groupsError } = await db
    .from("subject_groups")
    .select("id,name")
    .eq("workspace_id", workspaceId);
  if (groupsError) throw groupsError;
  const { data: subjects, error: subjectsError } = await db
    .from("subjects")
    .select("group_id,name")
    .eq("workspace_id", workspaceId);
  if (subjectsError) throw subjectsError;
  const knownGroups = [...(groups ?? [])];
  const knownSubjects = [...(subjects ?? [])];
  let addedGroups = 0,
    addedSubjects = 0;
  const catalog = middleCurriculumCatalog(revision);
  for (const template of [...catalog.groups, catalog.creative]) {
    let groupId = knownGroups.find((row) => row.name === template.name)?.id;
    if (!groupId) {
      const { data, error } = await db
        .from("subject_groups")
        .insert({ workspace_id: workspaceId, name: template.name })
        .select("id,name")
        .single();
      if (error) throw error;
      if (!data) throw Error("교과군 추가 결과를 확인하지 못했습니다.");
      groupId = data.id;
      knownGroups.push({ id: data.id, name: data.name });
      addedGroups++;
    }
    const id = groupId;
    const missing = template.subjects.filter(
      (name) =>
        !knownSubjects.some((row) => row.group_id === id && row.name === name),
    );
    if (missing.length) {
      const rows = missing.map((name) => ({
        workspace_id: workspaceId,
        group_id: id,
        name,
      }));
      const { error } = await db.from("subjects").insert(rows);
      if (error) throw error;
      knownSubjects.push(...rows);
      addedSubjects += rows.length;
    }
  }
  return { addedGroups, addedSubjects };
}

export async function importMiddleCurriculumDefaults(input: unknown) {
  return run(async () => {
    const v = z
      .object({
        workspaceId: uuid,
        revision: z.enum(["2015", "2022"]),
      })
      .parse(input);
    const { db } = await authorized(v.workspaceId);
    const { data: workspace, error } = await db
      .from("workspaces")
      .select("school_type")
      .eq("id", v.workspaceId)
      .single();
    if (error) throw error;
    if (workspace.school_type !== "중학교")
      throw Error("중학교 작업공간에서만 기본 편제를 불러올 수 있습니다.");
    const added = await mergeMiddleCurriculumDefaults(
      db,
      v.workspaceId,
      v.revision,
    );
    refresh();
    return added;
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
/**
 * Only remove a subject when it has no instructional hours or teaching links.
 * The legacy delete_subject RPC acts on the whole workspace: never expose it
 * directly for subjects that are actually used in any cohort or saved history.
 */
export async function removeUnusedCurriculumSubject(input: unknown) {
  return run(async () => {
    const v = z.object({ workspaceId: uuid, subjectId: uuid }).parse(input);
    const { db } = await authorized(v.workspaceId);
    const [subject, hours, courses, documents, snapshots, revisions, plans] =
      await Promise.all([
        db
          .from("subjects")
          .select("id,name")
          .eq("workspace_id", v.workspaceId)
          .eq("id", v.subjectId)
          .maybeSingle(),
        db
          .from("curriculum_hours")
          .select("hours")
          .eq("workspace_id", v.workspaceId)
          .eq("subject_id", v.subjectId)
          .gt("hours", 0)
          .limit(1),
        db
          .from("teaching_courses")
          .select("id")
          .eq("workspace_id", v.workspaceId)
          .eq("subject_id", v.subjectId)
          .limit(1),
        db
          .from("curriculum_design_documents")
          .select("document")
          .eq("workspace_id", v.workspaceId),
        db
          .from("curriculum_design_snapshots")
          .select("document")
          .eq("workspace_id", v.workspaceId),
        db
          .from("curriculum_design_revisions")
          .select("document")
          .eq("workspace_id", v.workspaceId),
        db
          .from("curriculum_plans")
          .select("id,version")
          .eq("workspace_id", v.workspaceId),
      ]);
    for (const response of [
      subject,
      hours,
      courses,
      documents,
      snapshots,
      revisions,
      plans,
    ])
      if (response.error) throw response.error;
    if (!subject.data)
      throw Error("과목이 이미 삭제되었거나 찾을 수 없습니다.");
    if (
      hours.data?.length ||
      courses.data?.length ||
      (documents.data ?? []).some((row) =>
        subjectIsUsedInDesign(row.document, v.subjectId),
      ) ||
      (snapshots.data ?? []).some((row) =>
        subjectIsUsedInDesign(row.document, v.subjectId),
      ) ||
      (revisions.data ?? []).some((row) =>
        subjectIsUsedInDesign(row.document, v.subjectId),
      )
    )
      throw Error(
        "이미 시수·선택과목군·수업 계획 또는 확정 이력이 있는 과목입니다. 기존 자료를 보호하기 위해 삭제하지 않았습니다.",
      );
    const expected = (plans.data ?? []).map((row) => ({
      id: row.id,
      version: row.version,
    }));
    const { error } = await db.rpc("delete_subject", {
      target: v.workspaceId,
      target_subject: v.subjectId,
      expected_plans: expected,
    });
    if (error) throw error;
    refresh();
    return { removed: subject.data.name };
  });
}

export async function createPlan(workspaceId: string, cohortYear: number) {
  return run(async () => {
    schoolYearSchema.parse(cohortYear);
    const { db } = await authorized(workspaceId);
    const { data: workspace, error: workspaceError } = await db
      .from("workspaces")
      .select("school_type")
      .eq("id", workspaceId)
      .single();
    if (workspaceError) throw workspaceError;
    if (workspace.school_type === "중학교")
      await mergeMiddleCurriculumDefaults(
        db,
        workspaceId,
        middleRevisionForCohort(cohortYear),
      );
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
    const { annualSchema, defaultAnnual } = await import("@/lib/academic");
    const v = z
      .object({
        workspaceId: uuid,
        yearId: uuid,
        version: z.number().int().min(0),
        document: annualSchema,
        workPlans: z.boolean().default(false),
      })
      .parse(input);
    const { db } = await authorized(
      v.workspaceId,
      v.workPlans ? "plans" : "calendar",
    );
    if (v.workPlans) {
      const existing = await db
        .from("annual_academic_plans")
        .select("document")
        .eq("workspace_id", v.workspaceId)
        .eq("academic_year_id", v.yearId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      const { data: school, error: schoolError } = await db.from("workspaces").select("school_type").eq("id", v.workspaceId).single();
      if (schoolError) throw schoolError;
      const plan = existing.data ? annualSchema.parse(existing.data.document) :
        defaultAnnual(school.school_type === "초등학교" ? [1, 2, 3, 4, 5, 6] : [1, 2, 3]);
      v.document = {
        ...plan,
        business: v.document.business,
        departments: v.document.departments,
        workSettings: v.document.workSettings,
      };
    }
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
export async function confirmAcademicCalendar(input: unknown) {
  return publishSchoolPlan(input, "calendar");
}

export async function publishWorkPlan(input: unknown) {
  return publishSchoolPlan(input, "plans");
}

export async function previousWorkPlan(workspaceId: string, year: number) {
  return run(async () => {
    schoolYearSchema.parse(year);
    const { db } = await authorized(workspaceId, "plans");
    const lookup = await db.from("academic_years").select("id").eq("workspace_id", workspaceId)
      .eq("year", year - 1).maybeSingle();
    if (lookup.error) throw lookup.error;
    if (!lookup.data) return [];
    const plan = await db.from("annual_academic_plans").select("document").eq("workspace_id", workspaceId)
      .eq("academic_year_id", lookup.data.id).maybeSingle();
    if (plan.error) throw plan.error;
    const { annualSchema } = await import("@/lib/academic");
    return plan.data ? annualSchema.parse(plan.data.document).business : [];
  });
}

async function publishSchoolPlan(input: unknown, domain: "calendar" | "plans") {
  return run(async () => {
    const v = z
      .object({
        workspaceId: uuid,
        yearId: uuid,
        version: z.number().int().positive(),
        startsOn: z.iso.date(),
        note: z.string().trim().max(500).default(""),
      })
      .parse(input);
    const { db } = await authorized(v.workspaceId, domain);
    const { data, error } = await db.rpc("publish_school_plan", {
      target: v.workspaceId,
      year_id: v.yearId,
      expected_version: v.version,
      plan_domain: domain,
      effective_date: v.startsOn,
      note: v.note,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}

export async function loadCalendarState(workspaceId: string, yearId: string) {
  return run(async () => {
    uuid.parse(yearId);
    const { db } = await authorized(workspaceId, ["admin", "editor", "viewer"]);
    const results = await Promise.all([
      db
        .from("annual_academic_plans")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("academic_year_id", yearId)
        .maybeSingle(),
      db
        .from("events")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("academic_year_id", yearId)
        .order("start_date"),
      db
        .from("calendar_item_history")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("academic_year_id", yearId)
        .order("id", { ascending: false })
        .limit(200),
    ]);
    for (const result of results) if (result.error) throw result.error;
    return {
      annual: results[0].data,
      events: results[1].data ?? [],
      history: results[2].data ?? [],
    };
  });
}

export async function saveCalendarChanges(input: unknown) {
  return run(async () => {
    const { calendarChangeSchema } = await import("@/lib/academic-calendar");
    const { defaultAnnual } = await import("@/lib/academic");
    const v = z
      .object({
        workspaceId: uuid,
        yearId: uuid,
        changes: z.array(calendarChangeSchema).min(1).max(366),
        operation: z.string().max(40).default("수정"),
      })
      .parse(input);
    const { db } = await authorized(v.workspaceId, "calendar");
    const { data, error } = await db.rpc("save_calendar_changes", {
      target: v.workspaceId,
      year_id: v.yearId,
      changes: v.changes,
      initial_document: defaultAnnual(),
      operation: v.operation,
    });
    if (error) throw error;
    const result =
      data as unknown as import("@/lib/academic-calendar").CalendarSaveResult;
    const state = await loadCalendarState(v.workspaceId, v.yearId);
    if (state.ok) result.state = state.data;
    // A successful commit stays successful even if the refresh connection fails.
    if (result.ok) refresh();
    return result;
  });
}

export async function previewHolidays(workspaceId: string, year: number) {
  return run(async () => {
    await authorized(workspaceId, "calendar");
    schoolYearSchema.parse(year);
    const { getHolidays } = await import("@/lib/public-data");
    const { academicHolidayImport } = await import("@/lib/academic");
    const responses = await Promise.all([year, year + 1].map(getHolidays));
    return { ...academicHolidayImport(year, responses), responses };
  });
}
export async function previewWeather(workspaceId: string, settings: unknown, includeMedium = true) {
  return run(async () => {
    await authorized(workspaceId, ["admin", "editor", "viewer"]);
    const { annualSchema } = await import("@/lib/academic");
    const v = annualSchema.shape.weather.parse(settings);
    const { getForecast } = await import("@/lib/public-data");
    return await getForecast(v.nx, v.ny, v.landCode, v.tempCode, z.boolean().parse(includeMedium));
  });
}

export async function saveSemesters(input: unknown) {
  return run(async () => {
    const value = academicSchema.parse(input);
    const { db } = await authorized(value.target, "calendar");
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

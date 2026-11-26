import "server-only";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/pagination";
import type { Context, Role } from "@/lib/models";
import { managementDomains, publishedSchoolContext } from "@/lib/school-publications";
import {
  academicYearOf,
  addDays,
  seoulToday,
  schoolYearSchema,
  uuid,
  schoolTypeSchema,
  gradesForSchoolType,
} from "@/lib/domain";

export async function session() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { db, user: data.user };
}
export async function getWorkspaceContext(
  workspaceId: string,
  selectedYear?: string,
  section = "full",
  management = section === "full",
): Promise<Context> {
  if (!uuid.safeParse(workspaceId).success) notFound();
  const { db, user } = await session();
  const [workspaceResult, profileResult, membershipResult, yearsResult] =
    await Promise.all([
      db.from("workspaces").select("*").eq("kind", "school").order("created_at"),
      db.from("profiles").select("*").eq("id", user.id).single(),
      db
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle(),
      db
        .from("academic_years")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("year", { ascending: false }),
    ]);
  for (const r of [
    workspaceResult,
    profileResult,
    membershipResult,
    yearsResult,
  ])
    if (r.error)
      throw new Error(
        "작업공간을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
  const workspace = workspaceResult.data!.find((w) => w.id === workspaceId);
  if (!workspace || !membershipResult.data || !profileResult.data) notFound();
  const role = membershipResult.data.role as Role;
  const accessResult = await db.rpc("planning_access", { target: workspaceId });
  if (accessResult.error) throw Error("업무 권한을 불러오지 못했습니다.");
  const access = accessResult.data as Context["access"];
  const domain = managementDomains[section];
  if ((section === "settings" || section === "people") && role !== "admin") notFound();
  if (section === "teachers" && role !== "admin" && !access?.staffing) notFound();
  if (management && domain && role !== "admin" && !access?.[domain]) notFound();
  const draftCalendar = management && (section !== "teaching" || role === "admin" || access?.assessment);
  const schoolType = schoolTypeSchema.parse(workspace.school_type);
  const requested = schoolYearSchema.safeParse(Number(selectedYear ?? academicYearOf(seoulToday())));
  if (!requested.success) notFound();
  const years = yearsResult.data!;
  let year = years.find((y) => y.year === requested.data);
  if (!year) {
    const ensured = await db.rpc("ensure_school_year", { target: workspaceId, school_year: requested.data });
    if (ensured.error) throw Error("선택한 학년도를 열지 못했습니다.");
    const loaded = await db.from("academic_years").select("*").eq("id", ensured.data).single();
    if (loaded.error) throw Error("학년도 설정을 읽지 못했습니다.");
    year = loaded.data;
    years.push(year);
    years.sort((a, b) => b.year - a.year);
  }
  const yearId = year.id;
  const results = await Promise.all([
    db
      .from("semesters")
      .select("*")
      .eq("academic_year_id", yearId)
      .order("number"),
    db
      .from("classes")
      .select("*")
      .eq("academic_year_id", yearId)
      .order("grade")
      .order("class_number"),
    draftCalendar ? readAllRows((from, to) =>
      db.from("events").select("*").eq("workspace_id", workspaceId).eq("academic_year_id", yearId)
        .order("start_date").order("id").range(from, to)
    ) : Promise.resolve({ data: [], error: null }),
    db.from("activity_log").select("*").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }).limit(8),
    db
      .from("subject_groups")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("name"),
    db
      .from("subjects")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("name"),
    management ? db.from("curriculum_plans").select("*").eq("workspace_id", workspaceId)
      .order("cohort_year", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    management ? readAllRows((from, to) =>
          db
            .from("curriculum_hours")
            .select("*")
            .eq("workspace_id", workspaceId)
            .order("plan_id")
            .order("subject_id")
            .order("grade")
            .order("semester")
            .range(from, to),
        ) : Promise.resolve({ data: [], error: null }),
    db.rpc("list_members", { target: workspaceId }),
    role === "admin" && ["full", "people"].includes(section)
      ? db
          .from("invitations")
          .select("id,email,role,expires_at,accepted_at,revoked_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
    draftCalendar ? db
      .from("annual_academic_plans")
      .select("*")
      .eq("academic_year_id", yearId)
      .eq("workspace_id", workspaceId)
      .maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (results.some((r) => r.error))
    throw new Error(
      "자료를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
    );
  const annual = results[10].data;
  if (annual) {
    // Keep normalized days and the document on the same source version.
    const days = await db.rpc("academic_days_document", { target: workspaceId, year_id: yearId });
    const version = await db.from("annual_academic_plans").select("version")
      .eq("workspace_id", workspaceId).eq("academic_year_id", yearId).maybeSingle();
    if (days.error || version.error || version.data?.version !== annual.version)
      throw Error("학사일정이 변경되었습니다. 다시 불러와 주세요.");
    annual.document = {
      ...(annual.document as Record<string, import("./database.types").Json>),
      days: days.data,
    };
  }
  const [completion, publications, curriculum, teaching, archive] = await Promise.all([
    ["full", "calendar", "people"].includes(section)
      ? db.rpc("planning_completion_data", { target: workspaceId, year_id: yearId })
      : Promise.resolve({ data: undefined, error: null }),
    db.from("school_plan_publications").select("*").eq("workspace_id", workspaceId).eq("academic_year_id", yearId),
    section === "curriculum" && !management
      ? db.rpc("school_curriculum_publications", { target: workspaceId })
      : Promise.resolve({ data: undefined, error: null }),
    section === "teaching" && !management
      ? db.rpc("school_teaching_publications", { target: workspaceId, year_id: yearId })
      : Promise.resolve({ data: undefined, error: null }),
    db.rpc("has_personal_archive"),
  ]);
  if (completion.error || publications.error || curriculum.error || teaching.error || archive.error)
    throw Error("업무 자료와 공개 계획을 불러오지 못했습니다.");
  const context: Context = {
    access,
    hasPersonalArchive: !!archive.data,
    completion: completion.data as unknown as Context["completion"],
    schoolPublications: publications.data,
    curriculumPublications: curriculum.data as unknown as Context["curriculumPublications"],
    teachingPublications: teaching.data as unknown as Context["teachingPublications"],
    userId: user.id,
    email: user.email ?? "",
    profile: profileResult.data,
    workspace,
    workspaces: workspaceResult.data!,
    role,
    schoolType,
    grades: gradesForSchoolType(schoolType),
    years,
    year,
    annual,
    semesters: results[0].data!,
    classes: results[1].data!,
    events: results[2].data!,
    activities: results[3].data!,
    groups: results[4].data!,
    subjects: results[5].data!,
    plans: results[6].data!,
    hours: results[7].data!,
    members: results[8].data!,
    invitations: results[9].data!,
  };
  if (draftCalendar) return context;
  const today = seoulToday();
  const date = year.year === academicYearOf(today) ? today : year.year < academicYearOf(today)
    ? addDays(`${year.year + 1}-03-01`, -1) : `${year.year}-03-01`;
  return publishedSchoolContext(context, date);
}

import "server-only";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/pagination";
import type { Context, Role } from "@/lib/models";
import {
  academicYearOf,
  seoulToday,
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
): Promise<Context> {
  if (!uuid.safeParse(workspaceId).success) notFound();
  const { db, user } = await session();
  const [workspaceResult, profileResult, membershipResult, yearsResult] =
    await Promise.all([
      db.from("workspaces").select("*").order("created_at"),
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
  const schoolType = schoolTypeSchema.parse(workspace.school_type);
  const years = yearsResult.data!;
  const year =
    years.find(
      (y) => y.year === Number(selectedYear || academicYearOf(seoulToday())),
    ) ??
    years[0] ??
    null;
  const role = membershipResult.data.role as Role;
  const yearId = year?.id ?? "00000000-0000-0000-0000-000000000000";
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
    readAllRows((from, to) =>
      db
        .from("events")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("academic_year_id", yearId)
        .order("start_date")
        .order("id")
        .range(from, to),
    ),
    db
      .from("activity_log")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(8),
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
    db
      .from("curriculum_plans")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("cohort_year", { ascending: false }),
    ["home", "notifications", "people", "settings", "plans"].includes(section)
      ? Promise.resolve({ data: [], error: null })
      : readAllRows((from, to) =>
          db
            .from("curriculum_hours")
            .select("*")
            .eq("workspace_id", workspaceId)
            .order("plan_id")
            .order("subject_id")
            .order("grade")
            .order("semester")
            .range(from, to),
        ),
    db.rpc("list_members", { target: workspaceId }),
    role === "admin" && ["full", "people"].includes(section)
      ? db
          .from("invitations")
          .select("id,email,role,expires_at,accepted_at,revoked_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("annual_academic_plans")
      .select("*")
      .eq("academic_year_id", yearId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (results.some((r) => r.error))
    throw new Error(
      "자료를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
    );
  // This read is tied to the annual version. Never combine new date rows with an older document.
  const normalizedDays = await db.rpc("academic_days_document", {
    target: workspaceId,
    year_id: yearId,
  });
  const calendarVersion = await db
    .from("annual_academic_plans")
    .select("version")
    .eq("workspace_id", workspaceId)
    .eq("academic_year_id", yearId)
    .maybeSingle();
  if (
    normalizedDays.error ||
    calendarVersion.error ||
    calendarVersion.data?.version !== results[10].data?.version
  )
    throw new Error(
      "학사일정이 변경되었거나 연결 자료를 불러오지 못했습니다. 다시 불러와 주세요.",
    );
  const annual = results[10].data;
  if (annual)
    annual.document = {
      ...(annual.document as Record<string, import("./database.types").Json>),
      days: normalizedDays.data,
    };
  const [access, completion] = await Promise.all([
    db.rpc("planning_access", { target: workspaceId }),
    ["full", "calendar"].includes(section)
      ? db.rpc("planning_completion_data", {
          target: workspaceId,
          year_id: yearId,
        })
      : Promise.resolve({ data: undefined, error: null }),
  ]);
  if (access.error || completion.error)
    throw Error("업무 권한과 교육활동 요청을 불러오지 못했습니다.");
  return {
    access: access.data as Context["access"],
    completion: completion.data as unknown as Context["completion"],
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
    annual: results[10].data,
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
}

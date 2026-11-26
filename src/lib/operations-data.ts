import "server-only";
import { resourcesSchema } from "./planning-resources";
import { createClient } from "./supabase/server";
import { canPlan } from "./planning-completion";
import {
  emptyOperations,
  type OperationsData,
  type TeacherDirectory,
  type ScenarioRecord,
} from "./staffing";
import { timetableDocumentSchema } from "./timetable-bridge";
import type { CurriculumDocument } from "./curriculum-design";
import type { Context } from "./models";

export async function getOperationsData(
  c: Context,
  section = "full",
  management = section === "full" || section === "teachers",
): Promise<OperationsData> {
  if (!c.year) return emptyOperations();
  const db = await createClient(),
    manager =
      canPlan(c, "staffing") &&
      ["full", "teachers", "curriculum"].includes(section),
    editing = management && ["full", "teachers", "timetable", "curriculum"].includes(section),
    timetableEditing = editing && (c.role === "admin" || canPlan(c, "timetable") || canPlan(c, "staffing")),
    yearId = c.year.id,
    workspaceId = c.workspace.id;
  const [
    directory,
    staff,
    designs,
    timetable,
    publications,
    scenarios,
    notifications,
    resources,
    effective,
  ] = await Promise.all([
    db.rpc("staff_directory", { target: workspaceId, year_id: yearId }),
    editing
      ? db
          .from("staff_appointments")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("academic_year_id", yearId)
          .order("display_name")
      : Promise.resolve({ data: [], error: null }),
    editing
      ? db.rpc("workspace_curriculum_documents", { target: workspaceId })
      : Promise.resolve({ data: [], error: null }),
    timetableEditing
      ? db.rpc("read_timetable_document", {
          target: workspaceId,
          year_id: yearId,
        })
      : Promise.resolve({ data: null, error: null }),
    db
      .from("timetable_publications")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("academic_year_id", yearId)
      .order("published_at", { ascending: false })
      .limit(1),
    manager
      ? db
          .from("staffing_scenarios")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("academic_year_id", yearId)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("operation_notifications")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("academic_year_id", yearId)
      .eq("user_id", c.userId)
      .order("created_at", { ascending: false })
      .limit(30),
    db.rpc("planning_resources", { target: workspaceId, year_id: yearId }),
    db.rpc("effective_timetables", { target: workspaceId, year_id: yearId }),
  ]);
  if (
    [
      directory,
      staff,
      designs,
      timetable,
      publications,
      scenarios,
      notifications,
      resources,
      effective,
    ].some((r) => r.error)
  )
    throw Error(
      "학교 운영 연결 자료를 불러오지 못했습니다. 데이터베이스 업데이트와 접근 권한을 확인해 주세요.",
    );
  const saved = timetable.data as unknown as {
    version: number;
    updated_at: string | null;
    document: unknown;
  } | null;
  const resourceData = resourcesSchema.parse(resources.data);
  return {
    effectiveTimetables:
      effective.data as unknown as OperationsData["effectiveTimetables"],
    resources: management ? resourceData : { ...resourceData, links: [], bells: [], applications: [] },
    directory: directory.data as unknown as TeacherDirectory[],
    staff: staff.data ?? [],
    designs: Object.fromEntries(
      (
        (designs.data ?? []) as unknown as {
          plan_id: string;
          document: unknown;
        }[]
      ).map((d) => [d.plan_id, d.document as unknown as CurriculumDocument]),
    ),
    timetable: saved
      ? {
          ...saved,
          document: timetableDocumentSchema.parse(saved.document),
        }
      : null,
    publication: publications.data?.[0] ?? null,
    scenarios: (scenarios.data ?? []) as unknown as ScenarioRecord[],
    notifications: notifications.data ?? [],
  };
}

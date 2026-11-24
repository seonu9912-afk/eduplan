import "server-only";
import { createClient } from "./supabase/server";
import { readAllRows } from "./pagination";
import {
  emptyOperations,
  type OperationsData,
  type TeacherDirectory,
  type ScenarioRecord,
} from "./staffing";
import { timetableDocumentSchema } from "./timetable-bridge";
import type { CurriculumDocument } from "./curriculum-design";
import type { Context } from "./models";

export async function getOperationsData(c: Context): Promise<OperationsData> {
  if (!c.year) return emptyOperations();
  const db = await createClient(),
    manager = c.role !== "viewer",
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
  ] = await Promise.all([
    db.rpc("staff_directory", { target: workspaceId, year_id: yearId }),
    db
      .from("staff_appointments")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("academic_year_id", yearId)
      .order("display_name"),
    readAllRows((from, to) =>
      db
        .from("curriculum_design_documents")
        .select("plan_id,document")
        .eq("workspace_id", workspaceId)
        .order("plan_id")
        .range(from, to),
    ),
    db
      .from("timetable_documents")
      .select("version,document,updated_at")
      .eq("workspace_id", workspaceId)
      .eq("academic_year_id", yearId)
      .maybeSingle(),
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
    ].some((r) => r.error)
  )
    throw Error(
      "학교 운영 연결 자료를 불러오지 못했습니다. 데이터베이스 업데이트와 접근 권한을 확인해 주세요.",
    );
  return {
    directory: directory.data as unknown as TeacherDirectory[],
    staff: staff.data ?? [],
    designs: Object.fromEntries(
      (designs.data ?? []).map((d) => [
        d.plan_id,
        d.document as unknown as CurriculumDocument,
      ]),
    ),
    timetable: timetable.data
      ? {
          ...timetable.data,
          document: timetableDocumentSchema.parse(timetable.data.document),
        }
      : null,
    publication: publications.data?.[0] ?? null,
    scenarios: (scenarios.data ?? []) as unknown as ScenarioRecord[],
    notifications: notifications.data ?? [],
  };
}

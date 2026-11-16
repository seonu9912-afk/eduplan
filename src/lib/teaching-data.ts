import "server-only";
import { session } from "./data";
import { readAllRows } from "./pagination";
import type { TeachingData } from "./models";
export async function getTeachingData(
  workspaceId: string,
  yearId: string,
): Promise<TeachingData> {
  const { db } = await session();
  // A single joined read keeps each course's CAS version, plan and class links
  // in the same database snapshot, including during another teacher's save.
  const courses = await readAllRows((from, to) =>
    db
      .from("teaching_courses")
      .select("*, teaching_plans(*), teaching_course_classes(*), teaching_course_editors(*)")
      .eq("workspace_id", workspaceId)
      .eq("academic_year_id", yearId)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (courses.error)
    throw Error("수업·평가 자료를 불러오지 못했습니다. 다시 시도해 주세요.");
  const [standards, copies] = await Promise.all([
    readAllRows((from, to) =>
      db
        .from("achievement_standards")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("code")
        .order("id")
        .range(from, to),
    ),
    readAllRows((from, to) =>
      db
        .from("teaching_courses")
        .select("id,academic_year_id,grade,semester,subject_name,teacher_name")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);
  if (
    standards.error ||
    copies.error ||
    courses.data!.some((c) => c.teaching_plans.length !== 1)
  )
    throw Error("수업 자료가 변경 중입니다. 새로고침 후 다시 확인해 주세요.");
  return {
    courses: courses.data!.map(
      ({ teaching_plans, teaching_course_classes, teaching_course_editors, ...c }) => {
        void teaching_plans;
        void teaching_course_classes;
        void teaching_course_editors;
        return c;
      },
    ),
    classes: courses.data!.flatMap((c) => c.teaching_course_classes),
    editors: courses.data!.flatMap((c) => c.teaching_course_editors),
    plans: courses.data!.flatMap((c) => c.teaching_plans),
    standards: standards.data!,
    copies: copies.data!,
  };
}

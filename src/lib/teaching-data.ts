import "server-only";
import { session } from "./data";
import { readAllRows } from "./pagination";
import type { TeachingData } from "./models";
import { teachingSubmissionsSchema } from "./teaching-submissions";
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
      .select(
        "*, teaching_plans(*), teaching_course_classes(*), teaching_course_editors(*)",
      )
      .eq("workspace_id", workspaceId)
      .eq("academic_year_id", yearId)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (courses.error)
    throw Error("수업·평가 자료를 불러오지 못했습니다. 다시 시도해 주세요.");
  const [standards, copies, directory, subjects, submissions] = await Promise.all([
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
    db.rpc("staff_directory", { target: workspaceId, year_id: yearId }),
    db.from("subjects").select("id,name").eq("workspace_id", workspaceId),
    db.rpc("list_teaching_submissions", { target: workspaceId, year_id: yearId }),
  ]);
  if (
    directory.error ||
    subjects.error ||
    standards.error ||
    copies.error ||
    courses.data!.some((c) => c.teaching_plans.length !== 1)
  )
    throw Error("수업 자료가 변경 중입니다. 새로고침 후 다시 확인해 주세요.");
  const parsedSubmissions = teachingSubmissionsSchema.safeParse(submissions.data);
  return {
    submissions: !submissions.error && parsedSubmissions.success ? parsedSubmissions.data : undefined,
    courses: courses.data!.map(
      ({
        teaching_plans,
        teaching_course_classes,
        teaching_course_editors,
        ...c
      }) => {
        const confirmed = teaching_plans.some((p) => {
          const d = p.document as {
            lesson_status?: string;
            evaluations?: { status?: string }[];
          };
          return (
            d.lesson_status === "확정" ||
            d.evaluations?.some((e) => e.status === "확정")
          );
        });
        if (!confirmed) {
          const teacher = (
            directory.data as unknown as { id: string; display_name: string }[]
          ).find((t) => t.id === c.teacher_id);
          if (teacher) c.teacher_name = teacher.display_name;
          const subject = subjects.data?.find((t) => t.id === c.subject_id);
          if (subject) c.subject_name = subject.name;
        }
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

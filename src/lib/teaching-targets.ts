import type { Context } from "./models";
export type TeachingTarget = {
  grade: number;
  semester: number;
  subjectId: string;
  subjectName: string;
  teacherName: string;
  teacherId?: string;
  classIds: string[];
  hours: number;
  unit: string;
  exists: boolean;
};
/** Operating-year targets come from the appropriate cohort, not the entire school subject catalog. */
export function curriculumTeachingTargets(c: Context): TeachingTarget[] {
  if (!c.year) return [];
  return c.grades.flatMap((grade) => {
    const plan = c.plans.find(
      (p) => p.cohort_year === c.year!.year - grade + 1,
    );
    if (!plan) return [];
    return [1, 2].flatMap((semester) =>
      c.subjects.flatMap((subject) => {
        const hours = c.hours
          .filter(
            (h) =>
              h.plan_id === plan.id &&
              h.grade === grade &&
              h.semester === semester &&
              h.subject_id === subject.id,
          )
          .reduce((n, h) => n + h.hours, 0);
        if (hours <= 0) return [];
        const ids = c.classes.filter((x) => x.grade === grade).map((x) => x.id);
        const assignments =
          c.operations?.timetable?.document.weekly.filter(
            (x) =>
              x.subjectId === subject.id &&
              x.scope === "class" &&
              ids.includes(x.scopeId),
          ) ?? [];
        const teachers = [
          ...new Set(
            assignments
              .map(
                (x) =>
                  c.operations?.directory.find(
                    (t) =>
                      t.id === x.teacherId ||
                      (!!t.user_id && t.user_id === x.teacherId),
                  )?.display_name,
              )
              .filter((x): x is string => !!x),
          ),
        ];
        const exists = !!c.teaching?.courses.some(
          (course) =>
            !course.archived &&
            course.grade === grade &&
            course.subject_id === subject.id &&
            (course.semester === semester || course.semester === 0),
        );
        return [
          {
            grade,
            semester,
            subjectId: subject.id,
            subjectName: subject.name,
            teacherName: teachers.join(", "),
            teacherId: new Set(assignments.map(x=>x.teacherId)).size===1?assignments[0].teacherId:undefined,
            classIds: [...new Set(assignments.map((x) => x.scopeId))],
            hours,
            unit: plan.unit,
            exists,
          },
        ];
      }),
    );
  });
}

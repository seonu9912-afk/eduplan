"use client";
import { useMemo } from "react";
import { addDays } from "@/lib/domain";
import { linkedTeachingCalendar } from "@/lib/teaching-calendar-context";
import {
  createLessonResolver,
  publishedTimetable,
  type DatedLesson,
} from "@/lib/school-operations";
import type { Context, Row } from "@/lib/models";
export function TimetableReference({
  context: c,
  course,
}: {
  context: Context;
  course: Row<"teaching_courses">;
}) {
  const resolver = useMemo(() => {
    const table = publishedTimetable(c);
    return table ? createLessonResolver(c, table) : null;
  }, [c]);
  const classes = c.classes.filter((cls) =>
    c.teaching?.classes.some(
      (link) => link.course_id === course.id && link.class_id === cls.id,
    ),
  );
  const weeks = linkedTeachingCalendar(c, course.semester, course.grade).weeks;
  if (!resolver)
    return (
      <p className="muted-small">
        시간표 확정·배포 후 주차별 실제 수업 가능 차시를 확인할 수 있습니다.
      </p>
    );
  if (!course.subject_id || !classes.length)
    return (
      <p className="muted-small">
        수업 설정에서 공통 과목과 학급을 연결하면 확정 시간표의 차시를
        조회합니다.
      </p>
    );
  const rows = weeks.map((week) => {
    const lessons: DatedLesson[] = [];
    for (let d = week.start; d <= week.end; d = addDays(d, 1))
      lessons.push(...resolver(d));
    return {
      week,
      counts: classes.map((cls) => ({
        id: cls.id,
        available: lessons.filter(
          (l) =>
            l.subjectId === course.subject_id &&
            l.classIds.includes(cls.id) &&
            !l.blockedBy.length,
        ).length,
        lost: lessons.filter(
          (l) =>
            l.subjectId === course.subject_id &&
            l.classIds.includes(cls.id) &&
            l.blockedBy.length,
        ).length,
      })),
    };
  });
  return (
    <details className="panel">
      <summary>확정 시간표 기반 주차별 수업 가능 차시</summary>
      <p>
        최신 학사일정·교환·보결·행사 배정을 반영합니다. 각 학급의 차시는 따로
        계산하며 교사의 수업 내용과 확정 계획서는 변경하지 않습니다.
      </p>
      <div className="operations-scroll">
        <table className="operations-table">
          <thead>
            <tr>
              <th>주차·기간</th>
              {classes.map((cls) => (
                <th key={cls.id}>
                  {cls.grade}-{cls.class_number}반
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ week, counts }) => (
              <tr key={week.anchor}>
                <th>
                  {week.start}~{week.end}
                </th>
                {counts.map((x) => (
                  <td key={x.id}>
                    {x.available}차시
                    {x.lost > 0 && <small>변경·결손 검토 {x.lost}차시</small>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>학기 합계</th>
              {classes.map((cls) => (
                <td key={cls.id}>
                  {rows.reduce(
                    (n, r) =>
                      n +
                      (r.counts.find((x) => x.id === cls.id)?.available ?? 0),
                    0,
                  )}
                  차시
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  );
}

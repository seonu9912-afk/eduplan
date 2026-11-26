import { Disclosure } from "@/components/ui/disclosure";
import { Button } from "@/components/ui/button";
import { teachingDocumentSchema, reviewTeaching } from "@/lib/teaching";
import { reviewAuthoring } from "@/lib/teaching-authoring";
import type { Context } from "@/lib/models";

export function SchoolTeachingReview({ context, openPlan }: { context: Context; openPlan: (id: string) => void }) {
  const year = context.year?.year;
  const data = context.teaching;
  if (!year || !data || context.workspace.kind !== "school") return null;
  const shared = data.courses.filter((course) => !course.archived && course.visibility === "workspace");
  if (!shared.length) return null;

  return <Disclosure
    className="panel annual-section"
    label={
      <>
        학교 공유 계획 검토 · {shared.length}과목
      </>
    }
  >
    <SchoolReviewTable context={context} year={year} openPlan={openPlan} />
  </Disclosure>;
}

function SchoolReviewTable({ context, year, openPlan }: {
  context: Context;
  year: number;
  openPlan: (id: string) => void;
}) {
  const { courses, plans, standards } = context.teaching!;
  const documents = new Map(plans.map((plan) => [plan.course_id, plan.document]));
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = (index + 2) % 12 + 1;
    return { label: `${month}월`, key: `${index < 10 ? year : year + 1}-${String(month).padStart(2, "0")}` };
  });
  const shared = courses.filter((course) => !course.archived && course.visibility === "workspace");
  const reviews = shared.map((course) => {
    const doc = teachingDocumentSchema.safeParse(documents.get(course.id));
    if (!doc.success) return { course, issues: 1, warnings: 0, pendingDates: 0, counts: new Map<string, number>() };
    const issues = [
      ...reviewTeaching(doc.data, course, year, context.semesters, standards, context.schoolType),
      ...reviewAuthoring(doc.data, standards),
    ];
    const counts = new Map<string, number>();
    let pendingDates = 0;
    for (const evaluation of doc.data.evaluations) {
      const term = context.semesters.find((item) => item.number === evaluation.semester);
      for (const item of evaluation.items) {
        const month = item.start.slice(0, 7);
        if (!months.some(({ key }) => key === month) ||
            (term && (item.start < term.start_date || item.start > term.end_date))) {
          pendingDates++;
        } else {
          counts.set(month, (counts.get(month) ?? 0) + 1);
        }
      }
    }
    return {
      course, counts, pendingDates,
      issues: issues.filter((issue) => issue.level === "오류").length,
      warnings: issues.filter((issue) => issue.level === "확인 필요").length,
    };
  });
  return <>
    <p>월별 평가 항목 수는 저장된 시작일을 기준으로 집계합니다.</p>
    <div className="table-scroll">
      <table className="plan-table">
        <thead><tr><th>과목</th><th>오류</th><th>확인 필요</th><th>날짜 확인</th>
          {months.map((month) => <th key={month.key}>{month.label}</th>)}
        </tr></thead>
        <tbody>
          {reviews.map(({ course, issues, warnings, pendingDates, counts }) => <tr key={course.id}>
            <th><Button variant="ghost" onClick={() => openPlan(course.id)}>
              {course.grade}학년 {course.subject_name} · {course.semester ? `${course.semester}학기` : "연간"}
            </Button></th><td>{issues}</td><td>{warnings}</td><td>{pendingDates}</td>
            {months.map((month) => <td key={month.key}>{counts.get(month.key) ?? 0}</td>)}
          </tr>)}
        </tbody>
        <tfoot><tr><th>학교 공유 계획 합계</th>
          <td>{reviews.reduce((total, item) => total + item.issues, 0)}</td>
          <td>{reviews.reduce((total, item) => total + item.warnings, 0)}</td>
          <td>{reviews.reduce((total, item) => total + item.pendingDates, 0)}</td>
          {months.map((month) => <td key={month.key}>
            {reviews.reduce((total, item) => total + (item.counts.get(month.key) ?? 0), 0)}
          </td>)}
        </tr></tfoot>
      </table>
    </div>
  </>;
}

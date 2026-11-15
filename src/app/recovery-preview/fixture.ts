import { defaultAnnual } from "../../lib/academic";
import type { Context, Row } from "../../lib/models";
import { currentTeachingReference, emptyAssessment, emptyTeachingDocument, emptyUnit } from "../../lib/teaching";

const id = (n: number) => `d1500000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function recoveryPreviewContext(): Context {
  const userId = id(1), workspaceId = id(2), yearId = id(3), eventId = id(4), courseId = id(5);
  const at = "2027-02-01T01:00:00Z";
  const workspace = { id: workspaceId, created_at: at, kind: "school",
    name: "통합 검증용 가상 중학교", owner_id: userId, school_type: "중학교" };
  const year = { id: yearId, workspace_id: workspaceId, school_id: null, version: 1, year: 2027 };
  const grades = [1, 2, 3];
  const plan = defaultAnnual(grades);
  plan.vacations = [{ start: "2027-07-24", end: "2027-08-17", name: "여름방학" }];
  plan.days["2027-03-05"] = { type: "discretionary", name: "재량휴업일", enabled: true,
    weekday: 5, start: 1, end: 6 };
  plan.holidays = { "2027-03-01": "삼일절", "2027-05-05": "어린이날" };
  plan.allocations = [{ id: id(12), date: "2027-03-04", title: "진로 체험의 날", department: "교육과정부",
    eventId, start: 3, end: 4, areas: { "2": "진로" } }];
  const event: Row<"events"> = { id: eventId, academic_year_id: yearId, workspace_id: workspaceId,
    school_id: null, activity_area: "진로", created_by: userId, department: "교육과정부",
    description: "직업 탐색 활동과 모둠별 기록", end_date: "2027-03-04", start_date: "2027-03-04",
    event_type: "school", target_grades: [2], title: "진로 체험의 날", updated_at: at, version: 1 };
  const course: Row<"teaching_courses"> = { id: courseId, workspace_id: workspaceId,
    academic_year_id: yearId, archived: false, expected_hours: 68, grade: 2, manual_hours: null,
    owner_id: userId, reference_snapshot: {}, semester: 1, subject_id: null,
    subject_name: "국어", teacher_name: "가상 교사", updated_at: at, version: 1, visibility: "workspace" };
  const teaching = emptyTeachingDocument(1);
  teaching.units = [{ ...emptyUnit(), id: id(15), start: "2027-03-02", end: "2027-03-04",
    title: "우리의 경험을 담은 글", content: "표현의 효과를 근거와 함께 설명하기", note: "초고에 짧은 교사 피드백" }];
  teaching.evaluations[0].items = [{ ...emptyAssessment(), id: id(16),
    name: "경험을 담은 글 쓰기", start: "2027-04-12", end: "2027-04-16" }];
  const classes = grades.flatMap((grade) => [1, 2].map((class_number) =>
    ({ id: id(20 + grade * 2 + class_number), workspace_id: workspaceId, academic_year_id: yearId,
      school_id: null, grade, class_number })));
  const group = { id: id(31), name: "교과", workspace_id: workspaceId, school_id: null };
  const creativeGroup = { ...group, id: id(32), name: "창의적 체험활동" };
  const subjects = [ { ...group, id: id(33), group_id: group.id, name: "교과 모의 합계" },
    { ...group, id: id(34), group_id: creativeGroup.id, name: "창의적 체험활동" } ];
  const plans = grades.map((grade) =>
    ({ id: id(35 + grade), cohort_year: 2027 - grade + 1, workspace_id: workspaceId,
      school_id: null, source: "manual", unit: "hours", version: 1, updated_at: at }));
  const hours = grades.flatMap((grade) => [1, 2].flatMap((semester) => subjects.map((subject, i) =>
    ({ workspace_id: workspaceId, school_id: null, plan_id: plans[grade - 1].id, subject_id: subject.id,
      grade, semester, hours: i === 0 ? 520 : 55 }))));
  const context: Context = {
    userId, email: "preview@example.invalid", role: "viewer", workspace, workspaces: [workspace],
    profile: { id: userId, display_name: "검증용 사용자", default_workspace_id: workspaceId },
    schoolType: "중학교", grades, year, years: [year], classes,
    annual: { workspace_id: workspaceId, academic_year_id: yearId, document: plan, version: 1,
      updated_at: at, history: [], calendar_confirmation: null },
    semesters: [1, 2].map((number) => ({
      id: id(41 + number), workspace_id: workspaceId, academic_year_id: yearId, school_id: null, number,
      start_date: number === 1 ? "2027-03-01" : "2027-08-18", end_date: number === 1 ? "2027-07-23" : "2028-02-29",
    })),
    events: [event], activities: [], groups: [group, creativeGroup], subjects, plans, hours, members: [],
    invitations: [], teaching: { courses: [course], plans: [{
      academic_year_id: yearId, workspace_id: workspaceId, course_id: courseId, document: teaching,
    }], classes: [{ academic_year_id: yearId, class_id: classes[2].id,
      workspace_id: workspaceId, course_id: courseId, grade: 2 }], copies: [], standards: [] },
  };
  course.reference_snapshot = currentTeachingReference(context, course.grade, course.semester, course.subject_id);
  return context;
}

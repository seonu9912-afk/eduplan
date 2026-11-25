import { z } from "zod";
import {canPlan} from "./planning-completion";
import type { Context } from "./models";
import type { CurriculumDocument } from "./curriculum-design";
import type { TimetableRecord } from "./timetable-bridge";

export const staffInputSchema = z
  .object({
    teacher_id: z.uuid().optional(),
    display_name: z.string().trim().min(1).max(80),
    user_id: z.uuid().nullable(),
    subject_ids: z.array(z.uuid()).max(30),
    primary_subject_id: z.uuid().nullable(),
    department: z.string().trim().max(60),
    duties: z.string().trim().max(300),
    homeroom_class_id: z.uuid().nullable(),
    employment: z.enum(["정규", "기간제", "시간강사", "순회", "미정"]),
    status: z.enum(["재직", "휴직", "전출", "퇴직", "배치 예정"]),
    target_hours: z.number().min(0).max(40),
    reduction_hours: z.number().min(0).max(40),
  })
  .superRefine((v, ctx) => {
    if (v.reduction_hours > v.target_hours)
      ctx.addIssue({
        code: "custom",
        message: "경감 시수는 목표 시수 이하여야 합니다.",
      });
    if (v.primary_subject_id && !v.subject_ids.includes(v.primary_subject_id))
      ctx.addIssue({
        code: "custom",
        message: "주 담당 과목을 지도 가능 과목에 포함해 주세요.",
      });
    if (new Set(v.subject_ids).size !== v.subject_ids.length)
      ctx.addIssue({ code: "custom", message: "지도 가능 과목이 중복됩니다." });
  });
export type StaffInput = z.infer<typeof staffInputSchema>;
export type StaffAppointment = StaffInput & {
  id: string;
  workspace_id: string;
  academic_year_id: string;
  version: number;
  updated_at: string;
};
export type TeacherDirectory = Pick<
  StaffAppointment,
  | "id"
  | "display_name"
  | "user_id"
  | "subject_ids"
  | "primary_subject_id"
  | "department"
  | "duties"
  | "homeroom_class_id"
> & { active: boolean };
export const scenarioSchema = z.object({
  name: z.string().trim().min(1).max(100),
  classCounts: z.record(
    z.string().regex(/^[1-6]$/),
    z.number().int().min(0).max(40),
  ),
  weekly: z.record(z.string(), z.number().min(0).max(40)),
  staffCounts: z.record(z.uuid(), z.number().int().min(0).max(150)),
  targetHours: z.record(z.uuid(), z.number().min(1).max(40)),
});
export type StaffingScenario = z.infer<typeof scenarioSchema>;
export const emptyScenario = (): StaffingScenario => ({
  name: "가상 편성안",
  classCounts: {},
  weekly: {},
  staffCounts: {},
  targetHours: {},
});
export type StaffingRow = {
  subjectId: string;
  name: string;
  creative: boolean;
  totalWeekly: number;
  staffCount: number;
  average: number | null;
  capacity: number;
  shortage: number | null;
  target: number;
  needed: number | null;
  assigned: number;
  estimated: boolean;
  incomplete: boolean;
  warnings: string[];
};
export type StaffingReport = {
  semester: number;
  rows: StaffingRow[];
  issues: string[];
  details: {
    subjectId: string;
    grade: number;
    weekly: number | null;
    classes: number;
    source: string;
  }[];
};
export type ScenarioRecord = {
  id: string;
  workspace_id: string;
  academic_year_id: string;
  name: string;
  created_at: string;
  document: {
    scenario: StaffingScenario;
    reports: StaffingReport[];
    sourceVersions: Record<string, number>;
  };
};
export type TimetablePublication = {
  id: string;
  workspace_id: string;
  academic_year_id: string;
  source_version: number;
  published_at: string;
  document: unknown;
};
export type OperationNotification = {
  id: string;
  workspace_id: string;
  academic_year_id: string;
  user_id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};
export type OperationsData = {
  effectiveTimetables?: {id:string;starts_on:string;document:unknown}[];
  resources?: import("./planning-resources").PlanningResources;
  directory: TeacherDirectory[];
  staff: StaffAppointment[];
  designs: Record<string, CurriculumDocument>;
  timetable: TimetableRecord | null;
  publication: TimetablePublication | null;
  scenarios: ScenarioRecord[];
  notifications: OperationNotification[];
};
export const emptyOperations = (): OperationsData => ({
  directory: [],
  staff: [],
  designs: {},
  timetable: null,
  publication: null,
  scenarios: [],
  notifications: [],
});
export const directoryEntry = (row: StaffAppointment): TeacherDirectory => ({
  id: row.id,
  display_name: row.display_name,
  user_id: row.user_id,
  subject_ids: row.subject_ids,
  primary_subject_id: row.primary_subject_id,
  department: row.department,
  duties: row.duties,
  homeroom_class_id: row.homeroom_class_id,
  active: row.status === "재직" || row.status === "배치 예정",
});
export const demandKey = (subjectId: string, grade: number, semester: number) =>
  `${subjectId}:${grade}:${semester}`;

/** A staffing forecast uses recurring weekly lessons, never integer-truncated annual hours or credits. */
export function staffingReport(
  c: Context,
  semester: number,
  scenario: StaffingScenario = emptyScenario(),
): StaffingReport {
  const operations = c.operations ?? emptyOperations(),
    issues: string[] = [],
    details: StaffingReport["details"] = [];
  const rows: StaffingRow[] = [];
  for (const teacher of operations.staff.filter(
    (t) => t.status !== "재직" && t.status !== "배치 예정",
  )) {
    if (
      operations.timetable?.document.weekly.some(
        (x) =>
          x.teacherId === teacher.id ||
          (!!teacher.user_id && x.teacherId === teacher.user_id),
      )
    )
      issues.push(
        `${teacher.display_name}: ${teacher.status} 상태이지만 수업 배정이 남아 있습니다. 담당자가 재배정을 검토하세요.`,
      );
  }
  for (const grade of c.grades) {
    const plan = c.plans.find(
      (p) => p.cohort_year === (c.year?.year ?? 0) - grade + 1,
    );
    if (!plan) issues.push(`${grade}학년 입학년도 편성표가 없습니다.`);
    else if (plan.unit !== "hours")
      issues.push(
        `${grade}학년은 학점 편성입니다. 주당 수업 횟수는 가상안에서 직접 지정해 주세요.`,
      );
  }
  for (const subject of c.subjects) {
    let totalWeekly = 0,
      estimated = false;
    const warnings: string[] = [];
    for (const grade of c.grades) {
      const plan = c.plans.find(
          (p) => p.cohort_year === (c.year?.year ?? 0) - grade + 1,
        ),
        doc = plan ? operations.designs[plan.id] : undefined;
      const classes =
        scenario.classCounts[String(grade)] ??
        c.classes.filter((x) => x.grade === grade).length;
      const key = demandKey(subject.id, grade, semester),
        override = scenario.weekly[key];
      const cell = doc?.cells.find(
        (x) =>
          x.subjectId === subject.id &&
          x.grade === grade &&
          x.semester === semester,
      );
      const legacy = c.hours.find(
        (x) =>
          x.plan_id === plan?.id &&
          x.subject_id === subject.id &&
          x.grade === grade &&
          x.semester === semester,
      );
      let weekly: number | null = 0,
        source = "미편성";
      if (override !== undefined) {
        weekly = override;
        source = "가상안";
      } else if (plan?.unit === "credits" && (cell || legacy)) {
        weekly = null;
        source = "학점: 주당 횟수 미정";
      } else if (doc?.excludedSubjectIds?.includes(subject.id)) {
        weekly = 0;
        source = "선택 제외";
      } else if (cell) {
        weekly = cell.weekly;
        source = "교육과정 주당 입력";
        if (cell.manual || cell.adjustments.some((x) => x.hours !== 0))
          warnings.push(
            `${grade}학년의 행사·직접 조정 시수는 정규 주당 수업과 구분합니다.`,
          );
      } else if (legacy?.hours) {
        weekly = null;
        source = "학기 총시수만 있음";
        warnings.push(
          `${grade}학년은 주당 입력이 없어 전체 수요에서 제외했습니다.`,
        );
      }
      if (
        doc?.choiceSets?.some(
          (x) =>
            x.grade === grade &&
            x.semester === semester &&
            x.subjectIds.includes(subject.id),
        )
      ) {
        estimated = true;
        warnings.push(
          `${grade}학년 선택과목은 전체 학급 개설 가정입니다. 실제 분반 수를 별도 검토하세요.`,
        );
      }
      details.push({ subjectId: subject.id, grade, weekly, classes, source });
      if (weekly !== null) totalWeekly += weekly * classes;
    }
    // Assign each teacher's capacity to ONE primary subject. Qualifications do not multiply headcount.
    const staff = operations.staff.filter(
      (x) =>
        x.primary_subject_id === subject.id &&
        (x.status === "재직" || x.status === "배치 예정"),
    );
    const count = scenario.staffCounts[subject.id] ?? staff.length;
    const target =
      scenario.targetHours[subject.id] ??
      (staff.length
        ? staff.reduce((n, x) => n + x.target_hours, 0) / staff.length || 18
        : 18);
    const capacity =
      scenario.staffCounts[subject.id] !== undefined ||
      scenario.targetHours[subject.id] !== undefined
        ? count * target
        : staff.reduce(
            (n, x) => n + Math.max(0, x.target_hours - x.reduction_hours),
            0,
          );
    const assigned = (operations.timetable?.document.weekly ?? []).filter(
      (x) => x.subjectId === subject.id,
    ).length;
    const missing = details.some(
      (x) => x.subjectId === subject.id && x.weekly === null,
    );
    if (totalWeekly || count || assigned || missing) {
      rows.push({
        subjectId: subject.id,
        name: subject.name,
        creative: /창의적|창체/.test(
          c.groups.find((x) => x.id === subject.group_id)?.name ?? "",
        ),
        totalWeekly,
        staffCount: count,
        average: count && !missing ? totalWeekly / count : null,
        capacity,
        shortage: missing ? null : totalWeekly - capacity,
        target,
        needed: missing
          ? null
          : Math.ceil(
              (totalWeekly + Math.max(0, count * target - capacity)) / target,
            ),
        assigned,
        estimated,
        incomplete: missing,
        warnings: [...new Set(warnings)],
      });
    }
  }
  if (!c.classes.length)
    issues.push(
      "등록된 학급이 없습니다. 학급 설정 또는 가상 학급 수를 확인하세요.",
    );
  if (!canPlan(c,"staffing"))
    issues.push("교원 수급 분석은 운영 담당자에게 제공됩니다.");
  return { semester, rows, issues: [...new Set(issues)], details };
}

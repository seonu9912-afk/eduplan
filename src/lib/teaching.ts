import { z } from "zod";
import { isoDate, uuid, monthRange, cohortFor } from "./domain";
import type { Context } from "./models";
import {
  reportFormatSchema,
  evaluationDetailSchema,
  narrativeRowSchema,
  validFormat,
} from "./teaching-format";
const text = (max = 2000) => z.string().max(max);
const date = z.union([z.literal(""), isoDate]);
const amount = z.number().finite().min(0).max(10000).nullable();
export const planStatuses = ["작성 중", "검토 중", "확정"] as const;
const status = z.enum(planStatuses);
export const unitSchema = z
  .object({
    id: uuid,
    period: text(100),
    month: text(20).optional(),
    week: text(40).optional(),
    day: text(100).optional(),
    assessment_method: text(2000).optional(),
    kind: z.enum(["lesson", "activity", "reflection"]).optional(),
    assessment_links: z
      .array(
        z
          .object({
            assessment_id: uuid,
            phase: z.enum(["준비", "실시", "피드백"]),
            stage_id: uuid.nullable().optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    start: date,
    end: date,
    title: text(200),
    content: text(5000),
    standard_ids: z.array(uuid).max(50),
    lessons: amount,
    method: text(1000),
    alignment: text(2000),
    note: text(2000),
  })
  .strict();
const levelSchema = z
  .object({
    id: uuid,
    label: text(100),
    description: text(3000),
    points: amount,
  })
  .strict();
const rubricSchema = z
  .object({
    id: uuid,
    element: text(200),
    stage_id: uuid.nullable().optional(),
    standard_ids: z.array(uuid).max(50).optional(),
    evidence: text(3000).optional(),
    points: amount,
    levels: z.array(levelSchema).max(50),
    note: text(1000),
  })
  .strict();
export const assessmentItemSchema = z
  .object({
    id: uuid,
    type: z.enum(["정기시험", "수행평가", "기타"]),
    name: text(200),
    task: text(5000).optional(),
    evidence: text(3000).optional(),
    stages: z
      .array(
        z
          .object({ id: uuid, title: text(200), description: text(3000) })
          .strict(),
      )
      .max(50)
      .optional(),
    element: text(3000),
    standard_ids: z.array(uuid).max(50),
    method: text(2000),
    period: text(100),
    start: date,
    end: date,
    count: z.number().int().min(1).max(100).nullable(),
    ratio: z.number().min(0).max(100).nullable(),
    points: amount,
    rubric: z.array(rubricSchema).max(100),
    notes: text(3000),
    detail: z
      .object({
        lessons: amount,
        unit_content: text(3000),
        methods: text(2000),
        competencies: text(2000),
        standard_levels: z
          .array(
            narrativeRowSchema
              .extend({ standard_id: uuid.nullable().optional() })
              .strict(),
          )
          .max(50),
      })
      .strict()
      .optional(),
  })
  .strict();
const evaluationSchema = z
  .object({
    semester: z.number().int().min(1).max(2),
    mode: z.enum(["weighted", "descriptive"]),
    status,
    notes: text(5000),
    detail: evaluationDetailSchema.optional(),
    items: z.array(assessmentItemSchema).max(200),
  })
  .strict();
export const teachingDocumentSchema = z
  .object({
    lesson_status: status,
    report: z
      .object({ weekly_hours: amount, format: reportFormatSchema })
      .strict()
      .optional(),
    units: z.array(unitSchema).max(500),
    evaluations: z.array(evaluationSchema).min(1).max(2),
  })
  .strict();
export type TeachingDocument = z.infer<typeof teachingDocumentSchema>;
export type TeachingUnit = z.infer<typeof unitSchema>;
export type AssessmentItem = z.infer<typeof assessmentItemSchema>;
export type RubricElement = AssessmentItem["rubric"][number];
export const courseSchema = z.object({
  workspace_id: uuid,
  academic_year_id: uuid,
  grade: z.number().int().min(1).max(6),
  semester: z.number().int().min(0).max(2),
  subject_id: uuid.nullable(),
  subject_name: z.string().trim().min(1).max(120),
  teacher_name: z.string().trim().min(1).max(80),
  teacher_id: uuid.nullable().optional(),
  link_reason: z.string().trim().max(500).optional(),
  class_ids: z.array(uuid).max(30),
  visibility: z.enum(["private", "workspace"]),
  manual_hours: z.number().min(0).max(10000).nullable(),
  copy_scope: z.enum(["all", "lesson", "assessment"]).optional(),
});
export const standardSchema = z.object({
  workspace_id: uuid,
  curriculum_version: z.enum(["2022 개정", "2015 개정", "기타"]),
  school_type: z.enum(["초등학교", "중학교", "고등학교"]),
  subject: z.string().trim().min(1).max(120),
  grade_band: z.string().trim().min(1).max(60),
  code: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(5000),
});
export function emptyTeachingDocument(semester: number): TeachingDocument {
  return {
    lesson_status: "작성 중",
    units: [],
    evaluations: (semester ? [semester] : [1, 2]).map((semester) => ({
      semester,
      mode: "weighted",
      status: "작성 중",
      notes: "",
      items: [],
    })),
  };
}
export function emptyUnit(): TeachingUnit {
  return {
    id: crypto.randomUUID(),
    period: "",
    start: "",
    end: "",
    title: "",
    content: "",
    standard_ids: [],
    lessons: null,
    method: "",
    alignment: "",
    note: "",
  };
}
export function emptyAssessment(): AssessmentItem {
  return {
    id: crypto.randomUUID(),
    type: "수행평가",
    name: "",
    element: "",
    standard_ids: [],
    method: "",
    period: "",
    start: "",
    end: "",
    count: 1,
    ratio: null,
    points: null,
    rubric: [],
    notes: "",
  };
}
export function emptyRubric(): RubricElement {
  return {
    id: crypto.randomUUID(),
    element: "",
    points: null,
    levels: [],
    note: "",
  };
}
export function curriculumReference(
  c: Context,
  grade: number,
  semester: number,
  subjectId: string | null,
) {
  const p = c.plans.find(
    (p) => p.cohort_year === cohortFor(c.year!.year, grade),
  );
  const rows = c.hours.filter(
    (h) =>
      h.plan_id === p?.id &&
      h.subject_id === subjectId &&
      h.grade === grade &&
      (!semester || h.semester === semester),
  );
  return {
    plan_id: p?.id ?? null,
    version: p?.version ?? null,
    subject_id: subjectId,
    amount: rows.length ? rows.reduce((n, h) => n + h.hours, 0) : null,
    unit: p?.unit ?? "hours",
  };
}
export function currentTeachingReference(
  c: Context,
  grade: number,
  semester: number,
  subjectId: string | null,
) {
  return {
    curriculum: curriculumReference(c, grade, semester, subjectId),
    calendar: {
      year_version: c.year!.version,
      annual_version: c.annual?.version ?? 0,
      events: c.events
        .map((e) => ({ id: e.id, version: e.version }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      terms: c.semesters
        .map((t) => ({
          number: t.number,
          start_date: t.start_date,
          end_date: t.end_date,
        }))
        .sort((a, b) => a.number - b.number),
    },
  };
}
export type TeachingReference = ReturnType<typeof currentTeachingReference>;
export type ReviewIssue = {
  level: "오류" | "확인 필요";
  section: "교수학습계획" | "평가계획" | "수업 설정";
  message: string;
};
type Standard = {
  id: string;
  school_type: string;
  subject: string;
  grade_band: string;
};
export function reviewTeaching(
  doc: TeachingDocument,
  course: { grade: number; semester: number; expected_hours: number | null },
  year: number,
  terms: { number: number; start_date: string; end_date: string }[],
  standards: Standard[],
  schoolType: string,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  if (doc.report && !validFormat(doc.report.format))
    issues.push({
      level: "오류",
      section: "수업 설정",
      message: "출력 서식의 열·항목 구성을 확인하세요.",
    });
  const add = (
    section: ReviewIssue["section"],
    message: string,
    level: ReviewIssue["level"] = "오류",
  ) => issues.push({ section, message, level });
  const dates = (
    section: ReviewIssue["section"],
    name: string,
    start: string,
    end: string,
    semester: number,
  ) => {
    if (start && end && start > end)
      add(section, `${name}: 종료일이 시작일보다 빠릅니다.`);
    const term = terms.find((t) => t.number === semester),
      first = semester && term ? term.start_date : `${year}-03-01`,
      last =
        semester && term ? term.end_date : monthRange(`${year + 1}-02`).end;
    if (
      (start && (start < first || start > last)) ||
      (end && (end < first || end > last))
    )
      add(
        section,
        `${name}: 선택한 ${semester ? "학기" : "학년도"} 기간 밖의 날짜입니다.`,
      );
  };
  const linked = (
    section: ReviewIssue["section"],
    name: string,
    ids: string[],
  ) => {
    if (!ids.length)
      add(section, `${name}: 성취기준을 연결하세요.`, "확인 필요");
    for (const id of ids) {
      const s = standards.find((s) => s.id === id);
      if (!s) add(section, `${name}: 성취기준을 확인할 수 없습니다.`);
      else if (s.school_type !== schoolType)
        add(section, `${name}: 성취기준의 학교급이 다릅니다.`, "확인 필요");
    }
  };
  if (!doc.units.length) add("교수학습계획", "교수학습 단원을 추가하세요.");
  doc.units.forEach((u, i) => {
    const name = `${i + 1}번 수업`;
    if (!u.title.trim() || !u.content.trim())
      add("교수학습계획", `${name}: 단원명·학습 내용을 입력하세요.`);
    if (!u.period.trim() && !u.start && !u.day?.trim())
      add("교수학습계획", `${name}: 시기를 입력하세요.`);
    dates("교수학습계획", name, u.start, u.end, course.semester);
    if ((u.kind ?? "lesson") === "lesson" || u.standard_ids.length)
      linked("교수학습계획", name, u.standard_ids);
  });
  for (const ev of doc.evaluations) {
    const prefix = `${ev.semester}학기`;
    if (!ev.items.length) add("평가계획", `${prefix}: 평가 항목을 추가하세요.`);
    if (ev.mode === "weighted") {
      const ratio = ev.items.reduce((n, a) => n + (a.ratio ?? 0), 0);
      if (Math.abs(ratio - 100) > 0.001)
        add(
          "평가계획",
          `${prefix}: 반영비율 합계 ${Number(ratio.toFixed(4))}% (100% 필요)`,
        );
    }
    ev.items.forEach((a, i) => {
      const name = `${prefix} ${a.name || `${i + 1}번 평가`}`;
      if (!a.name.trim() || !a.element.trim() || !a.method.trim())
        add("평가계획", `${name}: 평가명·요소·방법을 입력하세요.`);
      if (!a.period.trim() && !a.start)
        add("평가계획", `${name}: 평가 시기를 입력하세요.`);
      if (a.count === null) add("평가계획", `${name}: 평가 횟수를 입력하세요.`);
      dates("평가계획", name, a.start, a.end, ev.semester);
      linked("평가계획", name, a.standard_ids);
      if (ev.mode === "weighted" && (a.ratio === null || a.points === null))
        add("평가계획", `${name}: 비율·배점을 입력하세요.`);
      if (a.type === "수행평가" && !a.rubric.length)
        add("평가계획", `${name}: 채점기준이 없습니다.`, "확인 필요");
      if (
        a.rubric.length &&
        ev.mode === "weighted" &&
        a.points !== null &&
        Math.abs(a.rubric.reduce((n, r) => n + (r.points ?? 0), 0) - a.points) >
          0.01
      )
        add("평가계획", `${name}: 평가 요소 배점 합계와 총점이 다릅니다.`);
      for (const r of a.rubric) {
        if (
          !r.element.trim() ||
          !r.levels.length ||
          r.levels.some((l) => !l.label.trim() || !l.description.trim())
        )
          add(
            "평가계획",
            `${name}: 루브릭 요소·평정수준·기준을 채워 주세요.`,
            "확인 필요",
          );
        if (ev.mode === "weighted") {
          if (r.points === null || r.levels.some((l) => l.points === null))
            add("평가계획", `${name}: 루브릭 배점·평정수준 점수를 입력하세요.`);
          if (
            r.points !== null &&
            r.levels.some((l) => l.points !== null && l.points > r.points!)
          )
            add("평가계획", `${name}: 평정수준 점수가 요소 배점을 초과합니다.`);
        }
      }
    });
  }
  return issues;
}
export function referenceKey(
  ref: Partial<TeachingReference> | null,
  part: "curriculum" | "calendar",
) {
  if (part === "curriculum") {
    const v = ref?.curriculum;
    if (!v || typeof v.unit !== "string") return null;
    return JSON.stringify([
      v.plan_id,
      v.version,
      v.subject_id,
      v.amount,
      v.unit,
    ]);
  }
  const v = ref?.calendar;
  if (!v || !Array.isArray(v.events) || !Array.isArray(v.terms) ||
      v.events.some((event) => typeof event?.id !== "string" || typeof event.version !== "number") ||
      v.terms.some((term) => typeof term?.number !== "number")) return null;
  return JSON.stringify([
    v.year_version,
    v.annual_version,
    [...v.events]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => [e.id, e.version]),
    [...v.terms]
      .sort((a, b) => a.number - b.number)
      .map((t) => [t.number, t.start_date, t.end_date]),
  ]);
}

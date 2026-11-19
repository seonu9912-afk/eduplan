import type { Context, Row } from "./models";

export type Adjustment = { id: string; kind: string; hours: number; note?: string };
export type DesignCell = {
  subjectId: string; grade: number; semester: number;
  weekly: number; adjustments: Adjustment[]; manual: number;
};
export type WeekRule = { count: 16 | 17; status: "confirmed" | "provisional" };
export type CohortChoiceSet={
  id:string;name:string;grade:number;semester:number;subjectIds:string[];requiredCount:number;
};
export type CurriculumDocument = {
  format: "eduplan-curriculum-v2"; cohortYear: number;
  weeks: Record<string, WeekRule>; termWeeks?: Record<string,WeekRule>;
  choiceSets?:CohortChoiceSet[]; cells: DesignCell[];
};
export type Calculation = { base: number; adjustments: number; manual: number; total: number; valid: boolean };

export const MIDDLE_2022_GROUPS = [
  { key: "국어", label: "국어", hours: 442 },
  { key: "사회", label: "사회(역사 포함)/도덕", hours: 510 },
  { key: "수학", label: "수학", hours: 374 },
  { key: "과학", label: "과학/기술·가정/정보", hours: 680 },
  { key: "체육", label: "체육", hours: 272 },
  { key: "예술", label: "예술(음악/미술)", hours: 272 },
  { key: "영어", label: "영어", hours: 340 },
  { key: "선택", label: "선택", hours: 170 },
  { key: "창체", label: "창의적 체험활동", hours: 306 },
] as const;
export const MIDDLE_2022_SOURCE =
  "교육부 고시 제2022-33호 [별책1] 총론 20~22쪽 (후속 개정 고시의 적용 여부 확인 필요)";
export const MIDDLE_2022_MINIMUM = 3366;

export const MIDDLE_2015_SOURCE =
  "교육부 고시 제2015-74호 및 2015 개정 교육과정 중학교 총론 해설 · 교과군별 기본 시수 기준";
export function curriculumVersion(cohortYear: number) {
  return cohortYear >= 2025
    ? { id: "2022", label: "2022 개정 교육과정", verified: true, source: MIDDLE_2022_SOURCE }
    : { id: "2015", label: "2015 개정 교육과정", verified: true, source: MIDDLE_2015_SOURCE };
}
export function matchGroup(name: string): string | null {
  const plain = name.replace(/[\s·⋅\\/()（）,]/g, "");
  if (/창의적체험|창체|동아리|스포츠클럽|자율자치|진로활동|봉사활동/.test(plain)) return "창체";
  if (/학교자율/.test(plain)) return null;
  if (/국어/.test(plain)) return "국어";
  if (/사회|역사|도덕/.test(plain)) return "사회";
  if (/수학/.test(plain)) return "수학";
  if (/과학|기술가정|정보/.test(plain)) return "과학";
  if (/체육/.test(plain)) return "체육";
  if (/음악|미술|예술/.test(plain)) return "예술";
  if (/영어/.test(plain)) return "영어";
  if (/선택/.test(plain)) return "선택";
  return null;
}
export function weekRule(doc: CurriculumDocument, grade: number, semester?:number): WeekRule {
  const year=doc.cohortYear+grade-1;
  return (semester?doc.termWeeks?.[year+":"+semester]:undefined)
    ??doc.weeks[String(year)]??{ count: 16, status: "provisional" };
}
export function evaluateCell(doc: CurriculumDocument, cell: DesignCell): Calculation {
  const base = cell.weekly * weekRule(doc, cell.grade, cell.semester).count;
  const adjustments = cell.adjustments.reduce((s, a) => s + a.hours, 0);
  const manual = cell.manual;
  const total = base + adjustments + manual;
  return {
    base, adjustments, manual, total,
    valid: Number.isFinite(total) && total >= 0 && total <= 2000 &&
      Math.abs(total - Math.round(total)) < 0.000001,
  };
}
export function withCell(doc: CurriculumDocument, subjectId: string, grade: number,
  semester: number, change: (cell: DesignCell) => DesignCell): CurriculumDocument {
  const key = (x: DesignCell) => x.subjectId === subjectId && x.grade === grade && x.semester === semester;
  const old = doc.cells.find(key) ?? { subjectId, grade, semester, weekly: 0, adjustments: [], manual: 0 };
  const changed = change(old);
  return { ...doc, cells: doc.cells.some(key)
    ? doc.cells.map((item) => key(item) ? changed : item)
    : [...doc.cells, changed] };
}
/** Direct final-total edits never change weekly hours or named adjustment items. */
export function withFinalHours(doc: CurriculumDocument, subjectId: string, grade: number,
  semester: number, total: number): CurriculumDocument {
  return withCell(doc, subjectId, grade, semester, (old) => ({
    ...old, manual: total - old.weekly * weekRule(doc, grade, semester).count -
      old.adjustments.reduce((s, item) => s + item.hours, 0),
  }));
}
export function withWeeklyHours(doc: CurriculumDocument, subjectId: string, grade: number,
  semester: number, weekly: number): CurriculumDocument {
  return withCell(doc, subjectId, grade, semester, (old) => ({ ...old, weekly }));
}
export function withWeeks(doc: CurriculumDocument, year: number, rule: WeekRule): CurriculumDocument {
  return { ...doc, weeks: { ...doc.weeks, [String(year)]: rule } };
}
export function withTermWeeks(doc:CurriculumDocument,year:number,semester:1|2,rule:WeekRule):CurriculumDocument {
  return {...doc,termWeeks:{...doc.termWeeks,[year+":"+semester]:rule}};
}
export function initializeDesign(context: Context, plan: Row<"curriculum_plans">,
  existing?: CurriculumDocument | null): CurriculumDocument {
  const years = Object.fromEntries(context.grades.map((grade) =>
    [String(plan.cohort_year + grade - 1), { count: 16 as const,
      status: grade === 1 ? "confirmed" as const : "provisional" as const }]));
  const source: CurriculumDocument = existing?.format === "eduplan-curriculum-v2" &&
    existing.cohortYear === plan.cohort_year
    ? { ...existing, weeks: { ...years, ...existing.weeks } }
    : { format: "eduplan-curriculum-v2", cohortYear: plan.cohort_year, weeks: years, cells: [] };
  // A removed, never-used subject may still have zero-valued cells in an
  // earlier draft. Omit such stale rows from the loaded editing document;
  // snapshots and revision history remain untouched in storage.
  const activeSubjectIds=new Set(context.subjects.map(subject=>subject.id));
  const rows = source.cells.filter(cell=>activeSubjectIds.has(cell.subjectId));
  for (const subject of context.subjects) {
    for (const grade of context.grades) for (const semester of [1, 2]) {
      if (rows.some((x) => x.subjectId === subject.id && x.grade === grade && x.semester === semester)) continue;
      const final = context.hours.find((x) =>
        x.plan_id === plan.id && x.subject_id === subject.id && x.grade === grade && x.semester === semester)?.hours ?? 0;
      rows.push({ subjectId: subject.id, grade, semester, weekly: final /
        weekRule(source,grade,semester).count, adjustments: [], manual: 0 });
    }
  }
  return { ...source, cells: rows };
}
export function designEntries(doc: CurriculumDocument) {
  return doc.cells.map((cell) => ({
    subject_id: cell.subjectId, grade: cell.grade, semester: cell.semester,
    hours: evaluateCell(doc, cell).total,
  }));
}
export function getCell(doc: CurriculumDocument | null | undefined, subjectId: string,
  grade: number, semester: number): DesignCell | null {
  return doc?.cells.find((cell) =>
    cell.subjectId === subjectId && cell.grade === grade && cell.semester === semester) ?? null;
}
export function nationalGroupTotals(context: Context, doc: CurriculumDocument) {
  const totals = new Map<string, number>();
  for (const cell of doc.cells) {
    const subject = context.subjects.find((row) => row.id === cell.subjectId);
    if (!subject) continue;
    const group = context.groups.find((item) => item.id === subject.group_id);
    const category = matchGroup(group?.name ?? subject.name);
    if (!category) continue;
    totals.set(category, (totals.get(category) ?? 0) + evaluateCell(doc, cell).total);
  }
  return MIDDLE_2022_GROUPS.map((rule) => {
    const actual = totals.get(rule.key) ?? 0;
    const diff = actual - rule.hours;
    return { ...rule, actual, diff, ratio: diff / rule.hours,
      status: Math.abs(diff) > rule.hours * 0.2 + 0.000001 ? "20% 범위 검토" :
        ((rule.key === "체육" || rule.key === "예술") && diff < 0 ? "감축 여부 검토" : "범위 내") };
  });
}
export function sportsHoursByGrade(context: Context, doc: CurriculumDocument) {
  return context.grades.map((grade) => ({
    grade,
    hours: doc.cells.filter((cell) => cell.grade === grade).reduce((sum, cell) => {
      const subject = context.subjects.find((s) => s.id === cell.subjectId);
      return sum + (/스포츠클럽/.test(subject?.name ?? "") ? evaluateCell(doc, cell).total : 0);
    }, 0),
  }));
}
export function validateDocument(context: Context, doc: CurriculumDocument): string[] {
  const errors: string[] = [];
  if (!doc.cells.length || doc.cells.length > 3600) errors.push("편성 과목의 개수를 확인해 주세요.");
  const keys = new Set<string>();
  for (const cell of doc.cells) {
    const key = [cell.subjectId, cell.grade, cell.semester].join("|");
    if (keys.has(key)) errors.push("과목·학년·학기 중복: " + key);
    keys.add(key);
    if (!context.subjects.some((s) => s.id === cell.subjectId)) errors.push("등록되지 않은 과목: " + cell.subjectId);
    if (!context.grades.includes(cell.grade) || ![1, 2].includes(cell.semester)) errors.push("학년/학기 범위 오류: " + key);
    if (!Number.isFinite(cell.weekly) || cell.weekly < 0 || cell.weekly > 100) errors.push("주당 시수 범위 오류: " + key);
    if (!evaluateCell(doc, cell).valid) errors.push("총시수가 정수가 아닌 과목: " + key);
  }
  return errors;
}

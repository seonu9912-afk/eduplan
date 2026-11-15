import { describe, expect, it } from "vitest";
import {
  emptyTeachingDocument,
  emptyAssessment,
  emptyUnit,
  emptyRubric,
  teachingDocumentSchema,
  reviewTeaching,
} from "../../src/lib/teaching";
import {
  authoringIntegrityErrors,
  changeAssessmentStandards,
  copyAssessment,
  draftTeachingWeeks,
  linkedLessons,
  reconcileAssessmentLinks,
  reviewAuthoring,
} from "../../src/lib/teaching-authoring";
import { academicDays, defaultAnnual } from "../../src/lib/academic";
import { buildTeachingReport } from "../../src/lib/teaching-report";
import type { Context, Row } from "../../src/lib/models";
const standard = {
  id: crypto.randomUUID(),
  curriculum_version: "2022 개정",
  school_type: "중학교",
  subject: "국어",
  grade_band: "1~3학년",
  code: "TEST-READING",
  content: "근거를 들어 해석한다.",
};
function readingPlan() {
  const doc = emptyTeachingDocument(2);
  const a = {
    ...emptyAssessment(),
    name: "독서 프로젝트",
    standard_ids: [standard.id],
    task: "책의 갈등을 분석하여 대안을 발표한다.",
    evidence: "독서 기록장, 활동지, 발표 및 수정 기록",
    stages: ["독서", "활동지", "프로젝트"].map((title) => ({
      id: crypto.randomUUID(),
      title,
      description: `${title} 활동`,
    })),
    rubric: [] as ReturnType<typeof emptyRubric>[],
  };
  a.rubric = ["독서 기록", "근거 분석", "참여도", "표현력"].map(
    (element, i) => ({
      ...emptyRubric(),
      element,
      points: 25,
      stage_id: a.stages[Math.min(i, 2)].id,
      standard_ids: [standard.id],
      evidence: `${element}의 근거와 수정 기록`,
      levels: [
        {
          id: crypto.randomUUID(),
          label: "충족",
          points: 25,
          description: "두 근거를 제시하여 설명한다.",
        },
        {
          id: crypto.randomUUID(),
          label: "보완",
          points: 10,
          description: "근거를 일부 제시하였으나 주장과의 관련성이 부족하다.",
        },
      ],
    }),
  );
  doc.evaluations[0].items = [a];
  doc.units = (["준비", "실시", "피드백"] as const).map((phase, i) => ({
    ...emptyUnit(),
    title: `독서 ${i + 1}주`,
    period: `9월 ${i + 1}주`,
    standard_ids: [standard.id],
    assessment_links: [
      { assessment_id: a.id, phase, stage_id: a.stages[i].id },
    ],
  }));
  return doc;
}
describe("teaching authoring relations", () => {
  it("accepts a multiweek task with three real stages and four independent criteria", () => {
    const doc = readingPlan();
    expect(teachingDocumentSchema.safeParse(doc).success).toBe(true);
    expect(authoringIntegrityErrors(doc)).toEqual([]);
    expect(reviewAuthoring(doc, [standard])).toEqual([]);
    expect(
      linkedLessons(doc.units, doc.evaluations[0].items[0].id),
    ).toHaveLength(3);
  });
  it("checks unknown task, foreign stage, duplicate link and criteria outside task standards", () => {
    const doc = readingPlan(),
      a = doc.evaluations[0].items[0];
    doc.units[0].assessment_links!.push({
      ...doc.units[0].assessment_links![0],
    });
    doc.units[1].assessment_links![0].assessment_id = crypto.randomUUID();
    a.rubric[0].stage_id = crypto.randomUUID();
    a.rubric[1].standard_ids = [crypto.randomUUID()];
    expect(authoringIntegrityErrors(doc)).toHaveLength(4);
  });
  it("clones stages and criteria without assigning the existing lessons to the new task", () => {
    const doc = readingPlan(),
      a = doc.evaluations[0].items[0],
      copy = copyAssessment(a);
    doc.evaluations[0].items.push(copy);
    expect(copy.id).not.toBe(a.id);
    expect(copy.stages![2].id).not.toBe(a.stages![2].id);
    expect(copy.rubric[2].stage_id).toBe(copy.stages![2].id);
    expect(copy.rubric[3].stage_id).toBe(copy.stages![2].id);
    expect(copy.rubric[0].levels[0].id).not.toBe(a.rubric[0].levels[0].id);
    expect(linkedLessons(doc.units, copy.id)).toEqual([]);
    expect(authoringIntegrityErrors(doc)).toEqual([]);
  });
  it("cleans removed stage/task links and coalesces equivalent links while preserving lesson text", () => {
    const doc = readingPlan(),
      a = doc.evaluations[0].items[0];
    doc.units[0].assessment_links!.push({
      ...doc.units[0].assessment_links![0],
      stage_id: a.stages![1].id,
    });
    a.stages = [];
    a.rubric = a.rubric.map((r) => ({ ...r, stage_id: null }));
    const reconciled = reconcileAssessmentLinks(doc);
    expect(reconciled.units[0].assessment_links).toHaveLength(1);
    expect(reconciled.units[0].assessment_links![0].stage_id).toBeNull();
    expect(authoringIntegrityErrors(reconciled)).toEqual([]);
    reconciled.evaluations[0].items = [];
    const removed = reconcileAssessmentLinks(reconciled);
    expect(removed.units.every((u) => u.assessment_links!.length === 0)).toBe(
      true,
    );
    expect(removed.units.map((u) => u.title)).toEqual(
      doc.units.map((u) => u.title),
    );
  });
  it("unlinks removed standards without discarding criterion or achievement-level wording", () => {
    const a = readingPlan().evaluations[0].items[0];
    a.detail = {
      lessons: 3,
      unit_content: "독서",
      methods: "발표",
      competencies: "",
      standard_levels: [
        {
          standard_id: standard.id,
          label: "상",
          description: "근거를 비교한다.",
        },
      ],
    };
    const changed = changeAssessmentStandards(a, []);
    expect(changed.rubric[0].standard_ids).toEqual([]);
    expect(changed.rubric[0].evidence).toBe(a.rubric[0].evidence);
    expect(changed.detail!.standard_levels[0]).toMatchObject({
      standard_id: null,
      description: "근거를 비교한다.",
    });
  });
  it("warns about unpracticed standards and missing evidence without claiming content validity", () => {
    const doc = readingPlan();
    doc.units.forEach((u) => {
      u.standard_ids = [];
    });
    doc.evaluations[0].items[0].rubric[0].evidence = "";
    const issues = reviewAuthoring(doc, [standard]);
    expect(issues.some((i) => i.message.includes("학습 기회"))).toBe(true);
    expect(issues.some((i) => i.message.includes("확인할 증거"))).toBe(true);
    expect(
      issues.every((i) => i.assessment_id === doc.evaluations[0].items[0].id),
    ).toBe(true);
  });
  it("compares standard text only within the same curriculum scope", () => {
    const doc = readingPlan(),
      other = {
        ...standard,
        id: crypto.randomUUID(),
        curriculum_version: "2015 개정",
        content: "다른 개정의 기준",
      };
    doc.units[0].standard_ids.push(other.id);
    expect(
      reviewAuthoring(doc, [standard, other]).some((i) =>
        i.message.includes("서로 다릅니다"),
      ),
    ).toBe(false);
    other.curriculum_version = standard.curriculum_version;
    expect(
      reviewAuthoring(doc, [standard, other]).some((i) =>
        i.message.includes("서로 다릅니다"),
      ),
    ).toBe(true);
    other.content = "근거를  들어\n해석한다.";
    expect(
      reviewAuthoring(doc, [standard, other]).some((i) =>
        i.message.includes("서로 다릅니다"),
      ),
    ).toBe(false);
  });
  it("retains authoring relations and evidence in the shared report without confusing stage and rating", () => {
    const doc = readingPlan(),
      c = {
        year: { year: 2026 },
        workspace: { name: "검증 학교" },
        classes: [],
        teaching: { classes: [], standards: [standard] },
      } as unknown as Context;
    const report = buildTeachingReport(
      c,
      {
        id: "course",
        grade: 1,
        semester: 2,
        subject_name: "국어",
        teacher_name: "검증",
      } as Row<"teaching_courses">,
      doc,
    );
    const text = JSON.stringify(report);
    for (const value of [
      "독서 프로젝트 · 준비 /",
      "과제 진행 단계",
      "수업과 평가의 연결",
      "평정수준",
      "발표 및 수정 기록",
    ]) {
      if (value.includes(" /"))
        expect(text).toContain("독서 프로젝트 · 준비 · 독서");
      else expect(text).toContain(value);
    }
    expect(text).toContain("참여도");
    expect(text).toContain("표현력");
    doc.evaluations[0].mode = "descriptive";
    expect(
      JSON.stringify(
        buildTeachingReport(
          c,
          { grade: 1, semester: 2 } as Row<"teaching_courses">,
          doc,
        ),
      ),
    ).not.toContain("최하점 합계");
  });
});
describe("weekly lesson drafts", () => {
  it("uses real school dates, skips vacation-only weeks and never invents subject hours", () => {
    const annual = defaultAnnual([1]);
    annual.vacations = [
      { name: "봄방학", start: "2026-03-09", end: "2026-03-13" },
    ];
    annual.holidays["2026-03-02"] = "대체공휴일";
    const terms = [
      { number: 1, start_date: "2026-03-01", end_date: "2026-03-20" },
    ];
    const days = academicDays(2026, annual, terms).filter(
      (d) => d.semester === 1,
    );
    const weeks = draftTeachingWeeks(days, []);
    expect(weeks.map((u) => [u.start, u.end])).toEqual([
      ["2026-03-03", "2026-03-06"],
      ["2026-03-16", "2026-03-20"],
    ]);
    expect(weeks.every((u) => u.lessons === null)).toBe(true);
    expect(weeks[0].note).toContain("대체공휴일");
    expect(draftTeachingWeeks(days, [weeks[0]]).map((u) => u.start)).toEqual([
      "2026-03-16",
    ]);
  });
  it("does not demand subject standards and hours for a non-instructional activity row", () => {
    const doc = emptyTeachingDocument(1);
    doc.units = [
      {
        ...emptyUnit(),
        kind: "activity",
        title: "학교 행사",
        content: "학교 활동",
        day: "3/2",
      },
    ];
    const issues = reviewTeaching(
      doc,
      { grade: 1, semester: 1, expected_hours: null },
      2026,
      [],
      [],
      "중학교",
    ).filter((i) => i.section === "교수학습계획");
    expect(issues).toEqual([]);
  });
});

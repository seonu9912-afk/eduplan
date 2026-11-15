import { describe, expect, it } from "vitest";
import {
  emptyTeachingDocument,
  emptyUnit,
  emptyAssessment,
  emptyRubric,
  reviewTeaching,
  teachingDocumentSchema,
  referenceKey,
  curriculumReference,
  type TeachingReference,
} from "../../src/lib/teaching";
import type { Context } from "../../src/lib/models";

const standards = [
  {
    id: crypto.randomUUID(),
    school_type: "중학교",
    subject: "국어",
    grade_band: "1~3학년",
  },
];
const terms = [
  { number: 1, start_date: "2026-03-01", end_date: "2026-08-16" },
  { number: 2, start_date: "2026-08-17", end_date: "2027-02-28" },
];
function complete() {
  const doc = emptyTeachingDocument(1);
  doc.units = [
    {
      ...emptyUnit(),
      title: "검증용 단원",
      content: "테스트 학습 내용",
      period: "3월",
      lessons: 34,
      standard_ids: [standards[0].id],
    },
  ];
  const rubric = {
    ...emptyRubric(),
    element: "검증 요소",
    points: 100,
    levels: [
      {
        id: crypto.randomUUID(),
        label: "충족",
        description: "테스트 평가기준",
        points: 100,
      },
    ],
  };
  doc.evaluations[0].items = [
    {
      ...emptyAssessment(),
      name: "테스트 수행평가",
      element: "테스트 요소",
      method: "관찰",
      period: "4월",
      ratio: 100,
      points: 100,
      standard_ids: [standards[0].id],
      rubric: [rubric],
    },
  ];
  return doc;
}
const check = (doc: ReturnType<typeof complete>, semester = 1) =>
  reviewTeaching(
    doc,
    { grade: 2, semester, expected_hours: 34 },
    2026,
    terms,
    standards,
    "중학교",
  );
describe("teaching review preserves drafts while identifying real planning gaps", () => {
  it("accepts an incomplete draft structurally and reports missing teaching/evaluation content", () => {
    const doc = emptyTeachingDocument(1);
    doc.units.push(emptyUnit());
    expect(teachingDocumentSchema.safeParse(doc).success).toBe(true);
    expect(check(doc).some((i) => i.message.includes("단원명"))).toBe(true);
    expect(check(doc).some((i) => i.message.includes("반영비율 합계"))).toBe(
      true,
    );
  });
  it("accepts performance assessment 100% with complete rubric", () =>
    expect(check(complete())).toEqual([]));
  it("accepts mixed regular/performance ratios and warns at 90% without blocking draft schema", () => {
    const doc = complete(),
      ev = doc.evaluations[0];
    ev.items[0].ratio = 60;
    ev.items.push({
      ...ev.items[0],
      id: crypto.randomUUID(),
      type: "정기시험",
      name: "정기시험",
      ratio: 40,
      rubric: [],
    });
    expect(check(doc)).toEqual([]);
    ev.items[1].ratio = 30;
    expect(
      check(doc).filter((i) => i.message.includes("반영비율 합계")),
    ).toMatchObject([
      { level: "오류", message: "1학기: 반영비율 합계 90% (100% 필요)" },
    ]);
    expect(teachingDocumentSchema.safeParse(doc).success).toBe(true);
  });
  it("accepts decimal ratios totaling 100 without binary rounding errors", () => {
    const doc = complete();
    doc.evaluations[0].items = [33.3, 33.3, 33.4].map((ratio) => ({
      ...doc.evaluations[0].items[0],
      id: crypto.randomUUID(),
      ratio,
    }));
    expect(check(doc)).toEqual([]);
  });
  it("does not require numeric scores or ratios in free-semester/descriptive mode", () => {
    const doc = complete(),
      ev = doc.evaluations[0],
      a = ev.items[0];
    ev.mode = "descriptive";
    a.ratio = null;
    a.points = null;
    a.rubric[0].points = null;
    a.rubric[0].levels[0].points = null;
    expect(check(doc)).toEqual([]);
  });
  it("checks rubric totals, missing levels, and scores exceeding an element maximum", () => {
    const doc = complete(),
      r = doc.evaluations[0].items[0].rubric[0];
    r.points = 60;
    expect(
      check(doc)
        .map((i) => i.message)
        .join(" "),
    ).toContain("합계와 총점");
    expect(
      check(doc)
        .map((i) => i.message)
        .join(" "),
    ).toContain("배점을 초과");
    r.levels = [];
    expect(check(doc).some((i) => i.message.includes("평정수준·기준"))).toBe(
      true,
    );
  });
  it("checks missing standard links, school-type mismatch and expected versus planned lessons", () => {
    const doc = complete();
    doc.units[0].standard_ids = [];
    doc.units[0].lessons = 30;
    expect(check(doc).some((i) => i.message.includes("성취기준을 연결"))).toBe(
      true,
    );
    expect(
      check(doc).some((i) => i.message.includes("30차시 / 기준 34차시")),
    ).toBe(true);
    doc.units[0].standard_ids = [standards[0].id];
    expect(
      reviewTeaching(
        doc,
        { grade: 2, semester: 1, expected_hours: 34 },
        2026,
        terms,
        standards,
        "초등학교",
      ).some((i) => i.message.includes("학교급")),
    ).toBe(true);
  });
  it("checks reversed dates, academic-year February and semester boundaries", () => {
    const doc = complete();
    doc.units[0].start = "2026-08-17";
    doc.units[0].end = "2026-03-01";
    const messages = check(doc)
      .map((i) => i.message)
      .join(" ");
    expect(messages).toContain("시작일보다");
    expect(messages).toContain("기간 밖");
    doc.units[0].start = "2027-02-27";
    doc.units[0].end = "2027-02-28";
    expect(check(doc, 0)).toEqual([]);
    doc.units[0].end = "2027-03-01";
    expect(check(doc, 0).some((i) => i.message.includes("학년도"))).toBe(true);
  });
  it("annual plans keep separate semester evaluations", () => {
    const doc = emptyTeachingDocument(0);
    expect(doc.evaluations.map((e) => e.semester)).toEqual([1, 2]);
    doc.evaluations[0].items = complete().evaluations[0].items;
    expect(
      check(doc, 0).some((i) => i.message.includes("2학기: 평가 항목")),
    ).toBe(true);
    expect(
      check(doc, 0).some((i) => i.message.includes("1학기: 반영비율")),
    ).toBe(false);
  });
  it("rejects impossible dates, negative lessons and unrecognized persisted fields", () => {
    const doc = complete();
    doc.units[0].start = "2026-02-30";
    expect(teachingDocumentSchema.safeParse(doc).success).toBe(false);
    doc.units[0].start = "";
    doc.units[0].lessons = -1;
    expect(teachingDocumentSchema.safeParse(doc).success).toBe(false);
    doc.units[0].lessons = 34;
    expect(
      teachingDocumentSchema.safeParse({ ...doc, workspace_id: "foreign" })
        .success,
    ).toBe(false);
  });
});
describe("reference change detection", () => {
  it("compares JSONB semantically regardless of property and event ordering", () => {
    const a: TeachingReference = {
      curriculum: {
        plan_id: "p",
        version: 1,
        subject_id: "s",
        amount: 34,
        unit: "hours",
      },
      calendar: {
        year_version: 1,
        annual_version: 1,
        events: [
          { id: "a", version: 1 },
          { id: "b", version: 2 },
        ],
        terms,
      },
    };
    const b = JSON.parse(JSON.stringify(a)) as TeachingReference;
    b.calendar.events.reverse();
    b.calendar.terms.reverse();
    expect(referenceKey(a, "calendar")).toBe(referenceKey(b, "calendar"));
    b.calendar.events[0].version++;
    expect(referenceKey(a, "calendar")).not.toBe(referenceKey(b, "calendar"));
    b.curriculum.amount = 35;
    expect(referenceKey(a, "curriculum")).not.toBe(
      referenceKey(b, "curriculum"),
    );
  });
  it("uses the selected grade cohort and semesters, never another grade or cohort", () => {
    const c = {
      year: { year: 2026 },
      plans: [
        { id: "correct", cohort_year: 2025, version: 2, unit: "hours" },
        { id: "other", cohort_year: 2026, version: 1, unit: "hours" },
      ],
      hours: [
        {
          plan_id: "correct",
          subject_id: "s",
          grade: 2,
          semester: 1,
          hours: 34,
        },
        {
          plan_id: "correct",
          subject_id: "s",
          grade: 2,
          semester: 2,
          hours: 32,
        },
        {
          plan_id: "correct",
          subject_id: "s",
          grade: 1,
          semester: 1,
          hours: 999,
        },
        {
          plan_id: "other",
          subject_id: "s",
          grade: 2,
          semester: 1,
          hours: 999,
        },
      ],
    } as unknown as Context;
    expect(curriculumReference(c, 2, 1, "s").amount).toBe(34);
    expect(curriculumReference(c, 2, 0, "s").amount).toBe(66);
    expect(curriculumReference(c, 2, 1, null).amount).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { curriculumDraft } from "../../src/lib/curriculum-draft";
import { annualSchema, defaultAnnual } from "../../src/lib/academic";
import { eventSchema } from "../../src/lib/domain";
describe("2026-1 curriculum general guidelines draft", () => {
  it("preserves all elementary grade-band totals and the 2028 effective date", () => {
    const d = curriculumDraft("초등학교");
    expect(d.minCohort).toBe(2028);
    expect(
      [0, 4, 8].map((offset) =>
        d.rows.reduce(
          (n, r) =>
            n + r.values.slice(offset, offset + 4).reduce((a, b) => a + b, 0),
          0,
        ),
      ),
    ).toEqual([1744, 1972, 2176]);
    expect(
      d.rows
        .find((r) => r.name === "건강한 생활")!
        .values.reduce((a, b) => a + b, 0),
    ).toBe(144);
  });
  it("preserves the middle-school 3-year allocation, including creative activities", () => {
    const d = curriculumDraft("중학교");
    expect(d.total).toBe(3366);
    expect(d.unit).toBe("시수");
    expect(
      d.rows
        .find((r) => r.name === "창의적 체험활동")!
        .values.reduce((a, b) => a + b, 0),
    ).toBe(306);
  });
  it.each([false, true])(
    "keeps high-school credits distinct from instructional hours (vocational %s)",
    (vocational) => {
      const d = curriculumDraft("고등학교", vocational);
      expect(d.unit).toBe("학점");
      expect(d.total).toBe(192);
      expect(
        d.rows
          .find((r) => r.name === "창의적 체험활동")!
          .values.reduce((a, b) => a + b, 0),
      ).toBe(18);
      expect(
        d.rows
          .find((r) => r.name === "자율 이수 (배분 전)")!
          .values.reduce((a, b) => a + b, 0),
      ).toBe(vocational ? 30 : 90);
      expect(
        d.rows
          .flatMap((r) => r.values)
          .every((n) => Number.isInteger(n) && n >= 0),
      ).toBe(true);
    },
  );
  it("keeps old work documents readable and preserves duty records when disabled", () => {
    const p = defaultAnnual([1, 2, 3]);
    delete p.workSettings;
    p.business.push({
      id: "duty",
      date: "2026-11-09",
      department: p.departments[0],
      kind: "당직",
      text: "가상 테스트",
      time: "17:00",
      location: "교무실",
    });
    expect(annualSchema.parse(p).business).toHaveLength(1);
    expect(
      annualSchema.parse({ ...p, workSettings: { dutyEnabled: false } })
        .business,
    ).toHaveLength(1);
    expect(
      eventSchema.safeParse({
        workspace_id: "00000000-0000-4000-8000-000000000001",
        academic_year_id: "00000000-0000-4000-8000-000000000002",
        title: "진로 행사",
        start_date: "2026-11-09",
        end_date: "2026-11-09",
        event_type: "school",
        activity_area: "진로",
        target_grades: [1, 2, 3],
        department: "",
        description: "",
      }).success,
    ).toBe(true);
  });
});

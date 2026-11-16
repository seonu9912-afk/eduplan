import { describe, expect, it } from "vitest";
import { Workbook } from "exceljs";
import { academicDays, annualSchema, calculateAcademic, defaultAnnual, effectiveAcademicTerms } from "../../src/lib/academic";
import { applyEventPeriods, curriculumTargets, datePeriod } from "../../src/lib/academic-rebuild";
import { mergeAnnualPlans } from "../../src/lib/academic-revisions";
import { buildAcademicWorkbook } from "../../src/lib/academic-workbook";
import { referenceKey } from "../../src/lib/teaching";
import { linkedTeachingCalendar } from "../../src/lib/teaching-calendar-context";
import { recoveryPreviewContext } from "../../src/app/recovery-preview/fixture";

describe("integrated academic calendar", () => {
  it("handles missing reference snapshots while retaining the preview's calendar reference", () => {
    expect(referenceKey({}, "curriculum")).toBeNull();
    expect(referenceKey({}, "calendar")).toBeNull();
    const reference = recoveryPreviewContext().teaching!.courses[0].reference_snapshot;
    expect(reference).toMatchObject({
      curriculum: { unit: "hours" },
      calendar: { annual_version: 1, events: [{ version: 1 }] },
    });
  });
  it("preserves custom dates and government holidays in the period preview", () => {
    const context = recoveryPreviewContext();
    const plan = defaultAnnual(context.grades);
    plan.holidays["2027-05-05"] = "어린이날";
    expect(datePeriod(2027, "2027-05-04", "2027-05-05", plan)).toEqual([
      { date: "2027-05-04", conflict: null },
      { date: "2027-05-05", conflict: "어린이날" },
    ]);
    expect(datePeriod(2027, "2027-05-32", "2027-06-01", plan)).toEqual([]);
  });
  it("uses the first instructional day following summer vacation across both modules", () => {
    const context = recoveryPreviewContext();
    const plan = defaultAnnual(context.grades);
    plan.vacations = [{ name: "여름방학", start: "2027-07-24", end: "2027-08-20" }];
    plan.holidays["2027-08-23"] = "휴일";
    expect(effectiveAcademicTerms(2027, plan, context.semesters)[1].start_date).toBe("2027-08-24");
    expect(academicDays(2027, plan, context.semesters).find((day) => day.date === "2027-08-23")?.semester).toBe(0);
    expect(linkedTeachingCalendar(context, 1, 2).weeks[0].calendarNotes.some(
      (note) => note.includes("진로 체험의 날"))).toBe(true);
  });
  it("keeps other grades and unaffected periods when selected event slots change", () => {
    const first = { id: "old", eventId: "event", date: "2027-03-04", title: "행사",
      department: "", start: 1, end: 4, areas: { 1: "동아리" as const, 2: "진로" as const } };
    let counter = 0;
    const next = applyEventPeriods([first], first, 2, [1, 3], "봉사", () => `new-${++counter}`);
    expect(first).toMatchObject({ start: 1, end: 4, areas: { 2: "진로" } });
    for (let p = 1; p <= 4; p++) {
      const slot = next.filter((row) => row.start <= p && row.end >= p);
      expect(slot.flatMap((row) => row.areas["1"] ?? [])).toEqual(["동아리"]);
      expect(slot.flatMap((row) => row.areas["2"] ?? [])).toEqual([p % 2 ? "봉사" : "진로"]);
    }
    expect(new Set(next.map((row) => row.id)).size).toBe(next.length);
  });
  it("uses the swapped weekday until a grade exception overrides its periods", () => {
    const context = recoveryPreviewContext();
    const plan = defaultAnnual([1, 2]);
    plan.days["2027-03-04"] = { type: "swap", name: "월요일 수업", enabled: true, weekday: 1,
      gradePeriods: { 2: { start: 1, end: 4 } } };
    plan.timetable.find((row) => row.grade === 1 && row.weekday === 4)!.end = 5;
    expect(annualSchema.safeParse(plan).success).toBe(true);
    const report = calculateAcademic(2027, plan, [1, 2], context.semesters);
    expect(report.details.filter((row) => row.date === "2027-03-04").map((row) => row.hours))
      .toEqual([6, 4]);
    expect(defaultAnnual().timetable).toEqual([]);
  });
  it("replaces only the specified class period and restores its grade rule when cleared", () => {
    const context = recoveryPreviewContext();
    const plan = defaultAnnual([2]);
    const id = "eacd9ee8-7478-4e98-b9c3-20cbe3233756";
    const event = { eventId: context.events[0].id, date: "2027-03-04", title: "행사", department: "" };
    let counter = 0;
    const makeId = () => `allocation-${++counter}`;
    const common = applyEventPeriods([], event, 2, [1, 2], "진로", makeId);
    plan.allocations = applyEventPeriods(common, event, 2, [1], "교과", makeId, id);
    const classes = [{ id, grade: 2, class_number: 1 },
      { id: "55635caa-4e62-43d4-bbb8-f5e8205ab4d9", grade: 2, class_number: 2 }];
    const report = calculateAcademic(2027, plan, [2], context.semesters, classes);
    const firstTerm = report.classTotals.filter((row) => row.semester === 1);
    expect(firstTerm.map((row) => row.counts["진로"])).toEqual([1, 2]);
    expect(firstTerm.map((row) => row.conflicts)).toEqual([0, 0]);
    expect(applyEventPeriods(plan.allocations, event, 2, [1], "없음", makeId, id)).toEqual(common);
  });
  it("merges independent dates and work entries and requires a choice for conflicting edit or removal", () => {
    const base = defaultAnnual();
    const rule = { type: "discretionary" as const, name: "휴업", enabled: true, weekday: 1 };
    base.days["2027-05-03"] = rule;
    const draft = { ...base, days: { "2027-05-10": rule } };
    const stored = { ...base, days: { "2027-05-03": { ...rule, name: "행사 휴업" }, "2027-06-07": rule },
      business: [{ id: "business", date: "2027-05-10", department: "교무실", kind: "업무" as const, text: "회의" }] };
    const result = mergeAnnualPlans(base, draft, stored);
    expect(result.conflicts).toEqual([{ key: "days:2027-05-03", label: "2027-05-03", draft: undefined,
      stored: { ...rule, name: "행사 휴업" } }]);
    expect(Object.keys(result.plan.days)).toEqual(["2027-05-03", "2027-06-07", "2027-05-10"]);
    const resolved = mergeAnnualPlans(base, draft, stored, { "days:2027-05-03": "draft" }).plan;
    expect(resolved.days["2027-05-03"]).toBeUndefined();
    expect(resolved.business).toEqual(stored.business);
  });
  it("uses the appropriate cohort and separates creative activity targets", () => {
    const c = recoveryPreviewContext();
    expect(curriculumTargets(2027, c).find((goal) => goal.grade === 2 && goal.semester === 1))
      .toMatchObject({ subject: 520, creative: 55 });
    expect(curriculumTargets(2027, { ...c, hours: [] })[0].subject).toBeNull();
  });
  it("round trips all three Excel sheets with filters, real event allocation and A4", async () => {
    const context = recoveryPreviewContext();
    const plan = defaultAnnual(context.grades);
    plan.allocations = [{ id: "allocation", eventId: context.events[0].id, date: "2027-03-04",
      title: context.events[0].title, department: "", start: 3, end: 4, areas: { 2: "진로" } }];
    const book = await buildAcademicWorkbook(2027, plan, context, { paper: "A4", grade: 2, semester: 1 }, "초안");
    const copy = new Workbook();
    await copy.xlsx.load(await book.xlsx.writeBuffer());
    expect(copy.worksheets.map((sheet) => sheet.name)).toEqual(["연간 학사력", "행사 목록", "시수 확보 현황"]);
    expect(copy.worksheets[0].columnCount).toBe(13);
    expect(copy.worksheets[0].rowCount).toBe(34);
    expect(copy.worksheets[0].pageSetup.paperSize).toBe(9);
    expect(copy.worksheets[1].getCell("F3").value).toContain("3~4교시");
  });
});

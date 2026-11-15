import { describe, expect, it } from "vitest";
import { Workbook } from "exceljs";
import { academicDays, defaultAnnual, effectiveAcademicTerms } from "../../src/lib/academic";
import { applyEventPeriods, curriculumTargets, datePeriod } from "../../src/lib/academic-rebuild";
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

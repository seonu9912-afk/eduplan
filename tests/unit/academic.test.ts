import { describe, it, expect } from "vitest";
import {
  defaultAnnual,
  calculateAcademic,
  academicDays,
  summarizeAcademicDays,
  academicHolidayImport,
} from "../../src/lib/academic";
const terms = [
  { number: 1, start_date: "2026-03-01", end_date: "2026-07-20" },
  { number: 2, start_date: "2026-08-17", end_date: "2027-02-28" },
];
describe("annual academic calculation", () => {
  it("shows teaching days before period setup and agrees with month and semester totals", () => {
    const p = defaultAnnual([1, 2, 3]);
    p.timetable = [];
    const result = calculateAcademic(2026, p, [1, 2, 3], terms);
    const summary = summarizeAcademicDays(result.days, p);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.total).toBe(summary.semesters.reduce((a, b) => a + b, 0));
    expect(summary.total).toBe(summary.months.reduce((a, b) => a + b.days, 0));
    expect(
      result.totals
        .filter((t) => t.grade === 1)
        .reduce((a, t) => a + t.days, 0),
    ).toBe(summary.total);
    expect(result.totals.every((t) => t.hours === 0)).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it("immediately recalculates holidays, vacations, discretionary days, swaps and leap February", () => {
    const p = defaultAnnual([1]);
    const allYear = [
      { number: 1, start_date: "2027-03-01", end_date: "2027-07-31" },
      { number: 2, start_date: "2027-08-01", end_date: "2028-02-29" },
    ];
    const baseline = summarizeAcademicDays(
      academicDays(2027, p, allYear),
      p,
    ).total;
    p.holidays["2027-03-02"] = "공휴일";
    p.vacations = [{ name: "방학", start: "2027-03-03", end: "2027-03-05" }];
    p.days["2027-03-08"] = {
      type: "discretionary",
      name: "휴업",
      enabled: true,
      weekday: 1,
      start: 1,
      end: 6,
    };
    p.days["2027-03-06"] = {
      type: "swap",
      name: "토요 수업",
      enabled: true,
      weekday: 1,
      start: 1,
      end: 6,
    };
    const days = academicDays(2027, p, allYear),
      summary = summarizeAcademicDays(days, p);
    expect(days).toHaveLength(366);
    expect(summary.total).toBe(baseline - 4);
    expect(summary.discretionary).toBe(1);
    expect(summary.vacations[0].days).toBe(3);
    expect(days.at(-1)?.date).toBe("2028-02-29");
  });
  it("imports both calendar years only after success and keeps manual overrides", () => {
    const responses: { ok: boolean; days: Record<string, string> }[] = [
      {
        ok: true,
        days: { "2026-01-01": "outside", "2026-03-02": "대체공휴일" },
      },
      { ok: true, days: { "2027-01-01": "신정", "2027-03-01": "outside" } },
    ];
    expect(academicHolidayImport(2026, responses).days).toEqual({
      "2026-03-02": "대체공휴일",
      "2027-01-01": "신정",
    });
    expect(
      academicHolidayImport(2026, [responses[0], { ok: false, days: {} }]),
    ).toEqual({ ok: false, days: {} });
    const p = defaultAnnual([1]);
    p.days["2026-03-02"] = {
      type: "swap",
      name: "수동 교체",
      enabled: true,
      weekday: 2,
      start: 1,
      end: 3,
    };
    p.holidays = academicHolidayImport(2026, responses).days;
    expect(
      academicDays(2026, p, terms).find((d) => d.date === "2026-03-02"),
    ).toMatchObject({ type: "swap", name: "수동 교체", weekday: 2 });
  });
  it("uses a full academic year, fixed March 1 holiday and real semester dates", () => {
    const p = defaultAnnual([1]);
    const days = academicDays(2026, p, terms);
    expect(days).toHaveLength(365);
    expect(days[0]).toMatchObject({
      date: "2026-03-01",
      type: "holiday",
      name: "삼일절",
      semester: 1,
    });
    expect(days.at(-1)?.date).toBe("2027-02-28");
    expect(days.find((d) => d.date === "2026-08-10")?.semester).toBe(0);
  });
  it("excludes disabled instructional days from every total", () => {
    const p = defaultAnnual([1]);
    p.days["2026-03-02"] = {
      type: "instructional",
      name: "",
      enabled: false,
      weekday: 1,
      start: 1,
      end: 6,
    };
    const a = calculateAcademic(2026, p, [1], terms);
    expect(a.details.find((d) => d.date === "2026-03-02")).toMatchObject({
      active: false,
      hours: 0,
      counts: {},
    });
    expect(a.totals[0].hours).toBe(
      a.details
        .filter((d) => d.semester === 1)
        .reduce((s, d) => s + d.hours, 0),
    );
  });
  it("preserves manual overrides, uses swapped weekday and grade-specific periods", () => {
    const p = defaultAnnual([1, 6]);
    p.vacations = [{ name: "방학", start: "2026-03-02", end: "2026-03-04" }];
    p.days["2026-03-03"] = {
      type: "swap",
      name: "대체수업",
      enabled: true,
      weekday: 1,
      start: 2,
      end: 4,
    };
    const a = calculateAcademic(2026, p, [1, 6], terms);
    expect(a.details.find((d) => d.date === "2026-03-02")?.hours).toBe(0);
    expect(
      a.details.find((d) => d.date === "2026-03-03" && d.grade === 6)?.hours,
    ).toBe(3);
  });
  it("counts overlapping activity once, gives events priority and reports ambiguous slots", () => {
    const p = defaultAnnual([1]);
    p.recurring = [
      {
        id: "r",
        name: "스포츠클럽",
        area: "자율",
        grade: 1,
        semester: 1,
        weekday: 1,
        start: 1,
        end: 2,
        exclude: [],
      },
    ];
    p.allocations = [
      {
        id: "a",
        date: "2026-03-02",
        title: "진로교육",
        department: "",
        start: 1,
        end: 1,
        areas: { 1: "진로" },
      },
    ];
    let a = calculateAcademic(2026, p, [1], terms);
    expect(a.details.find((d) => d.date === "2026-03-02")?.counts).toEqual({
      진로: 1,
      동아리: 1,
      교과: 4,
    });
    p.allocations.push({ ...p.allocations[0], id: "b" });
    a = calculateAcademic(2026, p, [1], terms);
    expect(a.details.find((d) => d.date === "2026-03-02")?.conflicts).toBe(1);
    expect(a.warnings.some((w) => w.includes("중복 배정"))).toBe(true);
  });
  it("supports exclusions and does not use inactive vacation events in hour totals", () => {
    const p = defaultAnnual([1]);
    p.recurring = [
      {
        id: "r",
        name: "활동",
        area: "동아리",
        grade: 1,
        semester: 1,
        weekday: 1,
        start: 1,
        end: 1,
        exclude: ["2026-03-02"],
      },
    ];
    p.vacations = [{ name: "휴업", start: "2026-03-09", end: "2026-03-09" }];
    p.allocations = [
      {
        id: "a",
        date: "2026-03-09",
        title: "행사",
        department: "",
        start: 1,
        end: 2,
        areas: { 1: "진로" },
      },
    ];
    const a = calculateAcademic(2026, p, [1], terms);
    expect(a.details.find((d) => d.date === "2026-03-02")?.counts).toEqual({
      교과: 6,
    });
    expect(a.details.find((d) => d.date === "2026-03-09")?.hours).toBe(0);
    expect(a.warnings).toContain(
      "2026-03-09 1학년 행사: 수업일·교시 범위 확인",
    );
  });
});

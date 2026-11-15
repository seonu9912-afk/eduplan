import { describe, expect, it } from "vitest";
import {
  academicSchema,
  academicYearOf,
  addDays,
  calendarDays,
  cohortFor,
  eventSchema,
  monthRange,
  overlaps,
  parseGridPaste,
  parseHours,
  safeNext,
  seoulToday,
  weekRange,
} from "../../src/lib/domain";
const id = "11111111-1111-4111-8111-111111111111";
describe("Korean academic dates", () => {
  it("uses Seoul date at the UTC day boundary", () =>
    expect(seoulToday(new Date("2026-11-07T15:05:00Z"))).toBe("2026-11-08"));
  it("assigns January and February to the previous academic year", () => {
    expect(academicYearOf("2027-02-28")).toBe(2026);
    expect(academicYearOf("2027-03-01")).toBe(2027);
  });
  it("maps operating grades to separate cohorts", () =>
    expect([1, 2, 3].map((g) => cohortFor(2026, g))).toEqual([
      2026, 2025, 2024,
    ]));
  it("preserves leap days", () => {
    expect(monthRange("2028-02").end).toBe("2028-02-29");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("creates Monday to Sunday ranges including Sunday", () => {
    expect(weekRange("2026-11-08")).toEqual({
      start: "2026-11-02",
      end: "2026-11-08",
    });
    expect(weekRange("2026-11-09")).toEqual({
      start: "2026-11-09",
      end: "2026-11-15",
    });
  });
  it("includes spanning events in both monthly and weekly projections", () => {
    const event = { start_date: "2026-10-30", end_date: "2026-11-10" };
    expect(overlaps(event, "2026-11-01", "2026-11-30")).toBe(true);
    expect(overlaps(event, "2026-11-09", "2026-11-15")).toBe(true);
    expect(overlaps(event, "2026-11-11", "2026-11-15")).toBe(false);
  });
  it("creates a stable six-week calendar", () => {
    expect(calendarDays("2026-11")).toHaveLength(42);
    expect(calendarDays("2026-11")[0]).toBe("2026-11-01");
  });
});
describe("curriculum editing", () => {
  it.each(["-1", "1.5", "1e2", "NaN", "2001", "text"])(
    "rejects invalid hours %s",
    (value) => expect(() => parseHours(value)).toThrow(),
  );
  it("treats blank as zero without using statutory defaults", () => {
    expect(parseHours("")).toBe(0);
    expect(parseHours(" 68 ")).toBe(68);
  });
  it("parses Excel tab/newline data", () =>
    expect(parseGridPaste("68\t51\r\n34\t17\r\n", 2, 2)).toEqual([
      [68, 51],
      [34, 17],
    ]));
  it("rejects partial out-of-bounds pastes", () =>
    expect(() => parseGridPaste("1\t2\t3", 1, 2)).toThrow());
  it("rejects a paste containing any invalid cell", () =>
    expect(() => parseGridPaste("1\t-3", 1, 2)).toThrow());
});
describe("validation and redirects", () => {
  const year = {
    target: id,
    school_year: 2026,
    expected_version: 0,
    terms: [
      { start_date: "2026-03-02", end_date: "2026-07-20" },
      { start_date: "2026-08-17", end_date: "2027-02-28" },
    ],
    class_counts: [3, 3, 3],
  };
  it("accepts a valid academic year", () =>
    expect(academicSchema.safeParse(year).success).toBe(true));
  it("rejects overlapping terms and mismatched year", () => {
    expect(
      academicSchema.safeParse({
        ...year,
        terms: [year.terms[0], { ...year.terms[1], start_date: "2026-07-10" }],
      }).success,
    ).toBe(false);
    expect(
      academicSchema.safeParse({ ...year, school_year: 2027 }).success,
    ).toBe(false);
  });
  it("rejects negative and fractional class counts", () =>
    expect(
      academicSchema.safeParse({ ...year, class_counts: [-1, 2.5, 3] }).success,
    ).toBe(false));
  it("rejects events with inverted dates or no target grades", () => {
    const event = {
      workspace_id: id,
      academic_year_id: id,
      title: "행사",
      start_date: "2026-11-10",
      end_date: "2026-11-09",
      event_type: "school",
      target_grades: [1],
      department: "",
      description: "",
    };
    expect(eventSchema.safeParse(event).success).toBe(false);
    expect(
      eventSchema.safeParse({
        ...event,
        end_date: "2026-11-10",
        target_grades: [],
      }).success,
    ).toBe(false);
  });
  it.each([
    "https://evil.test",
    "//evil.test",
    "/app/../../evil",
    "/reset-password?next=https://evil.test",
  ])("blocks open redirect %s", (path) => expect(safeNext(path)).toBe("/app"));
  it("allows recovery and invitation destinations", () => {
    expect(safeNext("/reset-password")).toBe("/reset-password");
    expect(safeNext("/invite/" + "a".repeat(64))).toBe(
      "/invite/" + "a".repeat(64),
    );
  });
});

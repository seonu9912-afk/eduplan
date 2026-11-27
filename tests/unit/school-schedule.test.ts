import { expect, it } from "vitest";
import { operationsPreviewContext } from "../../src/app/recovery-preview/operations-fixture";
import { defaultAnnual } from "../../src/lib/academic";
import { scheduleDates, shiftScheduleDate } from "../../src/lib/schedule-dates";
import { calendarWeekLanes, publishedScheduleDays } from "../../src/lib/school-schedule";
import type { SchoolPlanPublication } from "../../src/lib/school-publications";

it("preserves the selected day while moving months and trims the empty last rows", () => {
  expect(shiftScheduleDate("2028-01-31", "month", 1)).toBe("2028-02-29");
  expect(scheduleDates("2026-02-10", "month")).toHaveLength(28);
  expect(scheduleDates("2027-03-03", "week")).toEqual([
    "2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04", "2027-03-05", "2027-03-06", "2027-03-07",
  ]);
});

it("uses the release in effect on each date across a visible week", () => {
  const context = operationsPreviewContext();
  const scope = { workspace_id: context.workspace.id, academic_year_id: context.year!.id, published_at: "2027-03-01T00:00:00Z", published_by: context.userId, change_note: "" };
  const publication = (version: number, date: string, holidays: Record<string, string>): SchoolPlanPublication => ({
    ...scope, id: `calendar-${version}`, domain: "calendar", source_version: version, starts_on: date,
    payload: { document: { ...defaultAnnual(context.grades), holidays }, events: [], semesters: [], classes: [] },
  });
  context.schoolPublications = [
    publication(1, "2027-03-02", { "2027-03-03": "이전 공휴일", "2027-03-05": "이전 발표회" }),
    publication(2, "2027-03-04", { "2027-03-03": "소급하면 안 되는 날짜", "2027-03-05": "변경된 발표회" }),
    { ...scope, id: "work-1", domain: "plans", source_version: 1, starts_on: "2027-03-04", payload: {
      business: [{ id: "meeting", date: "2027-03-05", department: "교무부", kind: "업무", text: "학사 협의", time: "14:40", location: "회의실" }],
    } },
  ];
  const dates = scheduleDates("2027-03-03", "week");
  const school = publishedScheduleDays(context, dates, false);
  const work = publishedScheduleDays(context, dates, true);
  expect(school.get("2027-03-01")).toEqual({ available: false, entries: [] });
  expect(school.get("2027-03-03")?.entries.map((entry) => entry.title)).toEqual(["이전 공휴일"]);
  expect(school.get("2027-03-05")?.entries.map((entry) => entry.title)).toEqual(["변경된 발표회"]);
  expect(work.get("2027-03-05")?.entries).toContainEqual(expect.objectContaining({ title: "학사 협의", time: "14:40", location: "회의실" }));
});

it("joins a multi-day event into one span and puts overlapping events on another lane", () => {
  const dates = scheduleDates("2027-03-03", "week");
  const event = { id: "reading", title: "독서 주간", tone: "event" as const, date: dates[0], end: dates[4] };
  const meeting = { id: "meeting", title: "회의", tone: "work" as const, date: dates[2], end: dates[2] };
  const days = new Map(dates.map((day, i) => [day, { entries: [
    ...(i <= 4 ? [event] : []), ...(i === 2 ? [meeting] : []),
  ] }]));
  expect(calendarWeekLanes(dates, days)).toEqual([
    [{ entry: event, start: 0, end: 4 }],
    [{ entry: meeting, start: 2, end: 2 }],
  ]);
});

it("clips events at week edges and never merges different IDs, gaps or changed publications", () => {
  const dates = scheduleDates("2027-03-03", "week");
  const event = { id: "a", title: "독서", tone: "event" as const, date: "2027-02-28", end: "2027-03-08" };
  const changed = { ...event, title: "변경된 독서" };
  const separate = { ...event, id: "b" };
  const days = new Map(dates.map((day, i) => [day, { entries:
    i === 0 || i === 1 || i === 3 ? [event] : i === 4 ? [changed] : i === 5 || i === 6 ? [separate] : [],
  }]));
  expect(calendarWeekLanes(dates, days)).toEqual([[
    { entry: event, start: 0, end: 1 },
    { entry: event, start: 3, end: 3 },
    { entry: changed, start: 4, end: 4 },
    { entry: separate, start: 5, end: 6 },
  ]]);
});

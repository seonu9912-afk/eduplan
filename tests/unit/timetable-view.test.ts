import { describe, expect, it } from "vitest";
import { operationsPreviewContext } from "../../src/app/recovery-preview/operations-fixture";
import { timetableAt, timetableModeForWeek, timetableWeek } from "../../src/lib/timetable-view";
import { defaultAnnual } from "../../src/lib/academic";
import type { SchoolPlanPublication } from "../../src/lib/school-publications";

describe("published timetable sheet", () => {
  it("shows known assignments in basic mode when the calendar has a draft but no release", () => {
    const c = operationsPreviewContext();
    const date = "2027-03-04";
    c.schoolPublications = [];
    c.operations!.effectiveTimetables = [{ starts_on: "2027-03-01", id: "spring", document: c.operations!.publication!.document }];
    const mode = timetableModeForWeek(c, date);
    expect(mode).toBe("basic");
    expect(timetableWeek(c, date, mode).weekdays.some((day) => day.cells.length > 0)).toBe(true);
    expect(timetableWeek(c, date, "weekly").weekdays.every((day) => day.cells.length === 0)).toBe(true);
  });

  it("shows only effective releases and uses the school's own period count", () => {
    const c = operationsPreviewContext();
    const document = c.operations!.publication!.document as Record<string, unknown>;
    c.operations!.effectiveTimetables = [{
      starts_on: "2027-03-02", id: "spring", document, published_at: "2027-03-01T00:00:00Z",
    }, {
      starts_on: "2027-05-03", id: "revision", document: { ...document, weekly: [] },
    }];
    expect(timetableAt(c, "2027-03-01").document).toBeNull();
    expect(timetableAt(c, "2027-04-30").endsOn).toBe("2027-05-02");
    expect(timetableWeek(c, "2027-03-04", "basic").weekdays.some((day) => day.cells.length > 0)).toBe(true);
    expect(timetableWeek(c, "2027-05-03", "basic").weekdays.every((day) => day.cells.length === 0)).toBe(true);
  });

  it("uses the published calendar even when an editor has saved a closure draft", () => {
    const c = operationsPreviewContext();
    const document = c.operations!.publication!.document;
    c.operations!.effectiveTimetables = [{ starts_on: "2027-03-01", id: "spring", document }];
    const plan = defaultAnnual(c.grades);
    const stored = { ...plan, holidays: { "2027-03-02": "미공개 휴업" } };
    c.annual = { ...c.annual!, document: stored };
    c.schoolPublications = [{
      id: "calendar-version",
      workspace_id: c.workspace.id,
      academic_year_id: c.year!.id,
      domain: "calendar",
      source_version: 1,
      starts_on: "2027-03-01",
      published_at: "2027-03-01T00:00:00Z",
      published_by: c.userId,
      change_note: "",
      payload: { document: plan, semesters: c.semesters, classes: c.classes, events: [] },
    }] as SchoolPlanPublication[];
    expect(timetableModeForWeek(c, "2027-03-02")).toBe("weekly");
    const tue = timetableWeek(c, "2027-03-02", "weekly").weekdays[1];
    expect(tue.notice).not.toContain("미공개 휴업");
    expect(tue.cells.length).toBeGreaterThan(0);
  });
});

describe("official timetable cancellation display",()=>{
 it("keeps known weekday lessons for a published in-term closure but not ordinary free periods",()=>{
  const c=operationsPreviewContext();
  const original=timetableWeek(c,"2027-03-02","basic").weekdays[1].cells;
  expect(original.length).toBeGreaterThan(0);
  const plan=defaultAnnual(c.grades);
  plan.holidays["2027-03-02"]="학교 휴업";
  c.schoolPublications=[{id:"closed",workspace_id:c.workspace.id,academic_year_id:c.year!.id,domain:"calendar",source_version:1,starts_on:"2027-03-01",published_at:"2027-03-01T00:00:00Z",published_by:c.userId,change_note:"",payload:{document:plan,semesters:c.semesters,classes:c.classes,events:[]}}] as SchoolPlanPublication[];
  const tue=timetableWeek(c,"2027-03-02","weekly",true).weekdays[1];
  expect(tue.teaching).toBe(false);
  expect(tue.cells.map(cell=>cell.id)).toEqual(original.map(cell=>cell.id));
  expect(tue.cells.every(cell=>cell.badges?.includes("미실시"))).toBe(true);
 });
});

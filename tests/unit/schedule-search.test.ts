import { expect, it } from "vitest";
import { operationsPreviewContext } from "../../src/app/recovery-preview/operations-fixture";
import { defaultAnnual } from "../../src/lib/academic";
import { buildScheduleSearchIndex, searchSchedule } from "../../src/lib/schedule-search";
it("finds the effective published records once across multiple days, including work and location", () => {
  const c = operationsPreviewContext();
  const scope = { workspace_id: c.workspace.id, academic_year_id: c.year!.id, published_at: "2027-03-01T00:00:00Z", published_by: c.userId, change_note: "" };
  c.schoolPublications = [
    { ...scope, id: "cal", domain: "calendar", source_version: 1, starts_on: "2027-03-01", payload: { document: { ...defaultAnnual(c.grades), holidays: {} }, events: [{ id: "trip", title: "수학여행", department: "학생부", start_date: "2027-03-02", end_date: "2027-03-04", target_grades: [2] }], semesters: [], classes: [] } },
    { ...scope, id: "work", domain: "plans", source_version: 1, starts_on: "2027-03-01", payload: { business: [{ id: "meeting", date: "2027-03-05", department: "교무부", kind: "업무", text: "수학여행 협의", location: "회의실" }] } },
    { ...scope, id: "new-work", domain: "plans", source_version: 2, starts_on: "2027-03-04", payload: { business: [{ id: "meeting", date: "2027-03-05", department: "교무부", kind: "업무", text: "수학여행 정산", location: "회의실" }] } },
  ];
  const index = buildScheduleSearchIndex(c, "2027-03-01", "2027-03-07");
  expect(searchSchedule(index, "수학 여행")).toHaveLength(2);
  expect(searchSchedule(index, "학생부")[0]).toMatchObject({ from: "2027-03-02", to: "2027-03-04" });
  expect(searchSchedule(index, "회의실")[0].entry.title).toBe("수학여행 정산");
  expect(searchSchedule(index, "협의")).toEqual([]);
  expect(searchSchedule(index, "")).toEqual([]);
});

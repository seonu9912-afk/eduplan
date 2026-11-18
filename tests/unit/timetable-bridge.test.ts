import { describe, expect, it } from "vitest";
import { recoveryPreviewContext } from "../../src/app/recovery-preview/fixture";
import { newTimetableDocument, mergeTimetableDocument, legacyTimetableEvents, legacyTimetableSpace, timetableDocumentSchema } from "../../src/lib/timetable-bridge";

describe("official timetable legacy integration", () => {
  it("loads previous end-only configs and preserves new start-period settings", () => {
    const doc = newTimetableDocument(recoveryPreviewContext());
    const legacy = {...doc,timetableConfig:{periods:{1:7,2:7,3:7,4:7,5:6},lessons:[],unavailable:[]}};
    expect(timetableDocumentSchema.safeParse(legacy).success).toBe(true);
    const updated = {...legacy,timetableConfig:{...legacy.timetableConfig,starts:{1:3,2:1,3:1,4:1,5:1}}};
    expect(timetableDocumentSchema.parse(updated).timetableConfig?.starts?.["1"]).toBe(3);
  });
  const c = recoveryPreviewContext();
  it("uses real school class IDs and creates an empty timetable, not demo lessons", () => {
    const doc = newTimetableDocument(c);
    expect(doc.year).toBe(2027);
    expect(doc.classes.map((row) => row.id)).toEqual(c.classes.map((row) => row.id));
    expect(doc.weekly).toEqual([]);
    expect(doc.subjects.some((row) => row.kind === "creative_career")).toBe(true);
    expect(timetableDocumentSchema.safeParse(doc).success).toBe(true);
  });
  it("links official calendar event allocations without mutating the official annual plan", () => {
    const events = legacyTimetableEvents(c);
    expect(events).toContainEqual(expect.objectContaining({
      name: "진로 체험의 날", date: "2027-03-04", periodStart: 3, periodEnd: 4,
      gradeAreas: { "2": "진로" }, grades: [2], affectsTimetable: true,
    }));
    const space = legacyTimetableSpace(c, newTimetableDocument(c));
    expect(space.events).toHaveLength(events.length);
    expect(space.academics["2027"].weekly).toEqual([]);
  });
  it("merges new official classes and teachers without removing legacy saved timetable data", () => {
    const initial = newTimetableDocument(c);
    const preserved = {
      ...initial,
      teachers: [{ id: "teacher-old", label: "기존 교사" }],
      weekly: [{
        id: "wk-1", scope: "class" as const, scopeId: c.classes[0].id,
        weekday: 1, period: 3, subjectId: initial.subjects[0].id,
        teacherId: "teacher-old", room: "국어실",
      }],
    };
    const merged = mergeTimetableDocument(c, preserved);
    expect(merged.weekly).toEqual(preserved.weekly);
    expect(merged.teachers).toContainEqual({ id: "teacher-old", label: "기존 교사" });
    expect(merged.classes).toHaveLength(c.classes.length);
  });
  it("rejects invalid class hours and keeps each school year distinct", () => {
    const doc = newTimetableDocument(c);
    expect(timetableDocumentSchema.safeParse({ ...doc, weekly: [{
      id: "bad", scope: "class", scopeId: "x", weekday: 10, period: 13, subjectId: "x", teacherId: "", room: "",
    }] }).success).toBe(false);
    expect(timetableDocumentSchema.safeParse({ ...doc, year: 1990 }).success).toBe(false);
  });
});

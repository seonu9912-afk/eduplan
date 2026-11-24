import { describe, it, expect } from "vitest";
import { operationsPreviewContext } from "../../src/app/recovery-preview/operations-fixture";
import {
  staffingReport,
  emptyScenario,
  demandKey,
  staffInputSchema,
} from "../../src/lib/staffing";
import { curriculumTeachingTargets } from "../../src/lib/teaching-targets";
describe("shared staffing and cohort demand", () => {
  it("computes the requested 12-class / 48-hour example with 3 teachers and reductions", () => {
    const c = operationsPreviewContext(),
      row = staffingReport(c, 1).rows.find((x) => x.name === "국어")!;
    expect(row.totalWeekly).toBe(48);
    expect(row.staffCount).toBe(3);
    expect(row.average).toBe(16);
    expect(row.capacity).toBe(48);
    expect(row.shortage).toBe(0);
  });
  it("isolates simulation and term changes from source and saved snapshots", () => {
    const c = operationsPreviewContext(),
      original = JSON.stringify(c),
      id = c.subjects.find((s) => s.name === "국어")!.id;
    const scenario = {
      ...emptyScenario(),
      classCounts: { "1": 5 },
      weekly: { [demandKey(id, 2, 1)]: 5 },
      staffCounts: { [id]: 2 },
    };
    const row = staffingReport(c, 1, scenario).rows.find(
      (r) => r.subjectId === id,
    )!;
    expect(row.totalWeekly).toBe(56);
    expect(row.average).toBe(28);
    expect(
      staffingReport(c, 2, scenario).rows.find((r) => r.subjectId === id)!
        .totalWeekly,
    ).toBe(52);
    expect(JSON.stringify(c)).toBe(original);
  });
  it("does not multiply qualified teacher capacity across subjects or count inactive staff", () => {
    const c = operationsPreviewContext(),
      teacher = c.operations!.staff.find((t) => t.display_name === "김국어")!,
      math = c.subjects.find((s) => s.name === "수학")!;
    teacher.subject_ids.push(math.id);
    teacher.status = "휴직";
    const rows = staffingReport(c, 1).rows;
    expect(rows.find((r) => r.name === "국어")!.staffCount).toBe(2);
    expect(rows.find((r) => r.name === "수학")!.staffCount).toBe(2);
  });
  it("does not invent weekly hours by dividing totals by 16 or equating credits", () => {
    const c = operationsPreviewContext();
    c.operations!.designs = {};
    expect(
      staffingReport(c, 1).rows.find((r) => r.name === "국어")!.totalWeekly,
    ).toBe(0);
    c.plans.forEach((p) => (p.unit = "credits"));
    expect(staffingReport(c, 1).issues.join()).toContain("학점");
  });
  it("builds only positive operating-year targets, skips existing annual plans", () => {
    const c = operationsPreviewContext(),
      targets = curriculumTeachingTargets(c);
    expect(
      targets.some(
        (t) =>
          t.subjectName === "국어" &&
          t.grade === 2 &&
          t.semester === 1 &&
          t.exists,
      ),
    ).toBe(true);
    expect(targets.some((t) => t.subjectName === "노작원예")).toBe(false);
  });
  it("rejects reductions beyond target and unrelated primary subjects", () => {
    const c = operationsPreviewContext(),
      t = c.operations!.staff[0];
    expect(
      staffInputSchema.safeParse({ ...t, reduction_hours: 30 }).success,
    ).toBe(false);
    expect(staffInputSchema.safeParse({ ...t, subject_ids: [] }).success).toBe(
      false,
    );
  });
  it("includes elementary grade six instead of silently restricting the operating year to three grades", async () => {
    const { operationalPlan } = await import(
      "../../legacy/workspace/lib/curriculum.js"
    );
    const { legacyTimetableSpace, newTimetableDocument } = await import(
      "../../src/lib/timetable-bridge"
    );
    const c = operationsPreviewContext();
    c.grades = [1, 2, 3, 4, 5, 6];
    const original = c.plans[0],
      copy = { ...original, id: "sixth-plan", cohort_year: 2022 };
    c.plans.push(copy);
    c.classes.push({ ...c.classes[0], id: "sixth-class", grade: 6 });
    c.operations!.designs[copy.id] = {
      ...c.operations!.designs[original.id],
      cells: c
        .operations!.designs[original.id].cells.filter((x) => x.grade === 1)
        .map((x) => ({ ...x, grade: 6 })),
    };
    expect(
      staffingReport(c, 1).rows.find((r) => r.name === "국어")!.totalWeekly,
    ).toBe(52);
    expect(
      operationalPlan(
        legacyTimetableSpace(c, newTimetableDocument(c)).curricula,
        2027,
      ).grades.map((g: { grade: number }) => g.grade),
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

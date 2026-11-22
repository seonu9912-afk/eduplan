import { describe, expect, it } from "vitest";
import { curriculumPreviewContext, readCurriculumPreview } from "../../src/app/recovery-preview/curriculum-fixture";
import { evaluateCell, getCell, validateDocument, withTermWeeks } from "../../src/lib/curriculum-design";
import { schoolTypes } from "../../src/lib/domain";

describe("representative curriculum rehearsal data", () => {
  for (const school of schoolTypes) it(`${school} includes distinct subjects, activities and valid totals`, () => {
    const c = curriculumPreviewContext(school);
    const { document } = readCurriculumPreview(c, null);
    expect(c.groups.length).toBeGreaterThanOrEqual(9);
    expect(c.subjects.length).toBeGreaterThan(15);
    expect(new Set(c.subjects.map(subject => subject.id)).size).toBe(c.subjects.length);
    expect(validateDocument(c, document)).toEqual([]);
    expect(validateDocument(c, withTermWeeks(document, 2027, 1, { count: 17, status: "confirmed" }))).toEqual([]);
    for (const name of ["국어", "수학", "영어", "음악", "미술"]) {
      const subject = c.subjects.find(subject => subject.name === name)!;
      expect(subject).toBeDefined();
      const cells = document.cells.filter(cell => cell.subjectId === subject.id);
      expect(cells).toHaveLength(c.grades.length * 2);
      expect(cells.reduce((sum, cell) => sum + evaluateCell(document, cell).total, 0)).toBeGreaterThan(0);
    }
  });

  it("uses the school sheet's regular-term subjects and keeps sport/creative hours separate", () => {
    const c = curriculumPreviewContext("중학교");
    const { document } = readCurriculumPreview(c, null);
    for (const name of ["사회", "역사", "도덕", "기술·가정", "정보", "노작원예", "공예와 일상"])
      expect(c.subjects.some(subject => subject.name === name)).toBe(true);
    const sports = c.subjects.find(subject => subject.name === "학교스포츠클럽")!;
    expect(c.groups.find(group => group.id === sports.group_id)?.name).toBe("창의적 체험활동");
    expect(evaluateCell(document, getCell(document, sports.id, 1, 1)!).total).toBe(16);
    expect(document.cells.reduce((sum, cell) => sum + evaluateCell(document, cell).total, 0))
      .toBe(c.hours.reduce((sum, row) => sum + row.hours, 0));
  });

  it("adds missing subject rows without replacing saved Korean or aggregate creative inputs", () => {
    const c = curriculumPreviewContext("중학교");
    const old = readCurriculumPreview(c, null);
    const ids = ["d1500000-0000-4000-8000-000000000033", "d1500000-0000-4000-8000-000000000034"];
    old.document.cells = old.document.cells.filter(cell => ids.includes(cell.subjectId));
    old.document.excludedSubjectIds = [];
    old.document.cells[0] = { ...old.document.cells[0], weekly: 7, manual: 9,
      adjustments: [{ id: "saved", kind: "학교 행사", hours: -2 }] };
    old.document.cells.find(cell => cell.subjectId === ids[1])!.manual = 11;
    old.planVersion = 4; old.documentVersion = 3;
    const upgraded = readCurriculumPreview(c, JSON.stringify(old));
    for (const cell of old.document.cells) expect(upgraded.document.cells).toContainEqual(cell);
    expect(upgraded.document.cells.length).toBeGreaterThan(old.document.cells.length);
    expect(upgraded.planVersion).toBe(4);
    expect(upgraded.documentVersion).toBe(3);
    expect(validateDocument(c, upgraded.document)).toEqual([]);
  });
});

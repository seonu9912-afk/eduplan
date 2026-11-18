import { describe, expect, it } from "vitest";
import { Workbook } from "exceljs";
import { createEventExcelTemplate, parseEventExcel, eventImportChanges, EVENT_SHEET, PERIOD_SHEET } from "../../src/lib/event-excel";
import { defaultAnnual } from "../../src/lib/academic";
import { recoveryPreviewContext } from "../../src/app/recovery-preview/fixture";

const context = recoveryPreviewContext();
async function populatedWorkbook(options: { bad?: boolean; duplicate?: boolean; classOnly?: boolean } = {}) {
  const template = await createEventExcelTemplate(2027, [1, 2, 3]);
  const workbook = new Workbook();
  await workbook.xlsx.load(template as unknown as Buffer);
  const event = workbook.getWorksheet(EVENT_SHEET)!;
  const periods = workbook.getWorksheet(PERIOD_SHEET)!;
  event.addRow([
    "E001", "입학식", options.bad ? "" : "교무부", "2027-03-02", "2027-03-02",
    options.classOnly ? "2" : "", options.classOnly ? "2-1" : "", "1학기 행사",
  ]);
  periods.addRow(["E001", "2027-03-02", 5, 5, "자율·자치", ""]);
  if (options.duplicate) periods.addRow(["E001", "2027-03-02", 5, 5, "동아리", ""]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
describe("official event Excel bulk import", () => {
  it("generates a two-sheet fill-in template and rejects an empty upload", async () => {
    const bytes = await createEventExcelTemplate(2027, [1, 2, 3]);
    const book = new Workbook();
    await book.xlsx.load(bytes as unknown as Buffer);
    expect(book.getWorksheet(EVENT_SHEET)?.getCell("A1").text).toBe("행사번호");
    expect(book.getWorksheet(PERIOD_SHEET)?.getCell("E1").text).toBe("영역");
    const preview = await parseEventExcel(bytes, context, "양식.xlsx", () => "test-id");
    expect(preview.events).toHaveLength(0);
    expect(preview.errors).toContain("행사 목록 시트에 등록할 행사가 없습니다.");
  });
  it("imports one event with every grade selected and only the assigned period", async () => {
    const preview = await parseEventExcel(await populatedWorkbook(), context, "입학식.xlsx",
      () => "7f056292-9bd8-4927-82c9-1273479c5f16");
    expect(preview.errors).toEqual([]);
    expect(preview.events).toHaveLength(1);
    expect(preview.events[0].target_grades).toEqual([1, 2, 3]);
    expect(preview.events[0].slots["g:2"]["2027-03-02"][5]).toBe("자율·자치");
    const changes = eventImportChanges(preview.events, context, defaultAnnual(context.grades));
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("event");
    if (changes[0].kind === "event") {
      expect(changes[0].allocations).toHaveLength(3);
      expect(changes[0].allocations.every((row) => row.start === 5 && row.end === 5)).toBe(true);
    }
  });
  it("imports target classes without altering unrelated records", async () => {
    const preview = await parseEventExcel(await populatedWorkbook({classOnly:true}), context,
      "특정학급.xlsx", () => "abcfb1a5-a17b-4b4b-9479-c6d6c4c4e102");
    expect(preview.errors).toEqual([]);
    expect(preview.events[0].target_grades).toEqual([2]);
    expect(preview.events[0].target_class_ids).toHaveLength(1);
    const changes = eventImportChanges(preview.events, context, defaultAnnual(context.grades));
    if (changes[0].kind === "event") {
      expect(changes[0].allocations).toHaveLength(1);
      expect(changes[0].allocations[0].classId).toBe(preview.events[0].target_class_ids[0]);
    } else throw Error("Unexpected change kind");
  });
  it("reports missing required fields and repeated grade-date-period allocations", async () => {
    const bad = await parseEventExcel(await populatedWorkbook({bad:true}), context,
      "오류.xlsx", () => "uuid");
    expect(bad.errors.some((error) => error.includes("담당부서"))).toBe(true);
    const duplicates = await parseEventExcel(await populatedWorkbook({duplicate:true}), context,
      "중복.xlsx", () => "uuid");
    expect(duplicates.errors.some((error) => error.includes("중복 배정"))).toBe(true);
  });
});

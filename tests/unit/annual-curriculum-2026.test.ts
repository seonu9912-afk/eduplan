import {describe,expect,it} from "vitest";
import {Workbook} from "exceljs";
import {
  ANNUAL_2026_ROWS,ANNUAL_2026_COLUMNS,ANNUAL_2026_YEAR,
  sheetMergeInfo,sheetValue,changeSheetValue,SOURCE_2026_SUMMARY,
} from "../../src/lib/annual-curriculum-2026";
import {createAnnual2026WorkbookBytes} from "../../src/lib/annual-curriculum-2026-export";

describe("2026 operating-year curriculum: exact teacher-supplied A:Z sheet",()=>{
  it("preserves all 38 body rows and 26 columns in the teacher's order",()=>{
    expect(ANNUAL_2026_YEAR).toBe(2026);
    expect(ANNUAL_2026_COLUMNS).toBe(26);
    expect(ANNUAL_2026_ROWS).toHaveLength(38);
    expect(ANNUAL_2026_ROWS.map(row=>row.id).slice(0,13)).toEqual([
      "korean","social","history","ethics","math","science","technology",
      "informatics","physical","music","art","english","choir",
    ]);
    expect(ANNUAL_2026_ROWS.map(row=>row.id).slice(-6)).toEqual([
      "freeChoice","freeCareer","freeTotal","grandTotal","semesterHours","semesterSubjects",
    ]);
    expect(new Set(ANNUAL_2026_ROWS.map(row=>row.id)).size).toBe(38);
    expect(ANNUAL_2026_ROWS.every(row=>Object.keys(row.cells).every(col=>Number(col)>=4&&Number(col)<=26))).toBe(true);
  });
  it("preserves the published numbers, minus values, 0 and intentional empty cells",()=>{
    const v=(id:string,col:number)=>sheetValue(id,col);
    expect([4,5,6,7,8,9,10,13,14,15,19,20,23,26].map(col=>v("korean",col)))
      .toEqual(["442","288","-154","272","-170","48","3","32","-16","2","48","3","48","3"]);
    expect(v("history",4)).toBe("");
    expect(v("history",5)).toBe("128");
    expect(v("ethics",14)).toBe("-16");
    expect(v("gardening",13)).toBe("16");
    expect(v("gardening",14)).toBe("-16");
    expect(v("woodwork",14)).toBe("-32");
    expect(v("schoolAutonomyTotal",11)).toBe("32");
    expect(v("schoolAutonomyTotal",12)).toBe("2");
    expect(v("schoolAutonomyTotal",9)).toBe("0");
    expect(v("practical",11)).toBe("32");
    expect(v("sewing",5)).toBe("");
    expect(v("volunteer",23)).toBe("5");
    expect(v("volunteer",24)).toBe("0.3");
    expect(v("semesterSubjects",9)).toBe("8(+7)");
    expect(v("semesterSubjects",13)).toBe("7(+6)");
  });
  it("retains contradictory source totals without recalculation",()=>{
    expect(sheetValue("grandTotal",4)).toBe("3,366");
    expect(sheetValue("grandTotal",5)).toBe("3168");
    expect(sheetValue("grandTotal",7)).toBe("3136");
    expect(sheetValue("grandTotal",9)).toBe("528");
    expect(sheetValue("semesterHours",9)).toBe("528");
    expect(SOURCE_2026_SUMMARY.warning).toContain("자동 보정하지 않습니다");
  });
  it("builds merged section and group cells without changing sheet order",()=>{
    expect(sheetMergeInfo(0)).toEqual({
      categoryLabel:"교과\n(군)",categorySpan:23,groupLabel:"국어",groupSpan:1,
    });
    expect(sheetMergeInfo(1).groupSpan).toBe(3);
    expect(sheetMergeInfo(2).groupLabel).toBeUndefined();
    expect(sheetMergeInfo(12).groupSpan).toBe(11);
    expect(sheetMergeInfo(23)).toEqual({});
    expect(sheetMergeInfo(26).categorySpan).toBe(5);
    expect(sheetMergeInfo(32).categorySpan).toBe(2);
  });
  it("edits blank and populated cells without modifying the original fixture",()=>{
    const edits=changeSheetValue({},"korean",10,"4");
    expect(sheetValue("korean",10,edits)).toBe("4");
    expect(sheetValue("korean",10)).toBe("3");
    const updated=changeSheetValue(edits,"history",4,"510");
    expect(sheetValue("history",4,updated)).toBe("510");
    expect(sheetValue("history",4)).toBe("");
    expect(changeSheetValue(updated,"korean",10,"3")["korean:10"]).toBeUndefined();
    expect(()=>changeSheetValue({},"unknown",5,"1")).toThrow();
    expect(()=>changeSheetValue({},"korean",3,"1")).toThrow();
  });
  it("exports a genuinely editable numerical XLSX with the same headers and merged groups",async()=>{
    const overrides=changeSheetValue({},"korean",10,"4");
    const bytes=await createAnnual2026WorkbookBytes(overrides);
    const book=new Workbook();
    await book.xlsx.load(bytes as unknown as Parameters<Workbook["xlsx"]["load"]>[0]);
    const sheet=book.getWorksheet("2026 당해연도 교육과정")!;
    expect(sheet).toBeTruthy();
    expect(sheet.getCell("A1").value).toBe("구분");
    expect(sheet.getCell("I1").value).toBe("1학년\n(2026년 적용)");
    expect(sheet.getCell("D4").value).toBe(442);
    expect(sheet.getCell("J4").value).toBe(4);
    expect(sheet.getCell("N4").value).toBe(-16);
    expect(sheet.getCell("A5").value).toBe("교과\n(군)");
    const grand=ANNUAL_2026_ROWS.findIndex(row=>row.id==="grandTotal")+4;
    expect(sheet.getCell(grand,7).value).toBe(3136);
    expect(sheet.getCell(grand,4).value).toBe(3366);
    expect(sheet.rowCount).toBe(ANNUAL_2026_ROWS.length+3);
    expect(sheet.getCell(4,10).value).not.toBe(sheetValue("korean",10));
  });
});

import {describe,expect,it} from "vitest";
import {Workbook} from "exceljs";
import {recoveryPreviewContext} from "../../src/app/recovery-preview/fixture";
import {exportCurriculumWorkbook} from "../../src/lib/curriculum-export";
import {initializeDesign,withWeeklyHours,evaluateCell,getCell} from "../../src/lib/curriculum-design";
import {parseCurriculumExcel} from "../../src/lib/curriculum-excel";

describe("curriculum downloadable workbooks",()=>{
  const c=recoveryPreviewContext();
  const plan=c.plans[0];
  if(!plan)throw Error("Recovery fixture must include a curriculum cohort plan");
  const source=initializeDesign(c,plan);
  const doc=withWeeklyHours(source,c.subjects[0].id,1,1,3);
  const documents={[plan.id]:doc};
  const args={context:c,view:"cohort" as const,cohort:plan.cohort_year,documents};

  it("exports school-style workbook using the parser's original grid coordinates",async()=>{
    const bytes=await exportCurriculumWorkbook({...args,layout:"classic"});
    const wb=new Workbook();
    await wb.xlsx.load(bytes as unknown as Parameters<Workbook["xlsx"]["load"]>[0]);
    const sheet=wb.getWorksheet("원본형 편성표")!;
    expect(String(sheet.getCell("A1").value)).toContain("신입생 3개년 교육과정 편성표");
    expect(sheet.getCell("D3").value).toBe("기준\n시수");
    expect(sheet.getCell("C6").value).toBe(c.subjects[0].name);
    expect(sheet.getCell("J6").value).toBe(3);
    expect(sheet.getCell("I6").value).toBe(48);
    const parsed=await parseCurriculumExcel(bytes,"EduPlan_원본형.xlsx");
    expect(parsed.errors).toEqual([]);
    expect(parsed.courses.some((row)=>row.name===c.subjects[0].name)).toBe(true);
  });
  it("exports modern semester detail without changing the underlying source",async()=>{
    const before=JSON.stringify(doc);
    const bytes=await exportCurriculumWorkbook({...args,layout:"modern"});
    const wb=new Workbook();
    await wb.xlsx.load(bytes as unknown as Parameters<Workbook["xlsx"]["load"]>[0]);
    const sheet=wb.getWorksheet("학기별 시수")!;
    expect(sheet.getCell("A1").value).toBe("교과군");
    expect(sheet.getCell("B2").value).toBe(c.subjects[0].name);
    expect(sheet.getCell("C2").value).toBe(3);
    expect(sheet.getCell("D2").value).toBe(16);
    expect(sheet.getCell("F2").value).toBe(
      evaluateCell(doc,getCell(doc,c.subjects[0].id,1,1)!).total
    );
    expect(JSON.stringify(doc)).toBe(before);
  });
});

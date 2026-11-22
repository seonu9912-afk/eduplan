import {describe,expect,it} from "vitest";
import {Workbook} from "exceljs";
import {recoveryPreviewContext} from "../../src/app/recovery-preview/fixture";
import {exportCurriculumWorkbook} from "../../src/lib/curriculum-export";
import {initializeDesign,withWeeklyHours,withSubjectExcluded,evaluateCell,getCell,withTermWeeks,withFinalHours} from "../../src/lib/curriculum-design";
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
  it("omits subjects excluded by this cohort while keeping its source data",async()=>{
    const unused=c.subjects[1];
    const cleared={...doc,cells:doc.cells.map(cell=>
      cell.subjectId===unused.id?{...cell,weekly:0,manual:0,adjustments:[]}:cell)};
    const changed=withSubjectExcluded(cleared,unused.id,true);
    const bytes=await exportCurriculumWorkbook({...args,
      documents:{[plan.id]:changed},layout:"modern"});
    const wb=new Workbook();
    await wb.xlsx.load(bytes as unknown as Parameters<Workbook["xlsx"]["load"]>[0]);
    const sheet=wb.getWorksheet("학기별 시수")!;
    const values=(sheet.getColumn(2).values??[]).map(cell=>String(cell??""));
    expect(values).not.toContain(unused.name);
    expect(source.cells.some(cell=>cell.subjectId===unused.id)).toBe(true);
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
  it("exports the actual term-specific weeks with the matching total",async()=>{
    const changed=withTermWeeks(doc,plan.cohort_year,1,{count:17,status:"confirmed"});
    const wb=new Workbook();
    await wb.xlsx.load(await exportCurriculumWorkbook({...args,documents:{[plan.id]:changed},layout:"modern"}) as never);
    const sheet=wb.getWorksheet("학기별 시수")!;
    expect(sheet.getCell("D2").value).toBe(17);
    expect(sheet.getCell("F2").value).toBe(51);
    expect(sheet.getCell("H2").value).toBe(16);
  });
  for(const layout of ["classic","modern"] as const){
    it(`exports all twelve elementary semesters in ${layout} layout`,async()=>{
      const context={...c,schoolType:"초등학교" as const,grades:[1,2,3,4,5,6]};
      const elementary=withFinalHours(initializeDesign(context,plan),c.subjects[0].id,6,2,77);
      const wb=new Workbook();
      await wb.xlsx.load(await exportCurriculumWorkbook({...args,context,documents:{[plan.id]:elementary},layout}) as never);
      const sheet=wb.getWorksheet(layout==="classic"?"원본형 편성표":"학기별 시수")!;
      expect(sheet.getCell(1,50).value).toBe("6학년 2학기 최종");
      expect(sheet.getCell(2,50).value).toBe(77);
      expect(sheet.getCell(2,51).value).toBe(elementary.cells.filter(x=>x.subjectId===c.subjects[0].id)
        .reduce((sum,x)=>sum+evaluateCell(elementary,x).total,0));
    });
    it(`keeps high-school credits separate from weekly hours in ${layout} layout`,async()=>{
      const creditPlan={...plan,unit:"credits"};
      const context={...c,schoolType:"고등학교" as const,plans:[creditPlan],hours:[]};
      const creditDoc=withFinalHours(initializeDesign(context,creditPlan),c.subjects[0].id,1,1,4);
      const wb=new Workbook();
      await wb.xlsx.load(await exportCurriculumWorkbook({...args,context,documents:{[plan.id]:creditDoc},layout}) as never);
      const sheet=wb.getWorksheet(layout==="classic"?"원본형 편성표":"학기별 시수")!;
      expect(sheet.getCell("C1").value).toBe("1학년 1학기 학점");
      expect(sheet.getCell("C2").value).toBe(4);
      expect(sheet.getCell("I2").value).toBe(4);
      expect(JSON.stringify(sheet.getRow(1).values)).not.toContain("주당");
    });
  }
});

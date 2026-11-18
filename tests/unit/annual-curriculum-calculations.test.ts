import {describe,expect,it} from "vitest";
import {Workbook} from "exceljs";
import {
  ANNUAL_2026_ROWS,orderedSheetRows,sheetMergeInfo,
  type Annual2026CustomRow,
} from "../../src/lib/annual-curriculum-2026";
import {
  ANNUAL_2026_WEEKS,calculateAnnual2026Sheet,calculatedAnnualCell,
  editAnnual2026Cell,editableAnnualCell,insertAnnualSubject,removeAnnualSubject,
  updateAnnualSubjectName,
} from "../../src/lib/annual-curriculum-calculations";
import {createAnnual2026WorkbookBytes} from "../../src/lib/annual-curriculum-2026-export";

const baseline={edits:{},rows:[] as Annual2026CustomRow[]};
function display(sheet:typeof baseline,id:string,col:number){
  const calculated=calculateAnnual2026Sheet(sheet);
  const row=calculated.rows.find(item=>item.id===id);
  if(!row)throw Error("Missing "+id);
  return calculatedAnnualCell(calculated,row,col,sheet.edits);
}
const id1="extra11111111111111111111111111111111";
const id2="extra22222222222222222222222222222222";
describe("2026 live Excel-style curriculum calculations",()=>{
  it("preserves source numbers before changes and uses 16-week semester baseline",()=>{
    expect(ANNUAL_2026_WEEKS).toBe(16);
    expect(display(baseline,"math",9)).toBe("32");
    expect(display(baseline,"math",10)).toBe("2");
    expect(display(baseline,"grandTotal",7)).toBe("3136");
    expect(display(baseline,"grandTotal",8)).toBe("-342");
  });
  it("weekly hour change recalculates semester, subject, group difference and totals",()=>{
    const edits=editAnnual2026Cell(baseline,"math",10,"3");
    const sheet={edits,rows:[]};
    expect(display(sheet,"math",9)).toBe("48");
    expect(display(sheet,"math",10)).toBe("3");
    expect(display(sheet,"math",5)).toBe("208");
    expect(display(sheet,"math",7)).toBe("208");
    expect(display(sheet,"math",6)).toBe("-166");
    expect(display(sheet,"math",8)).toBe("-166");
    expect(display(sheet,"subjectTotal",5)).toBe("2800");
    expect(display(sheet,"subjectTotal",7)).toBe("2688");
    expect(display(sheet,"grandTotal",5)).toBe("3184");
    expect(display(sheet,"grandTotal",7)).toBe("3152");
    expect(display(baseline,"math",10)).toBe("2");
  });
  it("editing semester total updates its weekly hours",()=>{
    const sheet={...baseline,edits:editAnnual2026Cell(baseline,"science",9,"48")};
    expect(display(sheet,"science",10)).toBe("3");
    expect(display(sheet,"science",5)).toBe("208");
    expect(display(sheet,"science",6)).toBe("-216");
  });
  it("free-semester adjustment links ordinary hours, reduced hours and weekly hours",()=>{
    const hours=editAnnual2026Cell(baseline,"korean",14,"-32");
    let sheet={...baseline,edits:hours};
    expect(display(sheet,"korean",13)).toBe("16");
    expect(display(sheet,"korean",15)).toBe("1");
    expect(display(sheet,"korean",7)).toBe("256");
    expect(display(sheet,"subjectTotal",7)).toBe("2656");
    expect(display(sheet,"grandTotal",7)).toBe("3120");
    const next=editAnnual2026Cell(sheet,"korean",10,"4");
    sheet={...baseline,edits:next};
    expect(display(sheet,"korean",9)).toBe("64");
    expect(display(sheet,"korean",13)).toBe("32");
    expect(display(sheet,"korean",14)).toBe("-32");
  });
  it("converts fractional weekly creative activity into whole semester hours",()=>{
    const sheet={...baseline,edits:editAnnual2026Cell(baseline,"club",10,"1.4")};
    expect(display(sheet,"club",9)).toBe("22");
    expect(display(sheet,"club",5)).toBe("117");
    expect(display(sheet,"creativeTotal",5)).toBe("385");
    expect(display(sheet,"grandTotal",5)).toBe("3169");
  });
  it("free-semester activities do not turn into adjustment N by mistake",()=>{
    const sheet={...baseline,edits:editAnnual2026Cell(baseline,"freeChoice",15,"6")};
    expect(display(sheet,"freeChoice",13)).toBe("96");
    expect(display(sheet,"freeChoice",14)).toBe("");
    expect(display(sheet,"freeChoice",7)).toBe("96");
    expect(display(sheet,"freeTotal",7)).toBe("128");
    expect(display(sheet,"grandTotal",7)).toBe("3152");
  });
  it("group national standard hours are edited only on the group header and recalculate differences",()=>{
    const edits=editAnnual2026Cell(baseline,"social",4,"500");
    const sheet={edits,rows:[]};
    expect(display(sheet,"social",6)).toBe("-180");
    expect(display(sheet,"social",8)).toBe("-196");
    const rows=orderedSheetRows([]);
    expect(editableAnnualCell(rows.find(r=>r.id==="social")!,4,rows)).toBe(true);
    expect(editableAnnualCell(rows.find(r=>r.id==="history")!,4,rows)).toBe(false);
    expect(editableAnnualCell(rows.find(r=>r.id==="social")!,5,rows)).toBe(false);
  });
  it("inserts a subject directly beneath its own group, without moving other groups",()=>{
    const last=ANNUAL_2026_ROWS.find(row=>row.id==="practical")!;
    let custom=insertAnnualSubject([],last,id1);
    custom=updateAnnualSubjectName(custom,id1,"새로운 선택과목");
    const rows=orderedSheetRows(custom);
    expect(rows.findIndex(row=>row.id===id1)).toBe(rows.findIndex(row=>row.id==="practical")+1);
    expect(rows.findIndex(row=>row.id===id1)).toBe(rows.findIndex(row=>row.id==="schoolAutonomyTotal")-1);
    expect(sheetMergeInfo(12,rows).groupSpan).toBe(12);
    const edits=editAnnual2026Cell({edits:{},rows:custom},id1,10,"2");
    const sheet={edits,rows:custom};
    expect(display(sheet,id1,9)).toBe("32");
    expect(display(sheet,id1,5)).toBe("32");
    expect(display(sheet,"choir",6)).toBe("598");
    expect(display(sheet,"subjectTotal",5)).toBe("2816");
    expect(display(sheet,"grandTotal",5)).toBe("3200");
    const removed=removeAnnualSubject(custom,edits,id1);
    expect(removed.rows).toHaveLength(0);
    expect(Object.keys(removed.edits)).not.toContain(id1+":10");
  });
  it("supports more than one inserted row, with stable order and column alignment",()=>{
    let rows=insertAnnualSubject([],ANNUAL_2026_ROWS.find(row=>row.id==="practical")!,id1);
    const after=orderedSheetRows(rows).find(row=>row.id===id1)!;
    rows=insertAnnualSubject(rows,after,id2);
    const ordered=orderedSheetRows(rows);
    expect(ordered.map(row=>row.id).slice(22,25)).toEqual(["practical",id1,id2]);
    expect(sheetMergeInfo(12,ordered).groupSpan).toBe(13);
    const deleted=removeAnnualSubject(rows,{},id1);
    expect(orderedSheetRows(deleted.rows).some(row=>row.id===id2)).toBe(true);
  });
  it("preserves subject rows and linked calculations in Excel export",async()=>{
    const added=updateAnnualSubjectName(insertAnnualSubject([],
      ANNUAL_2026_ROWS.find(row=>row.id==="practical")!,id1),id1,"표에서 추가한 교과목");
    const edits=editAnnual2026Cell({edits:{},rows:added},id1,10,"2");
    const bytes=await createAnnual2026WorkbookBytes(edits,added);
    const workbook=new Workbook();
    await workbook.xlsx.load(bytes as unknown as Parameters<Workbook["xlsx"]["load"]>[0]);
    const sheet=workbook.getWorksheet("2026 당해연도 교육과정")!;
    const row=orderedSheetRows(added).findIndex(item=>item.id===id1)+4;
    expect(sheet.getCell(row,3).value).toBe("표에서 추가한 교과목");
    expect(sheet.getCell(row,9).value).toBe(32);
    expect(sheet.getCell(row,5).value).toBe(32);
    const grand=orderedSheetRows(added).findIndex(item=>item.id==="grandTotal")+4;
    expect(sheet.getCell(grand,5).value).toBe(3200);
    expect(sheet.rowCount).toBe(42);
  });
});

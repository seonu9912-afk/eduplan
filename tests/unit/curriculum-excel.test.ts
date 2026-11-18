import {describe,expect,it} from "vitest";
import {Workbook} from "exceljs";
import {parseCurriculumExcel} from "../../src/lib/curriculum-excel";

async function fixture(kind:"cohort"|"operating"){
 const book=new Workbook(),sheet=book.addWorksheet("Sheet1");
 sheet.getCell("A1").value=kind==="cohort"
  ?"2026학년도 신입생 3개년 교육과정 편성표"
  :"2026학년도 당해연도 3개년 교육과정 편성표";
 sheet.getCell("D3").value="기준\n시수";
 sheet.getCell("A6").value="교과\n(군)";
 sheet.getCell("B6").value="국어";
 sheet.getCell("C6").value="국어";
 sheet.getCell("D6").value=442;
 sheet.getCell("I6").value=48;
 sheet.getCell("J6").value=3;
 sheet.getCell("M6").value=32;
 sheet.getCell("N6").value=-16;
 sheet.getCell("O6").value=2;
 sheet.getCell("K6").value=48;
 sheet.getCell("L6").value=3;
 sheet.getCell("P6").value=0;
 sheet.getCell("Q6").value=0;
 sheet.getCell("R6").value=0;
 sheet.getCell("S6").value=48;
 sheet.getCell("T6").value=3;
 sheet.getCell("U6").value=48;
 sheet.getCell("V6").value=3;
 sheet.getCell("W6").value=48;
 sheet.getCell("X6").value=3;
 sheet.getCell("Y6").value=48;
 sheet.getCell("Z6").value=3;
 sheet.getCell("A32").value="창의적\n체험\n활동";
 sheet.getCell("B32").value="동아리활동";
 sheet.getCell("C32").value="동아리 활동";
 sheet.getCell("I32").value=21;
 sheet.getCell("J32").value=1.3;
 sheet.getCell("K32").value=21;
 sheet.getCell("L32").value=1.3;
 sheet.getCell("A38").value="3개년 시수 총계";
 sheet.getCell("D38").value=3366;
 sheet.getCell("G38").value=kind==="cohort"?3168:3136;
 sheet.getCell("I38").value=528;
 return new Uint8Array(await book.xlsx.writeBuffer());
}
describe("actual 2026-form curriculum workbook recognition",()=>{
 it("recognizes cohort years, merged-header style and free-semester adjustments",async()=>{
  const data=await parseCurriculumExcel(await fixture("cohort"),"2026 신입생.xlsx");
  expect(data.errors).toEqual([]);
  expect(data.kind).toBe("cohort");
  expect(data.year).toBe(2026);
  const language=data.courses.find((course)=>course.name==="국어")!;
  expect(language.group).toBe("국어");
  const spring=language.terms.find((term)=>term.grade===1&&term.semester===1)!;
  expect(spring.weekly).toBe(3);
  expect(spring.adjustment).toBe(-16);
  expect(spring.final).toBe(32);
  const second=language.terms.find((term)=>term.grade===1&&term.semester===2)!;
  expect(second.final).toBe(48);
  expect(second.weekly).toBe(3);
  expect(language.terms).toHaveLength(6);
 });
 it("keeps source totals and recognizes creative activity weekly rounded display",async()=>{
  const data=await parseCurriculumExcel(await fixture("operating"),"2026 당해.xlsx");
  expect(data.errors).toEqual([]);
  expect(data.kind).toBe("operating");
  expect(data.sourceTotals.reference).toBe(3366);
  expect(data.sourceTotals.planned).toBe(3136);
  expect(data.warnings.some((message)=>message.includes("원본 총계"))).toBe(true);
  const club=data.courses.find((course)=>course.name==="동아리 활동")!;
  expect(club.originalCategory).toBe("창체");
  expect(club.group).toBe("창의적 체험활동");
  expect(club.terms[0].weekly).toBe(1.3125);
  expect(club.terms[0].final).toBe(21);
 });
 it("rejects workbooks with an unrecognized curriculum grid",async()=>{
  const book=new Workbook();
  book.addWorksheet("Sheet1").getCell("A1").value="일반 가계부";
  const data=await parseCurriculumExcel(new Uint8Array(await book.xlsx.writeBuffer()),"wrong.xlsx");
  expect(data.errors.length).toBeGreaterThan(0);
 });
});

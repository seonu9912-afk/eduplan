import type { Workbook, Cell, Worksheet } from "exceljs";

export type ImportTerm = {
  grade:number;semester:number;weekly:number;final:number;
  adjustment:number;reportedWeekly:number|null;sourceTotal:number|null;
};
export type ImportCourse = {
  row:number;group:string;name:string;terms:ImportTerm[];
  originalCategory:"교과"|"창체"|"자유학기";nationalHours:number|null;
};
export type ImportPreview = {
  kind:"cohort"|"operating";
  year:number;title:string;filename:string;courses:ImportCourse[];
  warnings:string[];errors:string[];sourceTotals:{reference:number|null;planned:number|null};
};
export const CURRICULUM_XLSX_MAX_BYTES=2*1024*1024;
export function sourceCellText(cell:Cell):string {
  const value:unknown=cell.value;
  if(value==null)return "";
  if(typeof value==="number"||typeof value==="string")return String(value).trim();
  if(value instanceof Date)return value.toISOString().slice(0,10);
  if(typeof value==="object"){
    const x=value as {formula?:string;result?:unknown;text?:string;richText?:{text:string}[]};
    if(x.result!==undefined&&x.result!==null)return String(x.result).trim();
    if(x.text)return x.text.trim();
    if(x.richText)return x.richText.map((item)=>item.text).join("").trim();
  }
  return "";
}
function asNumber(cell:Cell):number|null {
  const value=sourceCellText(cell).replace(/,/g,"").trim();
  if(!value)return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
const idx=(a:number)=>a; // one-based ExcelJS column numbers
function termsForRow(sheet:Worksheet,row:number, warnings:string[]):ImportTerm[]{
  const specs=[
    {grade:1,semester:1,total:9,weekly:10,adjust:14,free:13,freeWeekly:15},
    {grade:1,semester:2,total:11,weekly:12,adjust:17,free:16,freeWeekly:18},
    {grade:2,semester:1,total:19,weekly:20},
    {grade:2,semester:2,total:21,weekly:22},
    {grade:3,semester:1,total:23,weekly:24},
    {grade:3,semester:2,total:25,weekly:26},
  ];
  const output:ImportTerm[]=[];
  for(const spec of specs){
    const base=asNumber(sheet.getCell(row,idx(spec.total)));
    const reportedWeekly=asNumber(sheet.getCell(row,idx(spec.weekly)));
    const free=spec.free?asNumber(sheet.getCell(row,idx(spec.free))):null;
    const adj=spec.adjust?asNumber(sheet.getCell(row,idx(spec.adjust)))??0:0;
    const freeWeekly=spec.freeWeekly?asNumber(sheet.getCell(row,idx(spec.freeWeekly))):null;
    if(base===null&&reportedWeekly===null&&free===null&&freeWeekly===null&&adj===0)continue;
    const originalBase=base??(free!==null?free-adj:reportedWeekly!==null?reportedWeekly*16:0);
    const expectedFinal=originalBase+adj;
    // The school's workbook populates the free-semester second-term cells
    // with zero even when an ordinary second semester has 48 hours.
    // A zero without a free-semester adjustment is a placeholder, not a
    // replacement for a nonzero regular-semester hour allocation.
    const isFreeTerm=free!==null&&(free!==0||adj!==0||base===null);
    const final=isFreeTerm?free:expectedFinal;
    const derived=originalBase/16;
    const weekly=Number.isFinite(derived)?Number(derived.toFixed(6)):0;
    if(isFreeTerm&&Math.abs(free-expectedFinal)>0.001){
      warnings.push(row+"행 "+spec.grade+"학년 "+spec.semester+"학기: 자유학기제 값 "+free+
        "시간과 기본/조정 합계 "+expectedFinal+"시간이 다릅니다.");
    }
    if(reportedWeekly!==null && Math.abs(reportedWeekly-weekly)>0.05){
      warnings.push(row+"행 "+spec.grade+"학년 "+spec.semester+"학기: 주당 시수 표시("+
        reportedWeekly+")와 실제 총시수/16("+weekly+")가 다릅니다.");
    }
    if(Math.abs(final-Math.round(final))>0.001){
      warnings.push(row+"행: 계산된 학기 총시수가 정수가 아닙니다. 적용 전에 확인하세요.");
    }
    output.push({
      grade:spec.grade,semester:spec.semester,weekly,final:Number(final.toFixed(4)),
      adjustment:adj,reportedWeekly,sourceTotal:base,
    });
  }
  return output;
}
export async function parseCurriculumExcel(bytes:Uint8Array,filename:string):Promise<ImportPreview>{
  const result:ImportPreview={
    kind:"cohort",year:0,title:"",filename,courses:[],warnings:[],errors:[],
    sourceTotals:{reference:null,planned:null},
  };
  if(bytes.byteLength>CURRICULUM_XLSX_MAX_BYTES){
    result.errors.push("2MB 이하의 엑셀 파일을 사용해 주세요.");return result;
  }
  let wb:Workbook;
  try{
    const {Workbook:ExcelWorkbook}=await import("exceljs");
    wb=new ExcelWorkbook();
    await wb.xlsx.load(bytes as unknown as Parameters<Workbook["xlsx"]["load"]>[0]);
  }catch{
    result.errors.push("엑셀 파일을 읽지 못했습니다. .xlsx 형식을 확인해 주세요.");return result;
  }
  const sheet=wb.worksheets[0];
  if(!sheet){result.errors.push("첫 번째 시트가 없습니다.");return result;}
  const title=sourceCellText(sheet.getCell("A1"));
  const year=Number(title.match(/20\d{2}/)?.[0]??0);
  result.kind=/당해연도/.test(title)?"operating":"cohort";
  result.year=year;result.title=title;
  if(!year||!/교육과정.*편성표/.test(title)){
    result.errors.push("신입생 3개년 또는 당해연도 교육과정 편성표인지 확인해 주세요.");return result;
  }
  if(sourceCellText(sheet.getCell("D3")).replace(/\s/g,"")!=="기준시수"){
    result.errors.push("편성표의 다단 머리글 구조를 확인하지 못했습니다.");return result;
  }
  let category:ImportCourse["originalCategory"]="교과";
  let group="";
  for(let row=6;row<=Math.min(sheet.rowCount,100);row++){
    const a=sourceCellText(sheet.getCell(row,1)).replace(/\s/g,"");
    const b=sourceCellText(sheet.getCell(row,2)).replace(/\s/g," ");
    const c=sourceCellText(sheet.getCell(row,3)).replace(/\s/g," ");
    if(/창의적체험활동/.test(a))category="창체";
    if(/자유학기활동/.test(a))category="자유학기";
    if(/총계|학기당|3개년시수/.test(a))break;
    if(!b&&!c)continue;
    if(/합계|총계|학기당|교과시수/.test(b)||/합계|총계/.test(c))continue;
    if(category==="교과"){
      if(b)group=b;
    }else group=category==="창체"?"창의적 체험활동":"자유학기 활동";
    const name=c||category!=="교과"&&b||"";
    if(!name||!group)continue;
    const terms=termsForRow(sheet,row,result.warnings);
    const nationalHours=asNumber(sheet.getCell(row,4));
    const hasData=terms.length>0||asNumber(sheet.getCell(row,5))!==null||
      asNumber(sheet.getCell(row,7))!==null;
    if(!hasData)continue;
    if(result.courses.some((course)=>course.group===group&&course.name===name)){
      result.errors.push(row+"행: 같은 교과군에 동일한 과목명이 중복되어 있습니다.");continue;
    }
    result.courses.push({row,group,name,terms,originalCategory:category,nationalHours});
  }
  const totalRow=result.kind==="operating"
    ? [...Array(75)].map((_,i)=>i+6).find((row)=>/3개년시수총계/.test(sourceCellText(sheet.getCell(row,1)).replace(/\s/g,"")))
    : [...Array(75)].map((_,i)=>i+6).find((row)=>/3개년시수총계/.test(sourceCellText(sheet.getCell(row,1)).replace(/\s/g,"")));
  if(totalRow){
    result.sourceTotals.reference=asNumber(sheet.getCell(totalRow,4));
    result.sourceTotals.planned=asNumber(sheet.getCell(totalRow,7));
    const firstSemester=asNumber(sheet.getCell(totalRow,9));
    if(result.kind==="operating"&&firstSemester!==null &&
      result.sourceTotals.planned!==null&&Math.abs(firstSemester*6-result.sourceTotals.planned)>0.001)
      result.warnings.push("원본 총계 "+result.sourceTotals.planned+"시간과 학기당 "+
        firstSemester+"시간 × 6학기의 합계가 다릅니다. 원본 값을 보존하고 확인해 주세요.");
  }
  if(!result.courses.length)result.errors.push("교과목·활동 행을 인식하지 못했습니다.");
  if(result.courses.length>120)result.errors.push("한 번에 120개 과목 이하를 가져올 수 있습니다.");
  return result;
}

import type { Workbook as ExcelWorkbook } from "exceljs";
import {annualSchema,type AnnualPlan} from "./academic";
import {operationNames,workItemChoice} from "./work-operation-items";
export const WORK_FIELDS=["date","department","text","time","location","participants","kind"] as const;
export const WORK_HEADERS=["날짜","부서","일정 내용","시간","장소","대상·참석자","구분"] as const;
export type WorkField=typeof WORK_FIELDS[number];
export type WorkInput=Record<WorkField,string>;
export const emptyWorkInput=():WorkInput=>({date:"",department:"",text:"",time:"",location:"",participants:"",kind:""});
export const WORK_LIMIT=300;
export function normalizeWorkDate(raw:string){
 const v=raw.trim(),m=/^(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})(?:[.일])?$/.exec(v);
 if(m)return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
 if(/^\d{5}$/.test(v)&&Number(v)>30000&&Number(v)<80000)return new Date(Date.UTC(1899,11,30)+Number(v)*86400000).toISOString().slice(0,10);
 return v;
}
export function parseWorkClipboard(raw:string){
 const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;
 for(let i=0;i<raw.length;i++){const ch=raw[i];
 if(ch==='"'&&(quoted||cell==="")){if(quoted&&raw[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
 else if(ch==="\t"&&!quoted){row.push(cell);cell="";}
 else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&raw[i+1]==="\n")i++;row.push(cell);rows.push(row);row=[];cell="";}
 else cell+=ch;}
 if(quoted)throw Error("따옴표가 닫히지 않은 데이터입니다.");
 if(row.length||cell){row.push(cell);rows.push(row);}
 return rows;
}
export function workRowsFromMatrix(matrix:string[][]){
 const rows=matrix[0]?.map(x=>x.trim()).join("\t")===WORK_HEADERS.join("\t")?matrix.slice(1):matrix;
 if(rows.length>WORK_LIMIT||rows.some(r=>r.length>7))throw Error("최대 300행, 지정된 7개 열을 사용하세요.");
 return rows.map(cells=>Object.fromEntries(WORK_FIELDS.map((field,i)=>[field,field==="date"?normalizeWorkDate(cells[i]??""):cells[i]??""])) as WorkInput);
}
export function reviewWorkBatch(input:WorkInput[],plan:AnnualPlan,start:string,end:string,defaultDepartment:string,defaultDate:string){
 const errors:{row:number;message:string}[]=[],duplicates:number[]=[],items:AnnualPlan["business"]=[];
 const signature=(row:AnnualPlan["business"][number])=>JSON.stringify([row.date,row.department,workItemChoice(row),row.text.trim(),row.time?.trim()??"",row.location?.trim()??"",row.participants?.trim()??""]);
 const seen=new Set(plan.business.map(signature));
 const names=operationNames(plan);
 for(const [index,raw] of input.entries()){
 if(!Object.values(raw).some(v=>v.trim()))continue;
 const date=normalizeWorkDate(raw.date||defaultDate),department=(raw.department||defaultDepartment).trim(),text=raw.text.trim(),kind=raw.kind.trim()||"업무",time=raw.time.trim(),location=raw.location.trim(),participants=raw.participants.trim();
 const custom=kind.startsWith("operation:")?kind.slice(10):names.includes(kind)?kind:undefined;
 let message="";
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T00:00:00Z"))||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date||date<start||date>end)message="학년도 안의 올바른 날짜를 입력하세요.";
 else if(!plan.departments.includes(department))message="등록된 부서를 선택하세요.";
 else if(!text||text.length>2000)message="일정 내용은 1~2000자입니다.";
 else if([time,location,participants].some(v=>v.length>120))message="시간·장소·대상은 각각 120자 이내입니다.";
 else if(!["업무","출장","협의사항"].includes(kind)&&(!custom||!names.includes(custom)))message="등록된 업무 구분을 선택하세요.";
 if(message){errors.push({row:index+1,message});continue;}
 const row={id:"batch-preview-"+index,date,department,text,time,location,participants,kind:custom?(custom==="당직"?"당직":"운영업무"):kind,...(custom&&custom!=="당직"?{operationName:custom}:{})} as AnnualPlan["business"][number];
 const key=signature(row);if(seen.has(key)){duplicates.push(index+1);continue;}seen.add(key);items.push(row);
 }
 if(input.length>WORK_LIMIT||plan.business.length+items.length>3000)errors.push({row:0,message:"한 번에 300행, 학년도 전체 3000건 이내로 등록하세요."});
 if(!errors.length&&!annualSchema.safeParse({...plan,business:[...plan.business,...items]}).success)errors.push({row:0,message:"업무계획 검증에 실패했습니다."});
 return {items,errors,duplicates};
}
export async function workExcelTemplate(){
 const {Workbook}=await import("exceljs");const book=new Workbook(),sheet=book.addWorksheet("업무계획");
 sheet.addRow([...WORK_HEADERS]);sheet.getRow(1).font={bold:true};sheet.views=[{state:"frozen",ySplit:1}];sheet.columns.forEach((col,i)=>{col.width=i===2?55:20;col.numFmt="@";});
 const bytes=new Uint8Array(await book.xlsx.writeBuffer());
 return Uint8Array.from(bytes).buffer as ArrayBuffer;
}
export async function readWorkExcel(file:ArrayBuffer){
 const {Workbook}=await import("exceljs");const book=new Workbook();await book.xlsx.load(new Uint8Array(file) as unknown as Parameters<ExcelWorkbook["xlsx"]["load"]>[0]);
 const sheet=book.getWorksheet("업무계획");if(!sheet||sheet.rowCount>301||sheet.columnCount>7)throw Error("업무계획 양식 및 최대 300행을 확인하세요.");
 const matrix=Array.from({length:sheet.rowCount},(_,i)=>WORK_FIELDS.map((_,j)=>{const cell=sheet.getRow(i+1).getCell(j+1),v=cell.value;if(v instanceof Date)return v.toISOString().slice(0,10);if(j===3&&typeof v==="number"&&v>=0&&v<1){const minutes=Math.floor(v*1440+0.00001);return String(Math.floor(minutes/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0");}return cell.text;}));
 if(matrix[0]?.join("\t")!==WORK_HEADERS.join("\t"))throw Error("양식의 제목 행을 유지하세요.");
 return workRowsFromMatrix(matrix);
}

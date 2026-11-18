import {
  orderedSheetRows,
  type Annual2026CustomRow,type Annual2026Row,
} from "./annual-curriculum-2026";

/** This sheet follows the supplied 2026 16-week baseline.
 * A later semester-settings feature can make this value configurable.
 */
export const ANNUAL_2026_WEEKS=16;
const regularPairs:ReadonlyArray<readonly[number,number]>=[
  [9,10],[11,12],[19,20],[21,22],[23,24],[25,26],
];
const freePairs:ReadonlyArray<readonly[number,number,number,number]>=[
  [9,13,14,15],[11,16,17,18],
];
const semesterColumns=Array.from({length:18},(_,i)=>i+9);
const subtotalIds={
  subject:"subjectTotal",creative:"creativeTotal",free:"freeTotal",
} as const;
export const AUTOMATIC_2026_COLUMNS=new Set([5,6,7,8]);
export type Annual2026Sheet={
  edits:Readonly<Record<string,string>>;
  rows:Readonly<Annual2026CustomRow[]>;
};
export type Annual2026Calculated={
  rows:Annual2026Row[];
  values:Record<string,string>;
  changed:Set<string>;
  warnings:string[];
};
const key=(id:string,col:number)=>id+":"+col;
const numeric=(input:string|undefined):number=>{
  const value=String(input??"").replaceAll(",","").trim();
  const x=Number(value);
  return value!==""&&Number.isFinite(x)?x:0;
};
const nice=(n:number):string=>{
  const rounded=Math.round((n+Number.EPSILON)*1000)/1000;
  if(!Number.isFinite(rounded))return "";
  return String(Object.is(rounded,-0)?0:rounded);
};
const weeklyFrom=(hours:number)=>nice(Math.round((hours/ANNUAL_2026_WEEKS)*1000)/1000);
const semesterFrom=(weekly:number)=>nice(Math.round(weekly*ANNUAL_2026_WEEKS));
export function initialCell(row:Annual2026Row,col:number,edits:Readonly<Record<string,string>>):string{
  const id=key(row.id,col);
  return Object.prototype.hasOwnProperty.call(edits,id)?edits[id]:(row.cells[col]??"");
}
function isGroupHead(rows:readonly Annual2026Row[],index:number):boolean{
  const r=rows[index],previous=rows[index-1];
  return r.kind==="subject"&&r.section!=="other"&&
    (previous?.section!==r.section||previous?.group!==r.group);
}
function canEditRowCell(row:Annual2026Row,col:number,rows:readonly Annual2026Row[]):boolean{
  if(col<4||col>26)return false;
  if(row.kind==="grand"||row.kind==="footer")return false;
  if(row.kind==="subtotal")return row.id==="schoolAutonomyTotal"&&(
    col===4||semesterColumns.includes(col));
  if(AUTOMATIC_2026_COLUMNS.has(col))return false;
  if(col===4)return isGroupHead(rows,rows.indexOf(row));
  return true;
}
export function editableAnnualCell(row:Annual2026Row,col:number,rows:readonly Annual2026Row[]):boolean{
  return canEditRowCell(row,col,rows);
}
export function insertAnnualSubject(
  items:Readonly<Annual2026CustomRow[]>,reference:Annual2026Row,id:string
):Annual2026CustomRow[]{
  if(!/^extra[a-f0-9]{32}$/.test(id))throw Error("새 과목 식별자가 올바르지 않습니다.");
  if(reference.kind!=="subject"||reference.section==="other")throw Error("과목이 속할 교과군을 선택해 주세요.");
  if(items.length>=100)throw Error("추가 과목은 최대 100개까지 지원합니다.");
  if(items.some(row=>row.id===id))throw Error("이미 추가된 과목입니다.");
  return [...items,{id,afterId:reference.id,section:reference.section,
    group:reference.group,subject:""}];
}
export function updateAnnualSubjectName(
  rows:Readonly<Annual2026CustomRow[]>,id:string,subject:string
):Annual2026CustomRow[]{
  const name=subject.slice(0,60);
  return rows.map(row=>row.id===id?{...row,subject:name}:row);
}
export function removeAnnualSubject(
  rows:Readonly<Annual2026CustomRow[]>,edits:Readonly<Record<string,string>>,id:string
):{rows:Annual2026CustomRow[];edits:Record<string,string>}{
  const reference=rows.find(row=>row.id===id);
  if(!reference)throw Error("삭제할 과목을 찾을 수 없습니다.");
  const children=rows.filter(row=>row.afterId===id);
  const nextRows=rows.filter(row=>row.id!==id).map(row=>
    row.afterId===id?{...row,afterId:reference.afterId}:row);
  const nextEdits={...edits};
  for(const field of Object.keys(nextEdits))if(field.startsWith(id+":"))delete nextEdits[field];
  if(children.some(row=>row.id===id))throw Error("과목 관계가 잘못되었습니다.");
  return {rows:nextRows,edits:nextEdits};
}
function storeInput(
  edits:Record<string,string>,row:Annual2026Row,col:number,input:string
){
  const name=key(row.id,col),value=input.trim();
  if(value===(row.cells[col]??""))delete edits[name];
  else edits[name]=value;
}
export function editAnnual2026Cell(
  sheet:Annual2026Sheet,rowId:string,col:number,rawValue:string,
):Record<string,string>{
  const rows=orderedSheetRows(sheet.rows);
  const row=rows.find(record=>record.id===rowId);
  if(!row||!canEditRowCell(row,col,rows))throw Error("자동 계산 결과는 직접 수정할 수 없습니다. 교시별 시수 또는 기준 시수를 변경해 주세요.");
  const value=rawValue.trim().replaceAll(",","");
  if(value!==""){
    if(!/^-?(?:\d+)(?:\.\d{1,3})?$/.test(value)||!Number.isFinite(Number(value)))
      throw Error("시수는 숫자로 입력해 주세요.");
    const number=Number(value);
    if(Math.abs(number)>5000||(number<0&&col!==14&&col!==17))
      throw Error("시수를 입력 가능한 범위에서 확인해 주세요.");
  }
  const output={...sheet.edits};
  const numericValue=numeric(value);
  const blank=value==="";
  const set=(column:number,number:number|string)=>{
    storeInput(output,row,column,String(number));
  };
  storeInput(output,row,col,value);
  // Semester hours <-> hours per week. Blank inputs clear their pair.
  for(const [total,weekly] of regularPairs){
    if(col===weekly)set(total,blank?"":semesterFrom(numericValue));
    if(col===total)set(weekly,blank?"":weeklyFrom(numericValue));
  }
  // In the free-semester alternative, its hours replace the corresponding
  // ordinary semester. The adjustment is the difference, not an extra course.
  for(const [regular,free,adjustment,weekly] of freePairs){
    const baseline=numeric(initialCell(row,regular,output));
    const adjust=numeric(initialCell(row,adjustment,output));
    const freeIsActive=(
      initialCell(row,free,output)!==""||
      initialCell(row,adjustment,output)!==""||
      initialCell(row,weekly,output)!==""
    );
    if(col===weekly){
      const newHours=blank?0:numeric(semesterFrom(numericValue));
      set(free,blank?"":newHours);
      if(row.section!=="free")set(adjustment,blank?"":nice(newHours-baseline));
    }else if(col===free){
      if(row.section!=="free")set(adjustment,blank?"":nice(numericValue-baseline));
      set(weekly,blank?"":weeklyFrom(numericValue));
    }else if(col===adjustment){
      const newHours=row.section==="free"?numericValue:baseline+numericValue;
      set(free,blank?"":nice(newHours));
      set(weekly,blank?"":weeklyFrom(newHours));
    }else if((col===regular||col===regular+1)&&freeIsActive&&row.section!=="free"){
      const newHours=baseline+adjust;
      set(free,nice(newHours));
      set(weekly,weeklyFrom(newHours));
    }
    // Free-semester activities use M/P directly and do not create adjustment N/Q.
  }
  return output;
}
/** Return formula-linked display values while leaving the source snapshot intact.
 * Original independently-printed totals are retained until relevant inputs
 * change. Derived deltas keep historical discrepancies visible, not disguised.
 */
export function calculateAnnual2026Sheet(sheet:Annual2026Sheet):Annual2026Calculated{
  const rows=orderedSheetRows(sheet.rows);
  const values:Record<string,string>={};
  const changed=new Set<string>();
  const warnings:string[]=[];
  const original=(row:Annual2026Row,col:number)=>row.cells[col]??"";
  const base=(row:Annual2026Row,col:number)=>initialCell(row,col,sheet.edits);
  const read=(row:Annual2026Row,col:number)=>values[key(row.id,col)]??base(row,col);
  const put=(row:Annual2026Row,col:number,value:number|string)=>{
    const id=key(row.id,col),render=String(value);
    values[id]=render;
    if(render!==original(row,col))changed.add(id);
  };
  const rowDeltas=new Map<string,Map<number,number>>();
  const automaticSubjects=rows.filter(row=>row.kind==="subject");
  for(const row of automaticSubjects){
    const isNew=row.id.startsWith("extra");
    const touched=isNew||semesterColumns.some(col=>
      Object.prototype.hasOwnProperty.call(sheet.edits,key(row.id,col)));
    const deltas=new Map<number,number>();
    if(touched){
      if(row.section==="free"){
        const freeHours=numeric(read(row,13))+numeric(read(row,16));
        put(row,7,nice(freeHours));
      }else{
        const teaching=regularPairs.reduce((sum,[col])=>sum+numeric(read(row,col)),0);
        put(row,5,nice(teaching));
        put(row,7,nice(teaching+numeric(read(row,14))+numeric(read(row,17))));
      }
    }
    for(const col of [5,7,...semesterColumns]){
      const delta=numeric(read(row,col))-numeric(original(row,col));
      if(Math.abs(delta)>0.000001)deltas.set(col,delta);
    }
    rowDeltas.set(row.id,deltas);
  }
  const sumDeltas=(selected:readonly Annual2026Row[],col:number)=>selected.reduce((sum,row)=>
    sum+(rowDeltas.get(row.id)?.get(col)??0),0);
  // Summary (D) belongs to the whole group; each E/G entry is per subject.
  for(const [i,row] of rows.entries()){
    if(!isGroupHead(rows,i)||row.section==="free")continue;
    const members=automaticSubjects.filter(candidate=>
      candidate.section===row.section&&candidate.group===row.group);
    const groupEdited=members.some(member=>(rowDeltas.get(member.id)?.size??0)>0);
    const baselineEdited=Object.prototype.hasOwnProperty.call(sheet.edits,key(row.id,4));
    if(!groupEdited&&!baselineEdited)continue;
    const standard=numeric(base(row,4));
    const semester=members.reduce((sum,member)=>sum+numeric(read(member,5)),0);
    const free=members.reduce((sum,member)=>sum+numeric(read(member,7)),0);
    put(row,6,nice(semester-standard));
    put(row,8,nice(free-standard));
  }
  const sections={
    subject:automaticSubjects.filter(row=>row.section==="subject"),
    creative:automaticSubjects.filter(row=>row.section==="creative"),
    free:automaticSubjects.filter(row=>row.section==="free"),
  };
  const find=(id:string)=>rows.find(row=>row.id===id);
  // The source includes some known non-additive figures; update by delta to
  // avoid silently "fixing" 2026 official printed totals before editing.
  function updateSubtotal(id:string,selected:readonly Annual2026Row[],{
    includeSemester=true,includeE=true,includeG=true,
  }:{includeSemester?:boolean;includeE?:boolean;includeG?:boolean}={}){
    const subtotal=find(id);
    if(!subtotal)return;
    for(const col of [5,7,...(includeSemester?semesterColumns:[])]){
      if(col===5&&!includeE||col===7&&!includeG)continue;
      const delta=sumDeltas(selected,col);
      if(Math.abs(delta)<0.000001)continue;
      put(subtotal,col,nice(numeric(original(subtotal,col))+delta));
      if(col===5&&original(subtotal,6)!=="")put(subtotal,6,nice(numeric(original(subtotal,6))+delta));
      if(col===7&&original(subtotal,8)!=="")put(subtotal,8,nice(numeric(original(subtotal,8))+delta));
    }
  }
  updateSubtotal(subtotalIds.subject,sections.subject);
  updateSubtotal(subtotalIds.creative,sections.creative);
  updateSubtotal(subtotalIds.free,sections.free,{includeE:false});
  const freeSubjectTotal=find("freeSubjectTotal");
  if(freeSubjectTotal)for(const col of [13,14,15,16,17,18]){
    const delta=sumDeltas(sections.subject,col);
    if(delta)put(freeSubjectTotal,col,nice(numeric(original(freeSubjectTotal,col))+delta));
  }
  const grand=find("grandTotal");
  if(grand){
    const main=[...sections.subject,...sections.creative];
    for(const col of [5,7,...semesterColumns]){
      const delta=sumDeltas(main,col)+(col===7||col>=13&&col<=18?
        sumDeltas(sections.free,col):0);
      if(!delta)continue;
      put(grand,col,nice(numeric(original(grand,col))+delta));
      if(col===5)put(grand,6,nice(numeric(original(grand,6))+delta));
      if(col===7)put(grand,8,nice(numeric(original(grand,8))+delta));
      const semesterHours=find("semesterHours");
      if(semesterHours&&original(semesterHours,col)!=="")
        put(semesterHours,col,nice(numeric(original(semesterHours,col))+delta));
    }
  }
  if(Object.keys(sheet.edits).length||sheet.rows.length)
    warnings.push("원본에서 일부 총계가 서로 일치하지 않습니다. 자동 계산은 기존 숫자에 변경 시수의 차이를 반영하며 원본 기준값을 임의로 정정하지 않습니다.");
  return {rows,values,changed,warnings};
}
export function calculatedAnnualCell(
  calculated:Annual2026Calculated,row:Annual2026Row,col:number,edits:Readonly<Record<string,string>>
):string{
  return calculated.values[key(row.id,col)]??initialCell(row,col,edits);
}

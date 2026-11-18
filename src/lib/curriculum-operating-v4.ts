import type {CurriculumDocument,DesignCell} from "./curriculum-design";
export const OPERATING_FORMAT="eduplan-operating-v4" as const;
export type SourceCohort={
  cohortYear:number;planId:string;planVersion:number;documentVersion:number;
  document:CurriculumDocument|null;
  legacyHours:{subjectId:string;grade:number;semester:number;hours:number}[];
};
export type OpCell={
  subjectId:string;grade:number;semester:number;weekly:number;
  weeks:number;adjustment:number;note:string;
};
export type OpChoice={
  id:string;name:string;grade:number;semester:number;
  subjectIds:string[];requiredCount:number;
};
export type OpOffering={
  id:string;subjectId:string;grade:number;semester:number;
  classIds:string[];teacherNames:string[];room:string;note:string;
};
export type OperatingDocument={
  format:typeof OPERATING_FORMAT;year:number;
  sourceVersions:Record<string,{planId:string;planVersion:number;documentVersion:number}>;
  cells:OpCell[];choiceSets:OpChoice[];offerings:OpOffering[];
};
export type OperatingDiff={
  subjectId:string;grade:number;semester:number;
  source:number;operating:number;delta:number;
};
export type OperatingTotals={
  rawTotal:number;studentTotal:number|null;weekByGrade:number[];
  byTerm:number[];byGrade:number[];ambiguous:OpChoice[];
};
export const opKey=(subjectId:string,grade:number,semester:number)=>subjectId+":"+grade+":"+semester;
export function opHours(cell:OpCell){return cell.weekly*cell.weeks+cell.adjustment;}
function makeFromDesign(cell:DesignCell,weeks:number):OpCell {
  const adjustment=cell.adjustments.reduce((a,b)=>a+b.hours,0)+cell.manual;
  const note=cell.adjustments.map(x=>(x.note?x.kind+"("+x.note+")":x.kind)).join(", ")
    ||(cell.manual!==0?"학기 총시수 직접 조정":"");
  return {...cell,weekly:cell.weekly,weeks,adjustment,note};
}
export function composeOperating(year:number,sources:readonly SourceCohort[]):OperatingDocument{
  const cells:OpCell[]=[];
  const choiceSets:OpChoice[]=[];
  const sourceVersions:OperatingDocument["sourceVersions"]={};
  for(let grade=1;grade<=3;grade++){
    const cohort=year-grade+1;
    const source=sources.find(s=>s.cohortYear===cohort);
    if(!source)continue;
    sourceVersions[String(cohort)]={
      planId:source.planId,planVersion:source.planVersion,documentVersion:source.documentVersion,
    };
    for(const group of source.document?.choiceSets??[]){
      if(group.grade===grade)choiceSets.push({...group});
    }
    for(let semester=1;semester<=2;semester++){
      const existing=source.document?.cells.filter(cell=>cell.grade===grade&&cell.semester===semester);
      const weeks=source.document?.termWeeks?.[year+":"+semester]?.count
        ??source.document?.weeks[String(year)]?.count??16;
      if(existing?.length){
        for(const cell of existing)cells.push(makeFromDesign(cell,weeks));
      }else{
        for(const item of source.legacyHours.filter(row=>row.grade===grade&&row.semester===semester)){
          const weekly=Math.floor(item.hours/weeks);
          const adjustment=item.hours-weekly*weeks;
          cells.push({subjectId:item.subjectId,grade,semester,weeks,weekly,adjustment,
            note:adjustment?"기존 학기 총시수 이관 차이":""});
        }
      }
    }
  }
  return {format:OPERATING_FORMAT,year,sourceVersions,cells,choiceSets,offerings:[]};
}
export function operatingDiffs(original:OperatingDocument,projection:OperatingDocument):OperatingDiff[]{
  const projected=new Map(projection.cells.map(c=>[opKey(c.subjectId,c.grade,c.semester),opHours(c)]));
  const all=new Map(original.cells.map(c=>[opKey(c.subjectId,c.grade,c.semester),c]));
  for(const c of projection.cells)if(!all.has(opKey(c.subjectId,c.grade,c.semester)))
    all.set(opKey(c.subjectId,c.grade,c.semester),c);
  const result:OperatingDiff[]=[];
  for(const [key,c] of all){
    const projectedRow=projection.cells.find(row=>opKey(row.subjectId,row.grade,row.semester)===key);
    const source=projectedRow?opHours(projectedRow):0;
    const operating=original.cells.some(row=>opKey(row.subjectId,row.grade,row.semester)===key)
      ?opHours(c):0;
    if(Math.abs(source-operating)>0.000001)
      result.push({subjectId:c.subjectId,grade:c.grade,semester:c.semester,
        source,operating,delta:operating-source});
  }
  return result;
}
export function updateOperatingCell(doc:OperatingDocument,id:string,grade:number,semester:number,
  patch:Partial<Pick<OpCell,"weekly"|"weeks"|"adjustment"|"note">>):OperatingDocument {
  const key=opKey(id,grade,semester);
  const existing=doc.cells.find(c=>opKey(c.subjectId,c.grade,c.semester)===key);
  const cell:OpCell={subjectId:id,grade,semester,weekly:0,weeks:16,adjustment:0,note:"",...existing,...patch};
  if(!Number.isFinite(cell.weekly)||cell.weekly<0||cell.weekly>100||
    !Number.isInteger(cell.weeks)||cell.weeks<1||cell.weeks>24||
    !Number.isFinite(cell.adjustment)||Math.abs(cell.adjustment)>1500||
    !Number.isInteger(opHours(cell))||opHours(cell)<0||opHours(cell)>2000)
    throw Error("주당 시수·운영 주수·조정 시수의 범위를 확인해 주세요.");
  return {...doc,cells:existing?doc.cells.map(row=>
    opKey(row.subjectId,row.grade,row.semester)===key?cell:row):[...doc.cells,cell]};
}
export function applyOperatingWeeks(doc:OperatingDocument,grade:number,semester:number,weeks:number):OperatingDocument{
  if(!Number.isInteger(weeks)||weeks<1||weeks>24)throw Error("운영 주수는 1~24주로 설정해 주세요.");
  return {...doc,cells:doc.cells.map(c=>c.grade===grade&&c.semester===semester?{...c,weeks}:c)};
}
export function operatingTotals(doc:OperatingDocument):OperatingTotals{
  const byTerm=[0,0,0,0,0,0],byGrade=[0,0,0];
  for(const c of doc.cells){const value=opHours(c);byTerm[(c.grade-1)*2+c.semester-1]+=value;byGrade[c.grade-1]+=value;}
  const rawTotal=byGrade.reduce((a,b)=>a+b,0);
  let studentTotal=rawTotal;
  const ambiguous:OpChoice[]=[];
  for(const choice of doc.choiceSets){
    const chosen=doc.cells.filter(c=>c.grade===choice.grade&&c.semester===choice.semester
      &&choice.subjectIds.includes(c.subjectId));
    const hours=chosen.map(c=>opHours(c));
    if(chosen.length!==choice.subjectIds.length||!hours.length||
      hours.some(h=>Math.abs(h-hours[0])>0.000001)||choice.requiredCount<1||choice.requiredCount>hours.length){
      ambiguous.push(choice);continue;
    }
    studentTotal-=(hours.length-choice.requiredCount)*hours[0];
  }
  return {rawTotal,studentTotal:ambiguous.length?null:studentTotal,
    weekByGrade:byGrade,byTerm,byGrade,ambiguous};
}
export function validateOperating(doc:OperatingDocument):string[]{
  const problems:string[]=[];
  if(doc.format!==OPERATING_FORMAT||!Number.isInteger(doc.year))problems.push("운영편제 형식을 확인해 주세요.");
  if(!doc.cells.length)problems.push("편성 과목이 없습니다.");
  const used=new Set<string>();
  for(const c of doc.cells){
    const key=opKey(c.subjectId,c.grade,c.semester);
    if(used.has(key))problems.push("중복된 과목·학년·학기: "+key);
    used.add(key);
    if(c.grade<1||c.grade>3||![1,2].includes(c.semester)
      ||!Number.isFinite(c.weekly)||c.weekly<0||c.weekly>100
      ||!Number.isInteger(c.weeks)||c.weeks<1||c.weeks>24
      ||!Number.isInteger(opHours(c))||opHours(c)<0||opHours(c)>2000)
      problems.push("시수 범위 확인: "+key);
    if(c.adjustment!==0&&!c.note.trim())problems.push("조정 시수 사유 미입력: "+key);
  }
  for(const x of doc.choiceSets){
    if(x.subjectIds.length<2||x.requiredCount<1||x.requiredCount>=x.subjectIds.length)
      problems.push("선택과목군의 과목 수와 선택 수를 확인해 주세요: "+x.name);
  }
  if(operatingTotals(doc).ambiguous.length)problems.push("학생 선택 과목의 시수가 서로 다릅니다. 선택 묶음의 시수를 조정해 주세요.");
  return [...new Set(problems)];
}

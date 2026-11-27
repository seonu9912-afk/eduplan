import {annualSchema,type AnnualPlan} from "./academic";
import {monthRange} from "./domain";
import {operationNames} from "./work-operation-items";
export const transferKinds=["work-settings","work-events","periods","bell","events"] as const;
export type TransferKind=typeof transferKinds[number];
export const transferLabels:Record<TransferKind,string>={"work-settings":"업무 부서·운영 항목","work-events":"일반 업무 일정","periods":"학년별 요일별 운영 교시","bell":"기본 시정표","events":"학사행사"};
export type TransferItem={label:string;detail:string;state:"add"|"skip"};
export type TransferPreview={kind:TransferKind;source:number;target:number;items:TransferItem[];stamp:string;note:string};
export function transferDate(date:string,offset:number){const month=String(Number(date.slice(0,4))+offset)+date.slice(4,7);return [month+date.slice(7),monthRange(month).end].sort()[0];}
export function mergeWorkSettings(source:AnnualPlan,target:AnnualPlan){
  const departments=[...new Set([...target.departments,...source.departments])],names=[...new Set([...operationNames(target),...operationNames(source)])];
  const result=annualSchema.parse({...target,departments,workSettings:{...target.workSettings,operationNames:names,dutyEnabled:names.includes("당직")}});
  return {result,items:[...source.departments.map(label=>({label,detail:"업무 부서",state:target.departments.includes(label)?"skip":"add"} as const)),...operationNames(source).map(label=>({label,detail:"운영 항목",state:operationNames(target).includes(label)?"skip":"add"} as const))]};
}
export function transferWorkEvents(source:AnnualPlan,target:AnnualPlan,offset:number,makeId:()=>string){
  const items:TransferItem[]=[],added:AnnualPlan["business"]=[];
  for(const row of source.business){
    const date=transferDate(row.date,offset);
    const skip=row.kind!=="업무"&&row.kind!=="협의사항"?"개인 배정·출장 제외":!target.departments.includes(row.department)?"대상 부서 미등록": [...target.business,...added].some(r=>r.date===date&&r.kind===row.kind&&r.department===row.department&&r.text===row.text)?"이미 있음":"";
    items.push({label:row.text,detail:date+" · "+(skip||row.department),state:skip?"skip":"add"});
    if(!skip)added.push({...row,id:makeId(),date,participants:undefined,resources:[]});
  }
  return {items,result:annualSchema.parse({...target,business:[...target.business,...added]})};
}
export function transferPeriods(source:AnnualPlan,target:AnnualPlan,grades:number[]){
  const items:TransferItem[]=[],add:AnnualPlan["timetable"]=[];
  for(const row of source.timetable){
    const existing=target.timetable.find(r=>r.grade===row.grade&&r.weekday===row.weekday);
    const skip=!grades.includes(row.grade)?"대상 학년 없음":existing?"기존 운영 교시 유지":"";
    items.push({label:row.grade+"학년 "+["일","월","화","수","목","금","토"][row.weekday]+"요일",detail:row.start+"~"+row.end+"교시"+(skip?" · "+skip:""),state:skip?"skip":"add"});
    if(!skip)add.push(row);
  }
  return {items,result:annualSchema.parse({...target,timetable:[...target.timetable,...add]})};
}

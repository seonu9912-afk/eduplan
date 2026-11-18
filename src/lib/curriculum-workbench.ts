import type { Context } from "./models";
import {
  type CurriculumDocument, type DesignCell, evaluateCell, getCell, matchGroup,
  MIDDLE_2022_GROUPS, MIDDLE_2022_MINIMUM, withWeeklyHours, withWeeks,
  curriculumVersion, type WeekRule,
} from "./curriculum-design";

/**
 * Curriculum v3: calculate from cohort documents, never from the A:Z operating
 * spreadsheet. Annual views compose the appropriate grade from each cohort.
 * These functions do not write to storage or mutate the originating documents.
 */
export type CurriculumBasis = {
  cohort: number;
  version: "2015" | "2022";
  label: string;
  source: string;
  groupRules: ReadonlyArray<{key:string;label:string;hours:number}>;
  minimum: number;
};
export type GroupReview = {
  key:string;name:string;standard:number;planned:number;diff:number;
  rate:number;status:"정상 범위"|"감축 주의"|"증감 검토";
};
export type CohortReview = {
  basis:CurriculumBasis;
  total:number;effectiveTotal:number|null;
  minimum:number;
  difference:number;
  groups:GroupReview[];
  unclassified:string[];
  exceptions:string[];
  warnings:string[];
  draft:boolean;
};
export type OperatingGrade = {
  grade:number;cohort:number;planId:string|null;
  basis:"2015"|"2022";first:number;second:number;total:number;
};
export type OperatingReview = {
  year:number;grades:OperatingGrade[];semesterTotals:[number,number];
  total:number;missingCohorts:number[];warnings:string[];
};
export const EDUPLAN_CURRICULUM_VERSION="4.0";

export function basisForCohort(cohort:number):CurriculumBasis {
  const version=cohort>=2025?"2022":"2015";
  const v=curriculumVersion(cohort);
  return {
    cohort,version,label:v.label,source:v.source,
    groupRules:MIDDLE_2022_GROUPS,
    minimum:MIDDLE_2022_MINIMUM,
  };
}
function groupKey(context:Context,subjectId:string):string|null {
  const subject=context.subjects.find(row=>row.id===subjectId);
  if(!subject)return null;
  const group=context.groups.find(row=>row.id===subject.group_id);
  return matchGroup(group?.name??subject.name);
}
function sumTerms(doc:CurriculumDocument,predicate:(cell:DesignCell)=>boolean):number {
  return doc.cells.filter(predicate).reduce((sum,cell)=>sum+evaluateCell(doc,cell).total,0);
}
function safeRound(number:number):number{
  return Number(number.toFixed(4));
}
export function reviewCohort(context:Context,doc:CurriculumDocument):CohortReview {
  const basis=basisForCohort(doc.cohortYear);
  const groupHours=new Map<string,number>();
  const names=new Set<string>();
  const errors:string[]=[];
  for(const cell of doc.cells){
    const category=groupKey(context,cell.subjectId);
    const total=evaluateCell(doc,cell);
    if(!total.valid)errors.push("시수 입력 확인: "+cell.grade+"학년 "+cell.semester+"학기");
    if(!category){
      const name=context.subjects.find(row=>row.id===cell.subjectId)?.name;
      if(name&&total.total>0)names.add(name);
      continue;
    }
    groupHours.set(category,(groupHours.get(category)??0)+total.total);
  }
  let effectiveTotal=0;
  const handled=new Set<string>();
  const choiceWarnings:string[]=[];
  for(const group of doc.choiceSets??[]){
    const rows=group.subjectIds.map(id=>doc.cells.find(c=>
      c.subjectId===id&&c.grade===group.grade&&c.semester===group.semester));
    const amounts=rows.map(c=>c?evaluateCell(doc,c).total:-1);
    const categories=group.subjectIds.map(id=>groupKey(context,id));
    const unique=categories[0]&&categories.every(cat=>cat===categories[0]);
    if(rows.some(c=>!c)||amounts.some(x=>x!==amounts[0])||!unique||
       group.requiredCount<1||group.requiredCount>=rows.length){
      choiceWarnings.push(group.name+" 선택과목군의 시수·교과군·선택 수를 확인해야 합니다.");
      continue;
    }
    const excluded=(rows.length-group.requiredCount)*amounts[0];
    groupHours.set(categories[0]!, (groupHours.get(categories[0]!)??0)-excluded);
    effectiveTotal+=excluded;
    rows.forEach(c=>handled.add(c!.subjectId+":"+c!.grade+":"+c!.semester));
  }
  const groups=basis.groupRules.map(rule=>{
    const planned=safeRound(groupHours.get(rule.key)??0);
    const diff=safeRound(planned-rule.hours);
    const rate=diff/rule.hours;
    const cannotReduce=rule.key==="체육"||rule.key==="예술";
    const status:GroupReview["status"]=cannotReduce&&diff<0
      ?"감축 주의":Math.abs(rate)>0.2+1e-8
        ?"증감 검토":"정상 범위";
    return {key:rule.key,name:rule.label,standard:rule.hours,planned,diff,rate,status};
  });
  const total=safeRound(sumTerms(doc,()=>true));
  const studentTotal=choiceWarnings.length?null:safeRound(total-effectiveTotal);
  const activeOptions=new Map<string,string[]>();
  for(const cell of doc.cells){
    const category=groupKey(context,cell.subjectId);
    if(category!=="선택"||evaluateCell(doc,cell).total<=0||
      handled.has(cell.subjectId+":"+cell.grade+":"+cell.semester))continue;
    const name=context.subjects.find(row=>row.id===cell.subjectId)?.name??cell.subjectId;
    const key=cell.grade+":"+cell.semester;
    const list=activeOptions.get(key)??[];
    if(!list.includes(name))list.push(name);
    activeOptions.set(key,list);
  }
  const concurrent=[...activeOptions.entries()].filter(([,list])=>list.length>1);
  const warnings=[
    ...(studentTotal!==null&&studentTotal<basis.minimum?["학생 1인 기준 3개년 이수 시수가 국가 최소 기준보다 적습니다."]:[]),
    ...choiceWarnings,
    ...(groups.some(r=>r.status!=="정상 범위")?["교과군 증감·체육·예술 기준을 확인해야 합니다. 학교별 승인·특례는 별도 검토합니다."]:[]),
    ...(names.size?["국가 교과군에 매칭되지 않은 학교 특색 과목이 있어 분류를 확인해야 합니다."]:[]),
    ...(concurrent.length?[
      "동일 학기에 여러 선택 과목이 편성되어 있습니다. 분반·선택 묶음이 확인되기 전까지 총시수는 단순 합계이며 실제 학생 이수 시수로 확정하지 않습니다.",
    ]:[]),
    ...errors,
  ];
  return {
    basis,total,effectiveTotal:studentTotal,minimum:basis.minimum,
    difference:safeRound((studentTotal??total)-basis.minimum),
    groups,unclassified:[...names].sort((a,b)=>a.localeCompare(b,"ko")),
    exceptions:concurrent.map(([term,list])=>term+" ("+list.join(" · ")+")"),
    warnings,draft:doc.cells.length===0||total===0,
  };
}
export function reviewOperatingYear(
  context:Context,year:number,
  documents:Readonly<Record<string,CurriculumDocument|undefined|null>>,
):OperatingReview {
  const byGrade=context.grades.map(grade=>{
    const cohort=year-grade+1;
    const plan=context.plans.find(row=>row.cohort_year===cohort);
    const doc=plan?documents[plan.id]:null;
    return {
      grade,cohort,planId:plan?.id??null,
      basis:basisForCohort(cohort).version,
      first:doc?safeRound(sumTerms(doc,cell=>cell.grade===grade&&cell.semester===1)):0,
      second:doc?safeRound(sumTerms(doc,cell=>cell.grade===grade&&cell.semester===2)):0,
      total:doc?safeRound(sumTerms(doc,cell=>cell.grade===grade)):0,
    };
  });
  const semesterTotals:[number,number]=[
    safeRound(byGrade.reduce((sum,row)=>sum+row.first,0)),
    safeRound(byGrade.reduce((sum,row)=>sum+row.second,0)),
  ];
  const missingCohorts=byGrade.filter(row=>row.planId===null||
    !documents[row.planId]).map(row=>row.cohort);
  const warnings=[
    ...(missingCohorts.length?["해당 입학년도 편성표가 없어 일부 학년은 계산되지 않았습니다."]:[]),
    "당해연도 전체 합계는 서로 다른 입학생 집단을 합친 운영 시수입니다. 국가의 3개년 최소 기준은 입학년도별로 각각 검증하세요.",
  ];
  return {year,grades:byGrade,semesterTotals,total:safeRound(semesterTotals[0]+semesterTotals[1]),
    missingCohorts,warnings};
}
export type OperatingWeekReview={
  year:number;rule:WeekRule;conflict:boolean;sourceCount:number;
};
export function operatingWeekReview(
  context:Context,year:number,
  documents:Readonly<Record<string,CurriculumDocument|undefined|null>>,
):OperatingWeekReview{
  const rules=context.grades.map(grade=>
    context.plans.find(plan=>plan.cohort_year===year-grade+1)).map(plan=>
      plan?documents[plan.id]?.weeks[String(year)]:undefined).filter((item):item is WeekRule=>!!item);
  const rule=rules[0]??{count:16,status:"provisional"};
  return {year,rule,sourceCount:rules.length,conflict:rules.some(item=>
    item.count!==rule.count||item.status!==rule.status)};
}
export function alignOperatingWeekRules(
  context:Context,year:number,
  documents:Readonly<Record<string,CurriculumDocument|undefined|null>>,
  rule:WeekRule,
):Record<string,CurriculumDocument>{
  if(![16,17].includes(rule.count)||!["confirmed","provisional"].includes(rule.status))
    throw Error("기준 주수 설정을 확인해 주세요.");
  return Object.fromEntries(context.grades.flatMap(grade=>{
    const plan=context.plans.find(row=>row.cohort_year===year-grade+1);
    const document=plan?documents[plan.id]:undefined;
    return plan&&document?[[plan.id,withWeeks(document,year,rule)]]:[];
  }));
}
export function simulateWeeklyAllocation(
  context:Context,doc:CurriculumDocument,
  subjectId:string,grade:number,semester:number,nextWeekly:number,
):{
  before:number;after:number;delta:number;
  beforeGroup:GroupReview|null;afterGroup:GroupReview|null;
  updated:CurriculumDocument;beforeTerm:number;afterTerm:number;
} {
  if(!Number.isFinite(nextWeekly)||nextWeekly<0||nextWeekly>100)
    throw Error("주당 시수는 0~100 사이로 입력해 주세요.");
  const beforeCell=getCell(doc,subjectId,grade,semester);
  const updated=withWeeklyHours(doc,subjectId,grade,semester,nextWeekly);
  const afterCell=getCell(updated,subjectId,grade,semester)!;
  const before=beforeCell?evaluateCell(doc,beforeCell).total:0;
  const after=evaluateCell(updated,afterCell).total;
  const category=groupKey(context,subjectId);
  const prev=reviewCohort(context,doc),next=reviewCohort(context,updated);
  return {
    before,after,delta:safeRound(after-before),
    beforeGroup:prev.groups.find(row=>row.key===category)??null,
    afterGroup:next.groups.find(row=>row.key===category)??null,
    updated,
    beforeTerm:safeRound(sumTerms(doc,cell=>cell.grade===grade&&cell.semester===semester)),
    afterTerm:safeRound(sumTerms(updated,cell=>cell.grade===grade&&cell.semester===semester)),
  };
}

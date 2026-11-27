import type { Context } from "./models";
import type { AnnualPlan } from "./academic";
import { publicationAt, publishedSchoolContext } from "./school-publications";
import { annualSchema } from "./academic";
import { compareSnapshots, type ChangeRow } from "./published-changes";
import { operationNames, operationName, visibleWorkItem } from "./work-operation-items";

type Domain = "calendar" | "plans";
type Snapshot = Parameters<typeof compareSnapshots>[0];
function stable(value: unknown): string {
  if (Array.isArray(value)) return "["+value.map(stable).join(",")+"]";
  if (value && typeof value==="object") return "{"+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+stable(v)).join(",")+"}";
  return JSON.stringify(value) ?? "";
}
function describe(value:unknown):string {
  if(value==null||value==="")return "";
  if(Array.isArray(value))return value.map(describe).filter(Boolean).join(", ");
  if(typeof value==="object")return Object.entries(value).map(([k,v])=>k+" "+describe(v)).join(" · ");
  return String(value);
}
function snapshot(c:Context, p:AnnualPlan, domain:Domain):Snapshot {
  const out:Snapshot=new Map();
  const put=(key:string,title:string,fields:unknown[])=>out.set(key,{title,value:fields.map(describe).filter(Boolean).join(" · ")||"설정됨",fingerprint:stable(fields)});
  if(domain==="plans"){
    for(const row of p.business.filter(r=>visibleWorkItem(p,r))) put("business:"+row.id,row.text,[row.date,operationName(row)??row.kind,row.department,row.time??"",row.location??"",row.participants??"",row.resources??[]]);
    put("departments","업무 부서",[p.departments]);
    put("operations","학교 운영업무 항목",[operationNames(p)]);
    return out;
  }
  for(const e of c.events) put("event:"+e.id,e.title,[e.start_date,e.end_date,e.department,e.event_type,e.activity_area,e.target_grades??[],(e.target_class_ids??[]).map(id=>c.classes.find(cls=>cls.id===id)).map(cls=>cls?cls.grade+"학년 "+cls.class_number+"반":"학급"),e.description??"",e.resources??[]]);
  for(const a of p.allocations)put("allocation:"+a.id,(c.events.find(e=>e.id===a.eventId)?.title??a.title)+" · 운영 교시",[a.date,a.start+"~"+a.end+"교시",a.department,a.areas,a.classId?c.classes.find(cls=>cls.id===a.classId)?.class_number??a.classId:"",a.eventId??""]);
  for(const [date,name] of Object.entries(p.holidays))put("holiday:"+date,"공휴일 "+date,[name]);
  for(const [date,rule] of Object.entries(p.days))put("day:"+date,"학사일 운영 "+date,[rule]);
  const vacationCounts=new Map<string,number>();
  for(const v of p.vacations){const n=vacationCounts.get(v.name)??0;vacationCounts.set(v.name,n+1);put("vacation:"+v.name+":"+n,v.name,[v.start,v.end]);}
  for(const row of p.recurring)put("recurring:"+row.id,row.name+" · 반복 활동",[row.grade+"학년",row.semester+"학기",row.weekday+"요일",row.start+"~"+row.end+"교시",row.area,row.exclude]);
  for(const row of p.timetable)put("period:"+row.grade+":"+row.weekday,row.grade+"학년 요일별 운영 교시",[row.weekday+"요일",row.start+"~"+row.end+"교시"]);
  for(const term of c.semesters)put("term:"+term.number,term.number+"학기",[term.start_date,term.end_date]);
  for(const cls of c.classes)put("class:"+cls.id,"학급",[cls.grade+"학년",cls.class_number+"반"]);
  return out;
}
export type PlanPreview={kind:"first"|"comparison"|"unavailable";duplicate:boolean;rows:ChangeRow[];previousDate?:string;nextDate?:string};
export function previewPlanPublication(c:Context, saved:AnnualPlan, domain:Domain, version:number, startsOn:string):PlanPreview{
  const releases=(c.schoolPublications??[]).filter(p=>p.domain===domain);
  const duplicate=releases.some(p=>p.starts_on===startsOn&&p.source_version===version);
  const previous=publicationAt(releases,domain,startsOn);
  const nextDate=releases.filter(p=>p.starts_on>startsOn).map(p=>p.starts_on).sort()[0];
  if(!previous)return {kind:"first",duplicate,rows:[],nextDate};
  try{
    const old=publishedSchoolContext({...c,schoolPublications:[previous]},startsOn);
    const parsed=annualSchema.safeParse(old.annual?.document);
    if(!parsed.success)return {kind:"unavailable",duplicate,rows:[],nextDate};
    return {kind:"comparison",duplicate,previousDate:previous.starts_on,nextDate,rows:compareSnapshots(snapshot(old,parsed.data,domain),snapshot(c,saved,domain))};
  }catch{return {kind:"unavailable",duplicate,rows:[],nextDate};}
}

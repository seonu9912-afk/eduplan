import {annualSchema,academicDays,isTeachingDay} from "./academic";
import {timetableDocumentSchema,type TimetableDocument} from "./timetable-bridge";
import {resourcesSchema,type PlanningResources} from "./planning-resources";
import {createLessonResolver,timetableIssues} from "./school-operations";
import {publicationAt,publishedSchoolContext} from "./school-publications";
import {cohortFor} from "./domain";
import type {Context} from "./models";
export type AuditArea="teachers"|"calendar"|"curriculum"|"timetable";
export type AuditCheck={id:string;scope:"draft"|"published";area:AuditArea;label:string;state:"ok"|"warning"|"error"|"unknown";details:string[];count:number};
function check(id:string,scope:AuditCheck["scope"],area:AuditArea,label:string,details:string[],state:AuditCheck["state"]="error"):AuditCheck{
  const unique=[...new Set(details)];
  return {id,scope,area,label,state:unique.length?state:"ok",details:unique.slice(0,40),count:unique.length};
}
function missing(id:string,scope:AuditCheck["scope"],area:AuditArea,label:string,detail:string){return check(id,scope,area,label,[detail],"unknown");}
export function eventConnectionIssues(c:Context){
  const plan=annualSchema.safeParse(c.annual?.document);
  if(!plan.success)return null;
  const classes=new Map(c.classes.map(x=>[x.id,x])),events=new Map(c.events.map(x=>[x.id,x])),out:string[]=[];
  for(const e of c.events){
    if(e.target_grades.some(g=>!c.grades.includes(g)))out.push(e.title+" · 대상 학년 없음");
    for(const id of e.target_class_ids??[]){
      const cls=classes.get(id);
      if(!cls)out.push(e.title+" · 대상 학급 없음");
      else if(e.target_grades.length&&!e.target_grades.includes(cls.grade))out.push(e.title+" · 대상 학급과 학년 불일치");
    }
  }
  for(const a of plan.data.allocations){
    const e=a.eventId?events.get(a.eventId):undefined;
    if(a.eventId&&!e)out.push(a.date+" · "+a.title+" · 연결 행사 없음");
    if(e&&(a.date<e.start_date||a.date>e.end_date))out.push(a.date+" · "+a.title+" · 행사 기간 밖");
    if(a.classId){const cls=classes.get(a.classId);if(!cls||!Object.hasOwn(a.areas,String(cls.grade)))out.push(a.date+" · "+a.title+" · 학급·학년 배정 불일치");}
    if(Object.keys(a.areas).some(g=>!c.grades.includes(Number(g))))out.push(a.date+" · "+a.title+" · 미등록 학년 배정");
  }
  return out;
}
export function timetableConnectionIssues(c:Context,doc:TimetableDocument,resources:PlanningResources|undefined,frozen=false){
  const classes=new Set(c.classes.map(x=>x.id));
  const subjects=new Set((frozen?doc.subjects:c.subjects).map(x=>x.id));
  const teachers=new Set((frozen?doc.teachers:c.operations?.directory?.filter(x=>x.active)??[]).map(x=>x.id));
  const rooms=new Set(resources?.rooms.map(r=>r.id)??[]);
  const links=resources?.links??[];
  const linked=(kind:"subject"|"teacher"|"room",id:string,ids:Set<string>)=>ids.has(id)||links.some(l=>l.kind===kind&&l.legacy_id===id&&ids.has((kind==="subject"?l.subject_id:kind==="teacher"?l.teacher_id:l.room_id)??""));
  const out:string[]=[];
  const slots=[...doc.weekly,...(doc.timetableConfig?.lessons??[]),...doc.overrides.filter(x=>x.action==="replace")];
  for(const s of slots){
    const ids=s.scope==="class"?[s.scopeId]:doc.groups.find(g=>g.id===s.scopeId)?.classIds??[];
    if(!ids.length||ids.some(id=>!classes.has(id)))out.push("학급 연결: "+(doc.classes.find(x=>x.id===s.scopeId)?.label??doc.groups.find(x=>x.id===s.scopeId)?.label??s.scopeId));
    const subject=String(s.subjectId??""),teacher=String(s.teacherId??""),room=String(s.room??"");
    if(!subject||!linked("subject",subject,subjects))out.push("교과 연결: "+(doc.subjects.find(x=>x.id===subject)?.label??(subject||"미지정")));
    if(!teacher||!linked("teacher",teacher,teachers))out.push("교원 연결: "+(doc.teachers.find(x=>x.id===teacher)?.label??(teacher||"미지정")));
    if(room&&resources&&!linked("room",room,rooms))out.push("특별실 연결: "+(doc.roomLabels?.[room]??room));
  }
  return out;
}
export function buildOperationAudit(c:Context){
  const rows:AuditCheck[]=[];
  if(!c.year)return rows;
  const year=c.year.year,op=c.operations;
  const directory=op?.directory.filter(t=>t.active);
  if(directory){
    rows.push(check("accounts","draft","teachers","교원과 사용자 계정 연결",directory.filter(t=>!t.user_id||!c.members.some(m=>m.user_id===t.user_id)).map(t=>t.display_name+" · 계정 미연결"),"warning"));
    const subjects=new Set(c.subjects.map(s=>s.id)),classes=new Set(c.classes.map(s=>s.id));
    rows.push(check("staff","draft","teachers","교원·교과·담임학급 연결",directory.flatMap(t=>[...t.subject_ids.filter(id=>!subjects.has(id)).map(()=>t.display_name+" · 미등록 교과"),...(t.primary_subject_id&&!subjects.has(t.primary_subject_id)?[t.display_name+" · 주 담당 교과 없음"]:[]),...(t.homeroom_class_id&&!classes.has(t.homeroom_class_id)?[t.display_name+" · 담임 학급 없음"]:[])])));
  }else rows.push(missing("accounts","draft","teachers","교원 계정 연결","교원 목록 조회 불가"));
  const eventIssues=eventConnectionIssues(c);
  rows.push(eventIssues===null?missing("events","draft","calendar","학사행사·운영 교시 연결","저장된 학사일정 없음 또는 형식 오류"):check("events","draft","calendar","학사행사·운영 교시 연결",eventIssues));
  const cohorts=new Set(c.grades.map(g=>cohortFor(year,g))),subjectIds=new Set(c.subjects.map(s=>s.id));
  const designs=Object.values(op?.designs??{}).filter(d=>cohorts.has(d.cohortYear));
  rows.push(!designs.length?missing("curriculum","draft","curriculum","교육과정·교과목 연결","해당 입학년도 설계 저장본 없음"):check("curriculum","draft","curriculum","교육과정·교과목 연결",designs.flatMap(d=>[...d.cells.map(x=>x.subjectId),...(d.choiceSets??[]).flatMap(x=>x.subjectIds)].filter(id=>!subjectIds.has(id)).map(id=>d.cohortYear+"학년도 입학생 · 미등록 교과 "+id))));
  const draft=op?.timetable?.document;
  if(draft){
    rows.push(check("draft-refs","draft","timetable","시간표·교원·학급·교과 연결",timetableConnectionIssues(c,draft,op?.resources)));
    rows.push(check("draft-bell","draft","timetable","시간표·기본 시정표",timetableIssues(draft),"warning"));
  }else rows.push(missing("draft-refs","draft","timetable","시간표 연결","저장된 시간표 없음"));
  const pubs=c.schoolPublications??[],versions=op?.effectiveTimetables??[];
  const calendarReleases=pubs.filter(p=>p.domain==="calendar");
  if(!calendarReleases.length)rows.push(missing("pub-calendar","published","calendar","공개 학사행사 연결","공개 학사일정 없음"));
  else{
    const dates=[...new Set(calendarReleases.map(p=>p.starts_on))],issues:string[]=[];
    try{
      for(const date of dates){const pc=publishedSchoolContext(c,date),issuesAt=eventConnectionIssues(pc);if(issuesAt===null)throw Error("invalid calendar");issues.push(...issuesAt.map(x=>date+" 적용본 · "+x));}
      rows.push(check("pub-calendar","published","calendar","공개 학사행사 연결",issues));
    }catch{rows.push(missing("pub-calendar","published","calendar","공개 학사행사 연결","공개본 형식 확인 필요"));}
  }
  if(!versions.length)rows.push(missing("pub-refs","published","timetable","공개 시간표 연결","적용 시작일이 지정된 공개 시간표 없음"));
  else{
    const links:string[]=[],bells:string[]=[],conflicts:string[]=[],gaps:string[]=[];
    try{
      for(const v of versions){
        const parsed=timetableDocumentSchema.safeParse(v.document);
        if(!parsed.success){gaps.push(v.starts_on+" · 시간표 형식 확인 필요");continue;}
        if(!publicationAt(pubs,"calendar",v.starts_on)){gaps.push(v.starts_on+" · 적용 학사일정 없음");continue;}
        const official=publishedSchoolContext(c,v.starts_on),res=resourcesSchema.safeParse(parsed.data.publishedResources);
        links.push(...timetableConnectionIssues(official,parsed.data,res.success?res.data:undefined,true).map(x=>v.starts_on+" 적용본 · "+x));
        if(!res.success)gaps.push(v.starts_on+" · 보존된 운영 자원 확인 필요");
      }
      const dateContexts=new Map<string,Context>();
      const getContext=(date:string)=>{const p=publicationAt(pubs,"calendar",date);if(!p)return null;if(!dateContexts.has(p.id))dateContexts.set(p.id,publishedSchoolContext(c,date));return dateContexts.get(p.id)!;};
      const resolvers=new Map<string,ReturnType<typeof createLessonResolver>>();
      const start=year+"-03-01",end=(year+1)+"-03-01";
      for(let d=new Date(start+"T00:00:00Z");d.toISOString().slice(0,10)<end;d.setUTCDate(d.getUTCDate()+1)){
        const date=d.toISOString().slice(0,10),pc=getContext(date);
        if(!pc)continue;
        const annual=annualSchema.safeParse(pc.annual?.document);if(!annual.success)continue;
        const cal=publicationAt(pubs,"calendar",date)!;
        const v=[...versions].filter(v=>v.starts_on<=date).sort((a,b)=>b.starts_on.localeCompare(a.starts_on))[0];
        const key=cal.id+":"+String(v?.id??"none");
        if(!resolvers.has(key)){
          if(!v){const days=academicDays(year,annual.data,pc.semesters).filter(isTeachingDay).map(x=>x.date);const set=new Set(days);resolvers.set(key,date=>set.has(date)?[{blockedBy:["공개 시간표 없음"]} as ReturnType<ReturnType<typeof createLessonResolver>>[number]]:[]);}
          else {const parsed=timetableDocumentSchema.safeParse(v.document);if(!parsed.success)continue;const res=resourcesSchema.safeParse(parsed.data.publishedResources);resolvers.set(key,createLessonResolver({...pc,operations:op?{...op,resources:res.success?res.data:undefined}:undefined},{...parsed.data,_published:false},annual.data));}
        }
        const lessons=resolvers.get(key)?.(date)??[];
        for(const l of lessons){
          if(l.blockedBy.includes("공개 시간표 없음")){gaps.push(date+" · 공개 시간표 없음");continue;}
          for(const reason of l.blockedBy){
            if(/시정표|수업 시각/.test(reason))bells.push(date+" · "+l.period+"교시 · "+reason);
            if(/충돌|상충|중복|현재 학년도에 없는 학급|연결 학급 확인/.test(reason))conflicts.push(date+" · "+l.period+"교시 · "+reason);
          }
        }
      }
      rows.push(check("pub-refs","published","timetable","공개 시간표의 학급·교과 연결",links));
      rows.push(check("pub-bell","published","timetable","공개 수업·시정표 연결",bells,"warning"));
      rows.push(check("pub-conflict","published","timetable","공개 수업의 중복·충돌",conflicts));
      rows.push(check("pub-coverage","published","timetable","공개 자료 적용 범위",gaps,"warning"));
    }catch{rows.push(missing("pub-refs","published","timetable","공개 시간표 연결","공개 자료 비교 중 오류"));}
  }
  return rows;
}

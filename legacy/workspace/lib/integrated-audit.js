// Read-only audit shared by the dashboard, tests, and integrated QA view.
// No data mutations and no inferred curriculum instruction-hours.
import {createAcademic} from './academic.js';
import {tallyCalendar} from './calendar.js';
import {operationalPlan} from './curriculum.js';
import {checkScheduledSlots,timetableConfig,validateTimetableInput} from './timetable-solver.js';
import {planningSettings,planReviews} from './planning.js';

const lessonKey=r=>[r.scope,r.scopeId,r.subjectId,r.teacherId||'',r.room||''].join('|');
const note=(area,level,title,detail,route,date)=>({area,level,title,detail,route,date});
const addCount=(map,key,hours=1)=>map.set(key,(map.get(key)||0)+hours);

export function auditWorkspace(space,year){
  const y=Number(year),plan=space?.academics?.[String(y)]||null;
  const data={year:y,issues:[],sections:{},summary:{}};
  const issues=data.issues;
  const calendarEvents=(space?.events||[]).filter(e=>e.date<=`${y+1}-02-29`&&(e.endDate||e.date)>=`${y}-03-01`);
  if(!plan){
    issues.push(note('calendar','warning','학사일정이 아직 없습니다.',`${y}학년도 편성안을 먼저 생성해 주세요.`,'calendar'));
  }else{
    const cal=tallyCalendar(plan,calendarEvents);
    data.sections.calendar={days:cal.total,target:plan.targetDays||190,issues:cal.issues.length,grades:cal.grades};
    for(const problem of cal.issues){
      issues.push(note('calendar',problem.level==='error'?'error':problem.level==='warn'?'warning':'info',problem.title,problem.date||'', 'calendar',problem.date));
    }
    if(plan.status!=='confirmed')issues.push(note('calendar','info','학사일정이 아직 초안입니다.', '수업일수와 행사를 검토한 뒤 확정 여부를 결정하세요.','calendar'));
  }
  const curriculum=operationalPlan(space?.curricula,y);
  data.sections.curriculum={complete:curriculum.complete,grades:curriculum.grades.map(g=>({grade:g.grade,ready:g.ready,total:g.semesters.reduce((s,x)=>s+x.totals.total,0)}))};
  for(const g of curriculum.grades){
    if(!g.ready)issues.push(note('curriculum','warning',`${g.grade}학년 교육과정 편성 확인 필요`,`${g.cohortYear}년 입학생 편성 자료가 완료 상태가 아닙니다.`,'curriculum'));
    for(const sem of g.semesters){
      if(sem.target!==null&&sem.target!==undefined&&Number(sem.target)>0&&sem.totals.total!==Number(sem.target)){
        issues.push(note('curriculum','warning',`${g.grade}학년 ${sem.key.endsWith('-1')?'1':'2'}학기 목표시수 차이`,`입력 ${sem.totals.total}시간 · 목표 ${sem.target}시간. 해당 교육과정의 목표값과 비교한 결과입니다.`,'curriculum'));
      }
    }
  }
  if(plan){
    const cfg=timetableConfig(plan);
    const demands=cfg.lessons||[],slots=plan.weekly||[];
    const req=demands.reduce((sum,d)=>sum+(Number(d.hours)||0),0);
    const real=slots.length;
    data.sections.timetable={assignments:demands.length,requested:req,placed:real,classes:(plan.classes||[]).length};
    if(!demands.length){
      issues.push(note('timetable','warning','주간 수업 배정표가 비어 있습니다.','자동편성을 실행하기 전에 학급·교과·교사별 주당 시수를 입력하세요.','timetable'));
    }else{
      const validation=validateTimetableInput(plan,cfg);
      for(const title of validation.errors.slice(0,25))issues.push(note('timetable','error','수업 배정 조건 오류',title,'timetable'));
      const invalid=checkScheduledSlots(plan,slots,cfg);
      for(const title of invalid.slice(0,25))issues.push(note('timetable','error','기본 시간표 충돌',title,'timetable'));
      const expected=new Map(),actual=new Map(),groups=new Map();
      for(const d of demands){const key=lessonKey(d);addCount(expected,key,Number(d.hours)||0);groups.set(key,d);}
      for(const slot of slots)addCount(actual,lessonKey(slot));
      let missing=0,extra=0;const byClass=new Map();
      for(const [key,needed] of expected){
        const gap=needed-(actual.get(key)||0);
        if(gap>0){missing+=gap;const d=groups.get(key);addCount(byClass,d.scope==='group'?`활동반 ${plan.groups?.find(g=>g.id===d.scopeId)?.label||d.scopeId}`:plan.classes?.find(c=>c.id===d.scopeId)?.label||d.scopeId,gap);}
      }
      for(const [key,count] of actual){const diff=count-(expected.get(key)||0);if(diff>0)extra+=diff;}
      data.sections.timetable.missing=missing;
      data.sections.timetable.extra=extra;
      if(missing>0){issues.push(note('timetable','error',`배정표 대비 ${missing}교시 미배정`,`부족한 학급·활동반: ${[...byClass].slice(0,7).map(([label,h])=>`${label} ${h}시간`).join(' / ')}${byClass.size>7?' 외':''}`,'timetable'));}
      if(extra>0)issues.push(note('timetable','warning',`배정표와 일치하지 않는 시간표 ${extra}교시`,`기본 시간표에 있으나 수업 배정표의 학급·과목·교사·특별실 조합과 맞지 않습니다.`,'timetable'));
      if(!slots.length)issues.push(note('timetable','warning','기본 시간표가 비어 있습니다.','배정표만 입력한 상태에서는 학년도 수업 시수 연동을 확인할 수 없습니다.','timetable'));
    }
  }
  const settings=planningSettings(space),reviews=planReviews(space);
  const keys=Object.keys(reviews).filter(k=>k.startsWith(`${y}-`)||k.startsWith(`${y+1}-01`)||k.startsWith(`${y+1}-02`));
  const stale=keys.filter(k=>reviews[k]?.stale).length;
  data.sections.plans={entries:(space?.planEntries||[]).length,reviews:keys.length,stale,departments:settings.departments.filter(x=>x.active!==false).length};
  if(stale)issues.push(note('plans','warning',`부서별 재확인이 필요한 계획 ${stale}건`,`확인 이후 내용이 바뀐 부서의 월중계획을 다시 검토하세요.`,'plans'));
  data.summary={errors:issues.filter(x=>x.level==='error').length,warnings:issues.filter(x=>x.level==='warning').length,info:issues.filter(x=>x.level==='info').length,checkedAt:null};
  return data;
}

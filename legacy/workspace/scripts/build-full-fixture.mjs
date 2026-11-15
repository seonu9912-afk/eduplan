import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildTimetableTasks,timetableConfig,checkScheduledSlots} from '../lib/timetable-solver.js';
import {instructionForGrade,weekday,eventOverlapsForDate,summarizeAcademic,planForDate} from '../lib/academic.js';
import {isoDate,addDays,mondayOf,scheduleRows,planningSettings,defaultDepartments} from '../lib/planning.js';
import {makeBackup,parseBackup} from '../lib/workspace.js';
const file=new URL('../data/general-middle-2027-balanced.json',import.meta.url);
const original=JSON.parse(fs.readFileSync(file,'utf8'));
const school=original.schools[0],space=original.workspaces[school.id],plan=space.academics['2027'];
const assignments=JSON.parse(fs.readFileSync(new URL('../data/timetable-19-solution.json',import.meta.url),'utf8'));
const tasks=buildTimetableTasks(plan,timetableConfig(plan)).tasks;
const done=new Set(),weekly=[];
for(const [i,day,p] of assignments){
  if(done.has(i))throw Error(`duplicate task ${i}`);done.add(i);
  const task=tasks[i];
  for(const b of task.blocks)for(let off=0;off<task.length;off++){
    const row=b.row;
    weekly.push({id:`auto-${row.id}-${b.index}-${off}`,scope:row.scope,scopeId:row.scopeId,subjectId:row.subjectId,teacherId:row.teacherId||'',room:row.room||'',weekday:day,period:p+off,source:'auto'});
  }
}
assert.equal(done.size,tasks.length);
assert.equal(weekly.length,627);
assert.deepEqual(checkScheduledSlots(plan,weekly,timetableConfig(plan)),[]);
const lookup=Object.fromEntries(plan.subjects.map(s=>[s.id,s.label]));
for(const cl of plan.classes){const ss=weekly.filter(s=>s.scopeId===cl.id);assert.equal(ss.length,33);assert.equal(new Set(ss.map(s=>`${s.weekday}-${s.period}`)).size,33);}
plan.weekly=weekly;plan.status='draft';plan.timetableConfigured=true;
plan.timetableConfig.lastApplied=null;
space.events=[];
const eventDates=new Set();
function eligible(date,grades){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const list=grades?.length?grades:[1,2,3];return list.every(grade=>instructionForGrade(plan,date,grade));}
function addEvent(name,initialDate,grades=[],start=1,end=6,area='creative_self',department='교무부',volunteer=false,affects=true){
  let date=initialDate,tries=0;
  const full=grades.length===0;
  while(tries++<30){
    if(!eligible(date,grades)){date=addDays(date,1);continue;}
    const next={id:`sim-event-${space.events.length+1}`,name,date,grades,periodStart:start,periodEnd:end,curriculumArea:area,affectsTimetable:affects,volunteer,department};
    if(affects&&eventOverlapsForDate(plan,date,[...space.events,next]).length){date=addDays(date,1);continue;}
    space.events.push(next);eventDates.add(date);return next;
  }
  throw Error(`Cannot place ${name} near ${initialDate}`);
}
// Whole-school administration, ceremonies and major student programmes.
[
 ['입학식·시업식','2027-03-02',[],1,2,'creative_self','교무부'],
 ['신학기 학교생활 적응교육','2027-03-03',[],1,3,'creative_self','학생생활부'],
 ['학생회 임원 선거','2027-03-18',[],5,6,'creative_self','학생생활부'],
 ['학교폭력 예방 교육','2027-03-26',[],1,2,'creative_self','학생생활부'],
 ['1학년 진로 적성 탐색','2027-04-13',[1],1,4,'creative_career','진로교육부'],
 ['전 학년 안전·재난 교육','2027-04-20',[],1,2,'creative_self','학생생활부'],
 ['과학의 날 체험','2027-04-23',[],3,6,'creative_club','교육과정부'],
 ['체육대회','2027-05-14',[],1,6,'creative_self','학생생활부'],
 ['학생 자치 자율 기획 활동','2027-05-21',[],5,6,'creative_self','학생생활부'],
 ['독서·문해력 체험 주간','2027-06-11',[],3,6,'creative_club','연구부'],
 ['2학년 수학여행 1일차','2027-06-16',[2],1,6,'creative_self','2학년부'],
 ['2학년 수학여행 2일차','2027-06-17',[2],1,6,'creative_self','2학년부'],
 ['2학년 수학여행 3일차','2027-06-18',[2],1,6,'creative_self','2학년부'],
 ['1학년 수련회 1일차','2027-06-23',[1],1,6,'creative_self','1학년부'],
 ['1학년 수련회 2일차','2027-06-24',[1],1,6,'creative_self','1학년부'],
 ['3학년 진로·진학 특강','2027-06-25',[3],1,5,'creative_career','진로교육부'],
 ['지역사회 환경정화 봉사','2027-07-02',[],5,6,'creative_self','학생생활부',true],
 ['1학기 동아리 활동 발표','2027-07-16',[],3,6,'creative_club','교육과정부'],
 ['방학 안전교육','2027-07-23',[],5,6,'creative_self','학생생활부'],
 ['2학기 학생자치 연수','2027-08-25',[],5,6,'creative_self','학생생활부'],
 ['3학년 진학정보 탐색','2027-09-02',[3],3,6,'creative_career','진로교육부'],
 ['1학년 현장체험학습','2027-09-17',[1],1,6,'creative_career','1학년부'],
 ['학교 스포츠 한마당','2027-10-15',[],1,6,'creative_self','학생생활부'],
 ['2학년 진로 현장체험','2027-10-22',[2],1,6,'creative_career','2학년부'],
 ['학생 봉사 실천의 날','2027-11-05',[],5,6,'creative_self','학생생활부',true],
 ['3학년 현장체험학습','2027-11-12',[3],1,6,'creative_career','3학년부'],
 ['학교 예술제','2027-11-26',[],1,6,'creative_club','교육과정부'],
 ['동아리 발표회','2027-12-17',[],5,6,'creative_club','교육과정부'],
 ['학생 자치 활동 평가회','2027-12-24',[],5,6,'creative_self','학생생활부'],
 ['지역사회 나눔·봉사 활동','2027-12-30',[],3,5,'creative_self','학생생활부',true],
 ['3학년 졸업 프로그램','2028-01-04',[3],1,4,'creative_self','3학년부'],
 ['졸업식','2028-01-06',[3],1,4,'creative_self','교무부'],
 ['종업식','2028-01-07',[1,2],1,2,'creative_self','교무부'],
].forEach(x=>addEvent(...x));
for(let m=3;m<=12;m++){
  const year=2027;const month=String(m).padStart(2,'0');
  addEvent(`${m}월 학급 자치회의`,`${year}-${month}-09`,[],5,5,'creative_self','학생생활부');
  addEvent(`${m}월 주제별 동아리활동`,`${year}-${month}-16`,[],5,5,'creative_club','교육과정부');
  addEvent(`${m}월 진로 탐색 워크숍`,`${year}-${month}-23`,[],5,5,'creative_career','진로교육부');
}
// Staff-only meetings remain referenced in school operations but do not replace lessons.
for(let m=3;m<=12;m++)addEvent(`${m}월 교직원 전체 협의회`,`2027-${String(m).padStart(2,'0')}-07`,[],0,0,'none','교무부',false,false);
assert(space.events.length>60);
const eventOverlaps=[];
for(const e of space.events){if(e.affectsTimetable)eventOverlaps.push(...eventOverlapsForDate(plan,e.date,space.events));}
assert.equal(eventOverlaps.length,0,'calendar events should not conflict');
// School-wide and grade-level events are projected into daily timetable without mutating weekly defaults.
const verifiedEvent=space.events.find(e=>e.name==='체육대회');
assert(planForDate(plan,verifiedEvent.date,space.events).some(s=>s.source==='event'));
const regularCount=plan.weekly.length;
assert.equal(regularCount,627);
// School departments are configurable, not hard-coded to an alternative school.
const deptSpecs=[...defaultDepartments,
 {id:'dept-g1',name:'1학년부',short:'1학년',color:'#3884BC',active:true},
 {id:'dept-g2',name:'2학년부',short:'2학년',color:'#6987B2',active:true},
 {id:'dept-g3',name:'3학년부',short:'3학년',color:'#6D72AD',active:true},
 {id:'dept-career',name:'진로교육부',short:'진로',color:'#2B987B',active:true}];
space.planningSettings={departments:deptSpecs,dutyEnabled:false,showSaturday:true,showAcademic:true,showTasks:true};
space.planEntries=[];space.planTrips=[];space.planDuties=[];space.planDiscussions=[];space.planNotices=[];space.planReviews={};
const weeklyTitles=[
 ['교무부','주간 교육활동 운영 협의','월요일 운영회의','교무실'],
 ['연구부','교과별 수업 나눔·평가 협의','수업연구','교사연구실'],
 ['학생생활부','학생 안전·생활지도 점검','생활교육','학생생활부'],
 ['교육과정부','창의적 체험활동 운영 점검','창체운영','교육과정부'],
 ['행정실','학교 시설·교육환경 점검','시설안전','행정실'],
];
const weeks=new Map();
const lastDate='2028-02-29';
for(let date='2027-03-01';date<=lastDate;date=addDays(date,1)){
  if(!eligible(date,[]))continue;
  const dow=weekday(date);const week=mondayOf(date);if(!weeks.has(week))weeks.set(week,[]);weeks.get(week).push(date);
  if(dow<1||dow>5)continue;
  const [department,title,time,place]=weeklyTitles[dow-1];
  space.planEntries.push({id:`ops-week-${space.planEntries.length+1}`,date,department,title,time:'16:00',place,target:'교직원',note:`${time} · 2027학년도 가상 사례`,monthly:true,weekly:true,order:1});
}
for(const event of space.events.filter(e=>e.affectsTimetable&&e.periodEnd>=4)){
  const day=addDays(event.date,-7);
  space.planEntries.push({id:`ops-event-${event.id}`,date:eligible(day,[])?day:event.date,
    department:event.department||'교무부',title:`${event.name} 준비사항 확인`,time:'15:30',place:'관련 부서',target:'담당 교직원',note:'학사행사는 참조로 표시되므로 이 항목은 업무 준비 계획임',monthly:true,weekly:true,order:2});
  space.tasks.push({id:`task-${event.id}`,title:`${event.name} 시행 계획 확정`,department:event.department||'교무부',due:eligible(day,[])?day:event.date,eventId:event.id,status:'예정'});
}
for(const [week,dates] of weeks){
  if(dates.length){space.planNotices.push({id:`notice-${space.planNotices.length}`,week,body:`${week} 주간 학사운영 안내: 부서별 일정 확인 및 행사 전 안전점검`});}
}
let tripCount=0,discCount=0;
for(const [week,dates] of weeks){
  if(dates.length&&tripCount<40){const date=dates[Math.min(2,dates.length-1)];space.planTrips.push({id:`trip-${++tripCount}`,date,person:`교사 ${String.fromCharCode(65+tripCount%12)}`,title:'교육청 연수·업무협의 출장',time:'13:00~17:00',place:'교육지원청',note:'가상 일정'});}
  if(dates.length&&discCount<40){space.planDiscussions.push({id:`discussion-${++discCount}`,week,department:deptSpecs[discCount%deptSpecs.length].name,title:'교육과정 운영 협의',body:`${week} 주간 교육과정, 행사, 수업 안전 관련 협의 사항 (가상 사례)`});}
}
for(let m=3;m<=14;m++){
  const realYear=2027+Math.floor((m-1)/12),realMonth=(m-1)%12+1;
  const month=`${realYear}-${String(realMonth).padStart(2,'0')}`;
  for(const [index,department] of deptSpecs.entries()){
    space.planReviews[`${month}|${department.name}`]={confirmed:true,stale:index%6===0,confirmedAt:'2027-02-20T00:00:00.000Z'};
  }
}
// Reusable forms and reports exercise the remaining workspace data paths.
space.forms=[{id:'form-meeting',name:'학년 협의록',description:'주간 학년 협의 사항',version:1,created:'2027-02-10',updated:'2027-02-10',fields:[
  {id:'fm-date',label:'회의 날짜',type:'date',required:true,options:''},
  {id:'fm-agenda',label:'주요 안건',type:'textarea',required:true,options:''},
  {id:'fm-followup',label:'후속 조치',type:'textarea',required:false,options:''}]}];
space.formEntries=Array.from({length:12},(_,i)=>({id:`entry-${i+1}`,formId:'form-meeting',formTitle:'학년 협의록',formVersion:1,fields:space.forms[0].fields,
  values:{'fm-date':`2027-${String(i%10+3).padStart(2,'0')}-05`,'fm-agenda':'학사일정과 학생 활동 조정 검토','fm-followup':'담당 부서별 회신'},created:'2027-03-01',updated:'2027-03-01'}));
space.menus=[{id:'menu-year-meeting',title:'학년 협의록',type:'form',formId:'form-meeting'}];
space.docs=[{id:'doc-01',title:'2027학년도 학사운영 협의 기록',template:'meeting',body:'행사 편성 협의와 부서별 검토 사항을 기록하는 가상 문서입니다.',updated:'2027-03-01'},
{id:'doc-02',title:'수업 결손·보강 운영계획',template:'plan',body:'교환수업·보강 계획 및 시간표 변경 내역을 관리합니다.',updated:'2027-09-01'}];
space.links=[{id:'link1',title:'나이스 대국민서비스',url:'https://www.neis.go.kr',category:'업무'},{id:'link2',title:'교육부',url:'https://www.moe.go.kr',category:'참고'}];
space.description='일반중학교 19학급·교원 34명 조건으로 전체 학사·교육과정·시간표·업무계획을 편성한 실증 예시. 실제 학교의 확정 계획이 아닙니다.';
school.name='가상 일반중학교 · 2027 통합 실증';
school.id='general-middle-2027-full';
space.enabled=Object.fromEntries(['calendar','curriculum','timetable','academic','plans','forms','documents','links','services'].map(key=>[key,true]));
space.exampleMeta={dataIsSample:true,label:'19학급 통합 시나리오',source:'synthetic'};
space.sampleStatus={name:'2027 일반중학교 학사·교육과정·시간표 통합 실증',synthetic:true,timetableSource:'외부 MILP 최적화 결과를 검증하여 탑재',referenceDataOnly:true};
const db={schools:[school],workspaces:{[school.id]:space}};
const sum=summarizeAcademic(plan,space.events);
const all=makeBackup(db);assert(parseBackup(all,{enabled:{}}).workspaces[school.id].academics['2027'].weekly.length===627);
assert(space.planEntries.length>160);assert(space.planNotices.length>30);assert(space.planTrips.length>=30);
assert(scheduleRows(space,'2027-05-01','2027-05-31',planningSettings(space),'month').some(x=>x.source==='academic'));
fs.writeFileSync(new URL('../data/general-middle-2027-full.json',import.meta.url),JSON.stringify(db,null,2));
fs.writeFileSync(new URL('../data/general-middle-2027-results.json',import.meta.url),JSON.stringify({classes:19,teachers:34,weeklySlots:weekly.length,demands:plan.timetableConfig.lessons.length,events:space.events.length,planEntries:space.planEntries.length,planNotices:space.planNotices.length,trips:space.planTrips.length,discussions:space.planDiscussions.length,tasks:space.tasks.length,forms:space.forms.length,formEntries:space.formEntries.length,annualDays:sum.daysTotal,term1:sum.firstTerm,term2:sum.secondTerm,academicConflicts:sum.conflicts.length,warnings:sum.warnings.slice(0,25)},null,2));
console.log('RESULT',JSON.stringify({weekly:weekly.length,events:space.events.length,entries:space.planEntries.length,trips:space.planTrips.length,notices:space.planNotices.length,academicConflicts:sum.conflicts.length,warnings:sum.warnings.length}));

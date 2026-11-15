import {academicStart,academicEnd,classesForSlot,instructionForGrade,planForDate} from './academic.js';
import {timetableConfig} from './timetable-solver.js';
const slotAt=(plan,events,date,scopeId,period)=>planForDate(plan,date,events).filter(s=>s.period===period&&classesForSlot(plan,s).includes(scopeId));
const mkId=()=>`change-${Math.random().toString(36).slice(2,11)}`;
const replace=(date,slot,scopeId,period,note)=>({id:mkId(),date,scope:'class',scopeId,period,action:'replace',subjectId:slot.subjectId,teacherId:slot.teacherId||'',room:slot.room||'',note});
function conflictsForDate(plan,events,date){
  const sets={classes:new Set(),teachers:new Set(),rooms:new Set()},result=[];
  for(const slot of planForDate(plan,date,events)){
    for(const cid of classesForSlot(plan,slot)){const key=`${cid}/${slot.period}`;if(sets.classes.has(key))result.push(`학급 ${cid} ${slot.period}교시 중복`);sets.classes.add(key);}
    if(slot.teacherId){const key=`${slot.teacherId}/${slot.period}`;if(sets.teachers.has(key))result.push(`교사 ${slot.teacherId} ${slot.period}교시 중복`);sets.teachers.add(key);}
    if(slot.room){const key=`${slot.room}/${slot.period}`;if(sets.rooms.has(key))result.push(`특별실 ${slot.room} ${slot.period}교시 중복`);sets.rooms.add(key);}
  }
  return result;
}
function checkProposal(plan,events,changes,dates){
  const affected=new Set(changes.map(x=>`${x.date}/${x.scopeId}/${x.period}`));
  const overrides=(plan.overrides||[]).filter(x=>!affected.has(`${x.date}/${x.scopeId}/${x.period}`));
  const modified={...plan,overrides:[...overrides,...changes]};
  const errors=[];
  for(const date of new Set(dates)){
    const old=conflictsForDate(plan,events,date),next=conflictsForDate(modified,events,date);
    const counts=new Map();for(const x of old)counts.set(x,(counts.get(x)||0)+1);
    for(const x of next){const n=counts.get(x)||0;if(n)counts.set(x,n-1);else errors.push(`${date}: ${x}`);}
  }
  return {ok:errors.length===0,errors,changes};
}
export function proposeSwap(plan,events,{classId,firstDate,firstPeriod,secondDate,secondPeriod}){
  if(firstDate===secondDate&&Number(firstPeriod)===Number(secondPeriod))return {ok:false,errors:['같은 수업끼리는 교환할 수 없습니다.'],changes:[]};
  const cls=(plan.classes||[]).find(c=>c.id===classId);
  if(firstDate<academicStart(plan.year)||secondDate>academicEnd(plan.year)||firstDate>academicEnd(plan.year)||secondDate<academicStart(plan.year))return {ok:false,errors:['편성 학년도 범위의 날짜만 선택해 주세요.'],changes:[]};
  if(!cls)return {ok:false,errors:['학급을 선택하세요.'],changes:[]};
  if(!instructionForGrade(plan,firstDate,cls.grade)||!instructionForGrade(plan,secondDate,cls.grade))return {ok:false,errors:['휴업일·방학에는 수업을 교환할 수 없습니다.'],changes:[]};
  const a=slotAt(plan,events,firstDate,classId,Number(firstPeriod)),b=slotAt(plan,events,secondDate,classId,Number(secondPeriod));
  if(a.length!==1||b.length!==1||a[0].scope!=='class'||b[0].scope!=='class')return {ok:false,errors:['교환할 두 수업이 각각 해당 학급의 일반 수업인지 확인하세요. 합반·분반 활동은 이 기능에서 직접 교환할 수 없습니다.'],changes:[]};
  if(a[0].source==='event'||b[0].source==='event')return {ok:false,errors:['학사일정으로 대체된 행사 수업은 여기서 교환할 수 없습니다.'],changes:[]};
  const changes=[replace(firstDate,b[0],classId,Number(firstPeriod),'수업 교환'),replace(secondDate,a[0],classId,Number(secondPeriod),'수업 교환')];
  return checkProposal(plan,events,changes,[firstDate,secondDate]);
}
export function proposeMakeup(plan,events,{classId,date,period,subjectId,teacherId='',room=''}){
  const cls=(plan.classes||[]).find(c=>c.id===classId);
  if(date<academicStart(plan.year)||date>academicEnd(plan.year))return {ok:false,errors:['편성 학년도 범위의 날짜만 선택해 주세요.'],changes:[]};
  if(!cls)return {ok:false,errors:['학급을 선택하세요.'],changes:[]};
  if(!instructionForGrade(plan,date,cls.grade))return {ok:false,errors:['수업일에만 보강을 등록할 수 있습니다.'],changes:[]};
  const cfg=timetableConfig(plan);const day=new Date(`${date}T12:00:00Z`).getUTCDay();
  if(!Number.isInteger(Number(period))||Number(period)<1||Number(period)>Number(cfg.periods[day]||0))return {ok:false,errors:['지정한 교시는 해당 요일의 운영 교시를 벗어납니다.'],changes:[]};
  if(slotAt(plan,events,date,classId,Number(period)).length)return {ok:false,errors:['해당 학급에 이미 수업이 있습니다. 보강은 비어 있는 교시에만 추가할 수 있습니다.'],changes:[]};
  if(!(plan.subjects||[]).some(x=>x.id===subjectId))return {ok:false,errors:['보강 과목을 선택하세요.'],changes:[]};
  if(teacherId&&!(plan.teachers||[]).some(x=>x.id===teacherId))return {ok:false,errors:['보강 담당 교사가 존재하지 않습니다.'],changes:[]};
  const chosen={subjectId,teacherId,room};
  const changes=[replace(date,chosen,classId,Number(period),'보강')];
  return checkProposal(plan,events,changes,[date]);
}

// Exact dated schedule comparison for a proposed calendar-event edit.
// Counts occupied class periods in the actual timetable; no guessed annual hours.
import {academicStart,academicEnd,rangeDates,planForDate,classesForSlot,eventOverlapsForDate} from './academic.js';
import {inYear} from './calendar.js';
const eventRange=(ev,year)=>ev&&inYear(year,ev.date)?rangeDates(ev.date,ev.endDate&&ev.endDate>=ev.date?ev.endDate:ev.date).filter(x=>x>=academicStart(year)&&x<=academicEnd(year)):[];
const subjectLabel=(plan,id)=>(plan.subjects||[]).find(s=>s.id===id)?.label||id;
const sameEvents=(events,edit)=>{const originalId=edit?.id;return [...(events||[]).filter(e=>!originalId||e.id!==originalId),{...edit,affectsTimetable:!!edit.curriculumArea&&edit.curriculumArea!=='none',id:originalId||'__proposed__'}];};
export function previewEventImpact(plan,events,edit){
  if(!edit?.date||!inYear(plan.year,edit.date))return {available:false,reason:'학년도에 맞는 시작일을 선택해 주세요.'};
  const original=edit.id?(events||[]).find(e=>e.id===edit.id):null;
  const dates=[...new Set([...eventRange(original,plan.year),...eventRange(edit,plan.year)])].sort();
  if(!dates.length)return {available:false,reason:'학년도 범위 안의 일정을 선택해 주세요.'};
  if(dates.length>45)return {available:false,reason:'45일을 넘는 일정 변경은 이 화면에서 시수 영향을 계산하지 않습니다. 저장 후 통합 점검을 확인하세요.'};
  const before=new Map(),after=new Map(),oldEvents=events||[],newEvents=sameEvents(oldEvents,edit);
  let former=0,latter=0;
  const visit=(dataset,store,date)=>{
    let hours=0;
    for(const slot of planForDate(plan,date,dataset)){
      const count=classesForSlot(plan,slot).length;
      const label=subjectLabel(plan,slot.subjectId);
      store.set(label,(store.get(label)||0)+count);
      hours+=count;
    }
    return hours;
  };
  const overlaps=[];
  for(const date of dates){former+=visit(oldEvents,before,date);latter+=visit(newEvents,after,date);overlaps.push(...eventOverlapsForDate(plan,date,newEvents));}
  const changes=[...new Set([...before.keys(),...after.keys()])].map(subject=>({subject,before:before.get(subject)||0,after:after.get(subject)||0,delta:(after.get(subject)||0)-(before.get(subject)||0)})).filter(x=>x.delta!==0).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  return {available:true,dates:dates.length,before:former,after:latter,delta:latter-former,changes,overlaps:overlaps.slice(0,4),overlapCount:overlaps.length,hasTimetable:!!plan.weekly?.length};
}

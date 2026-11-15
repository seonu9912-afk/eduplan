import {rangeDates,academicStart,academicEnd} from './academic.js';
import {inYear,tallyCalendar,dateEvents,RULE_KINDS} from './calendar.js';

// One pure reducer powers both the on-screen preview and the actual save.
// This avoids the preview promising different results from the stored plan.
export function planDateChange(plan,selection,scope='all'){
  const {start,end,kind,label=''}=selection||{};
  if(!inYear(plan.year,start)||!inYear(plan.year,end)||start>end||!RULE_KINDS[kind]){
    return {error:'학년도 범위 안에서 시작일·종료일·운영 구분을 확인해 주세요.'};
  }
  const dates=rangeDates(start,end);
  if(!dates.length||dates.length>120)return {error:'한 번에 최대 120일까지만 편성할 수 있습니다.'};
  const targetGrade=scope==='all'?null:Number(scope);
  if(targetGrade!==null && ![...new Set((plan.classes||[]).map(c=>Number(c.grade)))].includes(targetGrade))return {error:'유효한 학년을 선택하세요.'};
  const dateSet=new Set(dates);
  const entries=dates.map(date=>({date,kind,label:label.trim().slice(0,60),weekdayOverride:0,source:'manual',...(targetGrade===null?{}:{grade:targetGrade})}));
  const next=targetGrade===null
    ?{...plan,dayRules:[...(plan.dayRules||[]).filter(r=>!dateSet.has(r.date)),...entries].sort((a,b)=>a.date.localeCompare(b.date))}
    :{...plan,gradeRules:[...(plan.gradeRules||[]).filter(r=>!(dateSet.has(r.date)&&Number(r.grade)===targetGrade)),...entries].sort((a,b)=>a.date.localeCompare(b.date))};
  return {plan:next,dates};
}
export function previewDateChange(plan,selection,scope='all',events=[]){
  const result=planDateChange(plan,selection,scope);
  if(result.error)return result;
  const before=tallyCalendar(plan,events);
  const after=tallyCalendar(result.plan,events);
  const changed=[];
  for(const g of before.grades){const delta=after.byGrade[g].total-before.byGrade[g].total;if(delta)changed.push({grade:g,delta,after:after.byGrade[g].total});}
  const impactedEvents=(events||[]).filter(e=>result.dates.some(d=>dateEvents([e],d).length)).map(e=>({id:e.id,name:e.name,date:e.date}));
  return {plan:result.plan,dates:result.dates,before,after,changed,
    commonDelta:after.total-before.total,impactedEvents,
    underTarget:after.grades.filter(g=>after.byGrade[g].total<Number(plan.targetDays||190)),
  };
}

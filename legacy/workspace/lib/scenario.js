// Date-rule scenario preview: only count timetable hours where an actual class/group slot exists.
// Never guess curriculum hours based on a weekday alone.
import {planDateChange} from './impact.js';
import {planForDate,classesForSlot,categoryOf} from './academic.js';
export function previewPeriodImpact(plan,selection,scope='all',events=[]){
  const change=planDateChange(plan,selection,scope);
  if(change.error)return change;
  const subjects=new Map((plan.subjects||[]).map(x=>[x.id,x]));
  const eligible=new Set((plan.classes||[]).filter(c=>scope==='all'||Number(c.grade)===Number(scope)).map(c=>c.id));
  const breakdown=new Map();let before=0,after=0;
  const collect=(p,date,label)=>{
    let sum=0;
    for(const slot of planForDate(p,date,events)){
      const subject=subjects.get(slot.subjectId);if(!subject)continue;
      const affected=(classesForSlot(p,slot)||[]).filter(cid=>eligible.has(cid));
      if(!affected.length)continue;
      const hourCount=affected.length;
      const rec=breakdown.get(slot.subjectId)||{subjectId:slot.subjectId,subject:subject.label||subject.name||slot.subjectId,kind:categoryOf(subject.kind),before:0,after:0};
      rec[label]+=hourCount;breakdown.set(slot.subjectId,rec);sum+=hourCount;
    }
    return sum;
  };
  for(const date of change.dates){before+=collect(plan,date,'before');after+=collect(change.plan,date,'after');}
  return {available:!!(plan.weekly?.length),dates:change.dates,before,after,delta:after-before,subjectChanges:[...breakdown.values()].map(x=>({...x,delta:x.after-x.before})).filter(x=>x.delta!==0).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)),plan:change.plan};
}

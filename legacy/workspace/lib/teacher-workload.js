// School-adjustable scheduling quality criteria. These are operational defaults,
// NOT statutory teacher working-time limits. Lunch interrupts a teaching streak.
import {WDAYS,WDAY_NAMES} from './timetable-solver.js';
export const DEFAULT_TEACHER_QUALITY=Object.freeze({maxDailyLessons:5,maxConsecutiveLessons:3,targetDailySpread:2});
export function teacherQuality(config={}){
  const input=config.teacherQuality||{};
  const read=(key,min,max)=>{const value=Number(input[key]);return Number.isInteger(value)&&value>=min&&value<=max?value:DEFAULT_TEACHER_QUALITY[key];};
  return {maxDailyLessons:read('maxDailyLessons',2,9),maxConsecutiveLessons:read('maxConsecutiveLessons',2,6),targetDailySpread:read('targetDailySpread',0,6)};
}
export function teachingSegments(config={},day){
  const count=Number(config.periods?.[day]||7);
  const bell=Array.isArray(config.bell)?config.bell:[];
  const lessons=bell.filter(b=>b.type==='lesson'&&Number.isInteger(Number(b.period))&&b.start&&b.end).sort((a,b)=>a.period-b.period);
  const lunch=bell.filter(b=>b.type==='lunch'&&b.start&&b.end);
  const cuts=new Set();
  for(const row of lunch){
    const before=lessons.filter(b=>b.end<=row.start&&b.period<count).at(-1);
    const after=lessons.find(b=>b.start>=row.end&&Number(b.period)>Number(before?.period));
    if(before&&after&&Number(after.period)===Number(before.period)+1)cuts.add(Number(before.period));
  }
  // Standard middle-school default: lunch after fourth period.
  if(!lessons.length&&count>=5)cuts.add(4);
  const segments=[];let current=[];
  for(let p=1;p<=count;p++){
    current.push(p);
    if(cuts.has(p)){segments.push(current);current=[];}
  }
  if(current.length)segments.push(current);
  return segments;
}
export function teacherWorkloadReport(plan,slots=plan?.weekly||[],config=plan?.timetableConfig||{}){
  const settings=teacherQuality(config), teachers=new Map((plan?.teachers||[]).map(t=>[t.id,t]));
  const schedule=new Map();
  for(const slot of slots||[]){
    if(!slot.teacherId||!teachers.has(slot.teacherId)||!WDAYS.includes(Number(slot.weekday))||!Number.isInteger(Number(slot.period)))continue;
    const key=slot.teacherId;
    if(!schedule.has(key))schedule.set(key,new Map(WDAYS.map(d=>[d,new Set()])));
    schedule.get(key).get(Number(slot.weekday)).add(Number(slot.period));
  }
  const rows=[];
  for(const [id,days] of schedule){
    const counts=WDAYS.map(d=>days.get(d).size),sum=counts.reduce((a,b)=>a+b,0);
    const maximum=Math.max(...counts), minimum=Math.min(...counts),spread=maximum-minimum;
    let maxRun=0,longRunDays=[],longDayDays=[];
    for(const day of WDAYS){
      for(const periods of teachingSegments(config,day)){
        let run=0;
        for(const p of periods){run=days.get(day).has(p)?run+1:0;maxRun=Math.max(maxRun,run);}
      }
      if(counts[day-1]>settings.maxDailyLessons)longDayDays.push(WDAY_NAMES[day]);
      if(teachingSegments(config,day).some(segment=>{let run=0;return segment.some(p=>{run=days.get(day).has(p)?run+1:0;return run>settings.maxConsecutiveLessons;});}))longRunDays.push(WDAY_NAMES[day]);
    }
    const issues=[];
    if(longDayDays.length)issues.push(`하루 ${settings.maxDailyLessons}교시 초과 (${longDayDays.join('·')})`);
    if(longRunDays.length)issues.push(`연속 ${settings.maxConsecutiveLessons}교시 초과 (${longRunDays.join('·')})`);
    if(spread>settings.targetDailySpread&&sum>=10)issues.push(`요일별 편차 ${spread}교시 (권장 ${settings.targetDailySpread} 이내)`);
    rows.push({id,label:teachers.get(id).label||id,counts,total:sum,maximum,minimum,spread,maxRun,issues,hardViolations:longDayDays.length+longRunDays.length});
  }
  rows.sort((a,b)=>b.hardViolations-a.hardViolations||b.spread-a.spread||a.label.localeCompare(b.label,'ko'));
  return {settings,rows,flagged:rows.filter(x=>x.issues.length).length,hardViolations:rows.reduce((n,x)=>n+x.hardViolations,0),total:rows.length,balanced:rows.filter(x=>!x.issues.length).length};
}
export function teacherHoursPreflight(plan,config){
  const q=teacherQuality(config), totals=new Map(),labels=new Map((plan.teachers||[]).map(t=>[t.id,t.label]));
  for(const d of config.lessons||[])if(d.teacherId)totals.set(d.teacherId,(totals.get(d.teacherId)||0)+Number(d.hours||0));
  const errors=[];
  for(const [id,n] of totals){const capacity=WDAYS.length*q.maxDailyLessons;
    if(n>capacity)errors.push(`${labels.get(id)||id}: 주당 ${n}교시는 하루 최대 ${q.maxDailyLessons}교시 × ${WDAYS.length}일(총 ${capacity}교시)을 초과합니다. 교사별 배정을 조정하거나 학교 편성 기준을 변경하세요.`);
  }
  return errors;
}

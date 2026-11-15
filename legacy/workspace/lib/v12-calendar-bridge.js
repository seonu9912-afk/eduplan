/**
 * AcademicPlannerRedesign_v12 compatibility port.
 * v12 terminology and arithmetic are retained at this read-only boundary.
 * EduPlan's academics[year].dayRules and space.events remain the single source
 * of truth for date state and events; nothing is synced back to Google Sheets.
 */
import {academicStart,academicEnd,rangeDates,weekday,getTerm2Start} from './academic.js';
import {isInstructionDate,effectiveDateRule,gradeIds,inYear,ymd} from './calendar.js';
const DOW=['일','월','화','수','목','금','토'];
export const V12_AREAS=['교과','자율','동아리','진로','봉사','없음'];
export const V12_TYPES={instructional:'수업일',weekend:'주말',holiday:'공휴일',vacation:'방학',discretionary:'재량휴업일',swap:'요일교체'};
export const V12_TO_EDUPLAN={교과:'subject',자율:'creative_self',동아리:'creative_club',진로:'creative_career',봉사:'creative_self',없음:'none'};
export const EDUPLAN_TO_V12={subject:'교과',creative_self:'자율',creative_club:'동아리',creative_career:'진로',sports:'동아리',none:'없음',autonomous:'교과'};
export function v12TermForDate(plan,date){
  // Original v12 uses summerEnd when available and Mar-Aug fallback otherwise.
  const summer=(plan.dayRules||[]).filter(r=>r.kind==='vacation'&&/여름|하계/.test(r.label||'')&&r.date>=`${plan.year}-06-01`&&r.date<=`${plan.year}-09-15`).sort((a,b)=>a.date.localeCompare(b.date));
  const end=summer.at(-1)?.date;
  if(end)return date>end?2:1;
  const mon=Number(date.slice(5,7));return mon>=3&&mon<=8?1:2;
}
export function v12Day(plan,date){
  const r=effectiveDateRule(plan,date),w=weekday(date);
  let type=w===0||w===6?'weekend':'instructional';
  if(r){if(r.kind==='instruction')type=r.weekdayOverride&&r.weekdayOverride!==w?'swap':'instructional';
    else if(r.kind==='holiday')type='holiday';
    else if(r.kind==='vacation')type='vacation';
    else type=(w===0||w===6)&&!r.label?'weekend':'discretionary';}
  return {날짜:date,요일:DOW[w],학기:v12TermForDate(plan,date),유형:type,명칭:r?.label||'',적용요일:type==='swap'?DOW[r.weekdayOverride]:'',사용:true};
}
export const v12Days=plan=>rangeDates(academicStart(plan.year),academicEnd(plan.year)).map(date=>v12Day(plan,date));
export function gradeArea(event,grade){return event.gradeAreas?.[grade]||event.gradeAreas?.[String(grade)]||
  (event.grades?.length&&!event.grades.map(Number).includes(Number(grade))?'없음':event.volunteer?'봉사':EDUPLAN_TO_V12[event.curriculumArea||'none']||'없음');}
export function v12Events(plan,events=[]){return events.filter(e=>e.date<=academicEnd(plan.year)&&(e.endDate||e.date)>=academicStart(plan.year)).map(e=>({
  행사ID:e.id,날짜:e.date,시작교시:e.affectsTimetable?e.periodStart:'',종료교시:e.affectsTimetable?e.periodEnd:'',행사명:e.name,담당부서:e.department||'',
  '1학년구분':gradeArea(e,1),'2학년구분':gradeArea(e,2),'3학년구분':gradeArea(e,3),비고:e.memo||'',사용:true,
}));}
export function getWeekdayPeriodBounds(plan){
  const map={};for(let i=1;i<=5;i++)map[DOW[i]]={요일:DOW[i],시작교시:1,종료교시:0,사용:true};
  for(const s of plan.weekly||[]){const d=Number(s.weekday),p=Number(s.period);if(d<1||d>5||!Number.isInteger(p))continue;
    const row=map[DOW[d]];row.시작교시=Math.min(row.시작교시,p);row.종료교시=Math.max(row.종료교시,p);}
  return map;
}
export function v12Recurring(plan){return (plan.v12Recurring||[]).filter(r=>r.사용!==false).map(r=>({...r}));}
export function validateV12Recurring(row,year){
  if(![1,2,3].includes(Number(row.학년)))return '학년은 1~3학년으로 입력하세요.';
  if(![1,2].includes(Number(row.학기)))return '학기는 1학기 또는 2학기로 지정하세요.';
  if(!DOW.slice(1,6).includes(row.요일))return '반복 요일은 월~금요일만 선택할 수 있어요.';
  const first=Number(row.시작교시),last=Number(row.종료교시);
  if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last>12||first>last)return '반복 창체의 시작·종료 교시를 확인하세요.';
  if(!['자율','동아리','진로','봉사'].includes(row.영역))return '반복 창체 영역을 확인하세요.';
  for(const d of String(row.제외일목록||'').split(',').map(s=>s.trim()).filter(Boolean))if(!inYear(year,d))return `제외일 ${d}은 ${year}학년도 범위의 유효한 날짜여야 해요.`;
  return null;
}
export function v12ActualHours(plan,events=[]){
  const rows={};for(const sem of [1,2])for(const g of gradeIds(plan))rows[`${sem}-${g}`]={교과:0,창체:0,자율:0,동아리:0,진로:0,봉사:0};
  const perDay=getWeekdayPeriodBounds(plan),days=v12Days(plan),eventRows=v12Events(plan,events);
  for(const d of days){for(const g of gradeIds(plan)){
    if(!isInstructionDate(plan,d.날짜,g))continue;
    const applicable=effectiveDateRule(plan,d.날짜,g)?.weekdayOverride||weekday(d.날짜);
    const t=perDay[DOW[applicable]],hours=t?Math.max(0,Number(t.종료교시)-Number(t.시작교시)+1):0;
    rows[`${d.학기}-${g}`].교과+=hours;
  }}
  const dayMap=new Map(days.map(d=>[d.날짜,d]));
  for(const e of eventRows){const d=dayMap.get(e.날짜);if(!d)continue;
    const first=Number(e.시작교시),last=Number(e.종료교시),hours=e.시작교시===''?0:Math.max(0,last-first+1);
    for(const g of gradeIds(plan)){const kind=e[`${g}학년구분`],r=rows[`${d.학기}-${g}`];
      if(r&&['자율','동아리','진로','봉사'].includes(kind)){
        r[kind]+=hours;r.창체+=hours;r.교과=Math.max(0,r.교과-hours);
      }
    }
  }
  return rows;
}
/** All dates on which a recurring activity could run, before its per-date exclusions. */
export function v12EligibleRecurringDates(plan,row){
  if(!row||![1,2,3].includes(Number(row.학년))||![1,2].includes(Number(row.학기))||!DOW.slice(1,6).includes(row.요일))return [];
  return v12Days(plan).filter(d=>Number(d.학기)===Number(row.학기)&&(d.적용요일||d.요일)===row.요일&&
    ['instructional','swap'].includes(d.유형)&&isInstructionDate(plan,d.날짜,Number(row.학년))).map(d=>d.날짜);
}
export function v12RecurringDates(plan,row){
  const excluded=new Set(String(row?.제외일목록||'').split(',').map(d=>d.trim()).filter(Boolean));
  return v12EligibleRecurringDates(plan,row).filter(d=>!excluded.has(d));
}
export function v12RecurringHours(plan){const result={};for(const sem of [1,2])for(const g of gradeIds(plan))result[`${sem}-${g}`]={total:0,areas:{자율:0,동아리:0,진로:0,봉사:0},items:[]};
  for(const r of v12Recurring(plan)){
    const n=Math.max(0,Number(r.종료교시)-Number(r.시작교시)+1)*v12RecurringDates(plan,r).length;
    const row=result[`${r.학기}-${r.학년}`];if(!row)continue;row.total+=n;if(row.areas[r.영역]!==undefined)row.areas[r.영역]+=n;
    row.items.push(`${r.활동명||r.영역} ${r.영역} +${n}`);
  }return result;
}
export function v12Audit(plan,events=[]){const rows=[],slots=new Map(),days=new Map(v12Days(plan).map(d=>[d.날짜,d])),timeMap=getWeekdayPeriodBounds(plan);
  for(const e of v12Events(plan,events)){
    if(!ymd(e.날짜)||!inYear(plan.year,e.날짜)){rows.push({severity:'error',key:`range|${e.행사ID}`,date:e.날짜,text:`${e.날짜} ${e.행사명}: 학년도 범위 밖 날짜입니다.`});continue;}
    const day=days.get(e.날짜);if(!day)continue;
    if(!['instructional','swap'].includes(day.유형))rows.push({severity:'warn',key:`holiday|${e.행사ID}`,date:e.날짜,text:`${e.날짜} ${e.행사명}: ${V12_TYPES[day.유형]}에 등록된 행사입니다.`});
    if(e.시작교시===''||e.시작교시==null)continue;
    const p1=Number(e.시작교시),p2=Number(e.종료교시),weekdayText=day.적용요일||day.요일,t=timeMap[weekdayText];
    if(t&&t.종료교시>=t.시작교시&&(p1<t.시작교시||p2>t.종료교시))rows.push({severity:'warn',key:`hours|${e.행사ID}`,date:e.날짜,text:`${e.날짜} ${e.행사명}: ${weekdayText}요일 운영 교시(${t.시작교시}~${t.종료교시})를 벗어납니다.`});
    for(const g of gradeIds(plan)){if(e[`${g}학년구분`]==='없음')continue;for(let p=p1;p<=p2&&p<=12;p++){
      const key=`${e.날짜}|${g}|${p}`;
      if(slots.has(key))rows.push({severity:'error',key:`duplicate|${key}|${e.행사ID}`,date:e.날짜,text:`${e.날짜} ${g}학년 ${p}교시에 ${slots.get(key)}과 ${e.행사명}이 중복됩니다.`});
      else slots.set(key,e.행사명);
    }}
  }
  return rows.slice(0,100);
}
export function v12MonthCounts(plan){const days=v12Days(plan),counts={};for(const d of days){const m=d.날짜.slice(0,7);if(!counts[m])counts[m]=0;if(['instructional','swap'].includes(d.유형))counts[m]++;}return counts;}
export function v12AnnualSummary(plan){const days=v12Days(plan),result={total:0,first:0,second:0,vacations:{여름방학:0,겨울방학:0,학년말방학:0},discretionary:0};
  for(const d of days){if(['instructional','swap'].includes(d.유형)){result.total++;if(d.학기===1)result.first++;else result.second++;}if(d.유형==='discretionary')result.discretionary++;
    if(d.유형==='vacation'&&result.vacations[d.명칭]!==undefined)result.vacations[d.명칭]++;
  }return result;
}
export function v12ImpactPreview(plan,start,end,kind){
  if(!ymd(start)||!ymd(end)||!inYear(plan.year,start)||!inYear(plan.year,end)||end<start)return {error:'학년도 범위 안의 올바른 시작일과 종료일을 입력해 주세요.'};
  const dates=rangeDates(start,end),before=dates.filter(d=>isInstructionDate(plan,d)).length;
  return {dates,before,after:kind==='instruction'?dates.length:0,changed:dates.filter(d=>isInstructionDate(plan,d)!==(kind==='instruction')).length};
}

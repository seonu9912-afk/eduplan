/* Excel sheet models closely follow the original Google Apps Script v12
 * (headings, 32-column weekly matrix, detail rows, totals and fixed monthly grid).
 * No data is sent to Drive, Sheets, or external services. */
import {
  v12Days, v12Events, v12Recurring, v12EligibleRecurringDates,
  v12TermForDate, getWeekdayPeriodBounds
} from './v12-calendar-bridge.js';
import {weekday,plusDays} from './academic.js';
import {isInstructionDate} from './calendar.js';

const AREAS=['자율','동아리','진로','봉사'];
const GRADES=[1,2,3];
const DOW=['일','월','화','수','목','금','토'];
const monthDay=d=>`${Number(d.slice(5,7))}/${Number(d.slice(8,10))}`;
const period=e=>e.시작교시===''||e.시작교시==null?'':Number(e.시작교시)===Number(e.종료교시)?`${e.시작교시}교시`:`${e.시작교시}~${e.종료교시}교시`;
const empty3=()=>[0,0,0];
const sum3=(total,row)=>row.forEach((v,i)=>total[i]+=Number(v)||0);
const widths=(cols)=>cols.map(x=>Math.max(8,Math.min(48,x)));
const sortedEvents=(plan,events)=>v12Events(plan,events).sort((a,b)=>a.날짜.localeCompare(b.날짜)||Number(a.시작교시||99)-Number(b.시작교시||99)||String(a.행사명||'').localeCompare(String(b.행사명||''),'ko'));
const headerMerge=(start,end)=>({from:[3,start],to:[3,end]});

function weeklyRows(plan,events,semester,school){
  const days=v12Days(plan).filter(d=>d.학기===semester),es=sortedEvents(plan,events),times=getWeekdayPeriodBounds(plan);
  const weeks=new Map();
  for(const d of days){const monday=plusDays(d.날짜,-((weekday(d.날짜)+6)%7));if(!weeks.has(monday))weeks.set(monday,[]);weeks.get(monday).push(d);}
  const header1=['월','주','월','화','수','목','금','수업일수','','','수업시수','','','주요행사일정','교과','','','창체','','','자율','','','동아리','','','진로','','','봉사','',''];
  const header2=['','','','','','','','1','2','3','1','2','3','','1','2','3','1','2','3','1','2','3','1','2','3','1','2','3','1','2','3'];
  const rows=[[`${school} ${plan.year}학년도 ${semester}학기 주별 수업일수·시수 현황`],[],header1,header2];
  const totals=Object.fromEntries(['days','hours','subject','creative',...AREAS].map(k=>[k,empty3()]));
  for(const [monday,week] of weeks){
    const cells=['','','','',''],daysCount=empty3(),baseHours=empty3(),areas=Object.fromEntries(AREAS.map(k=>[k,empty3()])),notes=[];
    const byDate=new Map();
    for(const e of es)if(week.some(d=>d.날짜===e.날짜)){
      if(!byDate.has(e.날짜))byDate.set(e.날짜,[]);byDate.get(e.날짜).push(e);
    }
    for(const day of week){
      const d=day.날짜,eventsToday=byDate.get(d)||[],w=weekday(d),cell=w-1;
      if(cell>=0&&cell<5)cells[cell]=[Number(d.slice(8)),day.명칭,...eventsToday.map(e=>`${period(e)?period(e)+': ':''}${e.행사명}`)].filter(Boolean).join('\n');
      for(const grade of GRADES){
        if(!isInstructionDate(plan,d,grade))continue;
        daysCount[grade-1]++;
        const actualDay=day.적용요일||day.요일,t=times[actualDay];
        baseHours[grade-1]+=t?Math.max(0,Number(t.종료교시)-Number(t.시작교시)+1):0;
      }
      for(const e of eventsToday){
        notes.push(`* ${e.날짜} ${period(e)?period(e)+': ':''}${e.행사명}`);
        const n=e.시작교시===''||e.시작교시==null?0:Math.max(0,Number(e.종료교시)-Number(e.시작교시)+1);
        for(const grade of GRADES){const area=e[`${grade}학년구분`];if(areas[area])areas[area][grade-1]+=n;}
      }
    }
    const creative=GRADES.map(g=>AREAS.reduce((n,a)=>n+areas[a][g-1],0));
    const subject=GRADES.map(g=>Math.max(0,baseHours[g-1]-creative[g-1]));
    for(const [k,value] of [['days',daysCount],['hours',baseHours],['subject',subject],['creative',creative],...AREAS.map(a=>[a,areas[a]])])sum3(totals[k],value);
    const weekIndex=rows.length-3;
    rows.push([Number(week[0].날짜.slice(5,7)),weekIndex,...cells,...daysCount,...baseHours,notes.join('\n'),...subject,...creative,...AREAS.flatMap(a=>areas[a])]);
  }
  if(rows.length>4)rows.push(['합계','',...Array(5).fill(''),...totals.days,...totals.hours,'',...totals.subject,...totals.creative,...AREAS.flatMap(a=>totals[a])]);
  return {name:`${semester}학기`,rows,headerStartRow:3,headerRows:4,freezeRows:4,freezeCols:2,
    merges:[{from:[1,1],to:[1,32]},...[ [8,10],[11,13],[15,17],[18,20],[21,23],[24,26],[27,29],[30,32] ].map(([a,b])=>headerMerge(a,b))],
    widths:widths([9,9,16,16,16,16,16,...Array(6).fill(9),48,...Array(18).fill(9)])};
}

function creativeRows(plan,events,semester,grade,school){
  const items=[];
  for(const e of sortedEvents(plan,events)){
    if(v12TermForDate(plan,e.날짜)!==semester)continue;
    const a=e[`${grade}학년구분`];if(!AREAS.includes(a))continue;
    items.push({date:e.날짜,name:e.행사명,dept:e.담당부서||'',area:a,start:Number(e.시작교시)||0,
      period:period(e),hours:e.시작교시===''||e.시작교시==null?0:Math.max(0,Number(e.종료교시)-Number(e.시작교시)+1)});
  }
  for(const r of v12Recurring(plan).filter(r=>r.창체표포함!==false&&Number(r.학기)===semester&&Number(r.학년)===grade)){
    const exclusions=new Set(String(r.제외일목록||'').split(',').map(s=>s.trim()).filter(Boolean));
    for(const date of v12EligibleRecurringDates(plan,r)){
      if(exclusions.has(date))continue;
      const start=Number(r.시작교시),end=Number(r.종료교시),p=start===end?`${start}교시`:`${start}~${end}교시`;
      items.push({date,name:r.활동명||'',dept:r.담당부서||'',area:r.영역,start,period:p,hours:Math.max(0,end-start+1)});
    }
  }
  items.sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start||a.name.localeCompare(b.name,'ko'));
  const rows=[[`${school} ${plan.year}학년도 ${semester}학기 ${grade}학년 창의적 체험활동 운영계획표`],[],['일자','요일','교시','내용','부서','구분',...AREAS]];
  const totals=Object.fromEntries(AREAS.map(a=>[a,0]));let prevDate='',prevEvent='';
  for(const item of items){
    totals[item.area]=(totals[item.area]||0)+item.hours;
    const ev=`${item.date}|${item.name}`;
    rows.push([item.date===prevDate?'':monthDay(item.date),item.date===prevDate?'':DOW[weekday(item.date)],item.period,ev===prevEvent?'':item.name,item.dept,item.area,...AREAS.map(a=>a===item.area?item.hours:'')]);
    prevDate=item.date;prevEvent=ev;
  }
  rows.push([`${semester}학기 계`,'','','','','',...AREAS.map(a=>totals[a])]);
  return {name:`${semester}학기_${grade}학년`,rows,headerStartRow:3,headerRows:3,freezeRows:3,
    merges:[{from:[1,1],to:[1,10]},{from:[rows.length,1],to:[rows.length,6]}],
    widths:widths([12,9,15,43,17,12,11,11,11,11])};
}

function calendarRows(plan,events,year,month,school){
  const targetYear=month<=2?year+1:year,datePrefix=`${targetYear}-${String(month).padStart(2,'0')}-`;
  const dayMap=new Map(v12Days(plan).filter(d=>d.날짜.startsWith(datePrefix)).map(d=>[d.날짜,d]));
  const eventMap=new Map();for(const e of sortedEvents(plan,events)){if(!eventMap.has(e.날짜))eventMap.set(e.날짜,[]);eventMap.get(e.날짜).push(e);}
  const first=weekday(`${datePrefix}01`),count=new Date(Date.UTC(targetYear,month,0)).getUTCDate();
  const rows=[[`${school} · ${targetYear}년 ${month}월`],[],['일','월','화','수','목','금','토']];
  for(let r=0;r<6;r++){
    const cols=[];for(let c=0;c<7;c++){
      const n=r*7+c-first+1;if(n<1||n>count){cols.push('');continue;}
      const date=`${datePrefix}${String(n).padStart(2,'0')}`,info=dayMap.get(date)||{};
      cols.push([n,info.명칭,...(eventMap.get(date)||[]).map(e=>`${period(e)?period(e)+' ':''}${e.행사명}`)].filter(x=>x!==''&&x!=null).join('\n'));
    }
    rows.push(cols);
  }
  return {name:`${month}월`,rows,headerStartRow:3,headerRows:3,freezeRows:3,merges:[{from:[1,1],to:[1,7]}],
    widths:Array(7).fill(25),calendar:true};
}

export function buildV12ExportSheets(plan,events,school='학교',type='events'){
  if(type==='events'){
    const rows=[[`${school} · ${plan.year}학년도 행사 편성 목록`],[],['날짜','시작교시','종료교시','행사명','담당부서','1학년구분','2학년구분','3학년구분','비고']];
    for(const e of sortedEvents(plan,events))rows.push([e.날짜,e.시작교시,e.종료교시,e.행사명,e.담당부서,e['1학년구분'],e['2학년구분'],e['3학년구분'],e.비고]);
    return [{name:'행사목록',rows,headerStartRow:3,headerRows:3,freezeRows:3,merges:[{from:[1,1],to:[1,9]}],widths:widths([19,12,12,44,19,15,15,15,48])}];
  }
  if(type==='weeklyHours')return [1,2].map(sem=>weeklyRows(plan,events,sem,school));
  if(type==='creative')return [1,2].flatMap(sem=>GRADES.map(grade=>creativeRows(plan,events,sem,grade,school)));
  if(type==='calendar')return [3,4,5,6,7,8,9,10,11,12,1,2].map(month=>calendarRows(plan,events,plan.year,month,school));
  throw new Error('알 수 없는 출력 유형입니다.');
}

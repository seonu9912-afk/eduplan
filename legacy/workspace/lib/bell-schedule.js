/**
 * Pure day/bell-time calculations. Never mutates the timetable's saved bell rows.
 * A lesson's period number is authoritative; gaps before lunch are represented by
 * the duration between rows, not by extra "break" objects.
 */
// Minute-only times and native browser values containing :00 seconds are supported.
const CLOCK_RE=/^([01]?\d|2[0-3]):([0-5]\d)(?::00)?$/;
export function clockMinutes(value){
  const match=String(value??'').trim().match(CLOCK_RE);
  return match?Number(match[1])*60+Number(match[2]):null;
}
export function minutesClock(minutes){
  if(!Number.isInteger(minutes)||minutes<0||minutes>=1440)return null;
  return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
}
/** Browser-independent picker: hour and minute edits always produce a valid time. */
export function clockParts(value){
  const total=clockMinutes(value)??540;
  return {
    hour:String(Math.floor(total/60)).padStart(2,'0'),
    minute:String(total%60).padStart(2,'0'),
  };
}
export function changeClockPart(value,part,next){
  const {hour,minute}=clockParts(value);
  if(!/^\d{1,2}$/.test(String(next)))return hour+':'+minute;
  const number=Number(next);
  if(part==='hour' && number>=0 && number<=23)return String(number).padStart(2,'0')+':'+minute;
  if(part==='minute' && number>=0 && number<=59)return hour+':'+String(number).padStart(2,'0');
  return hour+':'+minute;
}
export function timeDifferenceLabel(delta){
  if(!Number.isFinite(delta))return '계산 불가';
  if(delta===0)return '변화 없음';
  return Math.abs(delta)+'분 '+(delta<0?'앞당겨짐':'늦어짐');
}
const minutesOf=(row)=>Math.max(0,(clockMinutes(row.end)??0)-(clockMinutes(row.start)??0));
export function inferBellSettings(rows=[]){
  const lessons=rows.filter(row=>row.type==='lesson');
  const first=lessons[0];
  const lunch=rows.find(row=>row.type==='lunch');
  const lesson=first?minutesOf(first):45;
  const gaps=[];
  for(let i=1;i<rows.length;i++){
    if(rows[i-1].type==='lesson'&&rows[i].type==='lesson'){
      const gap=(clockMinutes(rows[i].start)??0)-(clockMinutes(rows[i-1].end)??0);
      if(gap>=0&&gap<=120)gaps.push(gap);
    }
  }
  return {
    firstLessonStart:minutesClock(clockMinutes(first?.start))??'09:00',
    lessonMinutes:lesson||45,
    breakMinutes:gaps[0]??10,
    lunchMinutes:lunch?minutesOf(lunch):60,
  };
}
export function validateBellSettings(settings){
  const errors=[];
  if(clockMinutes(settings.firstLessonStart)===null)errors.push('첫 수업 시작 시각을 HH:MM으로 입력해 주세요.');
  for(const [name,label,min,max] of [
    ['lessonMinutes','수업 시간',1,120],
    ['breakMinutes','쉬는 시간',0,60],
    ['lunchMinutes','점심시간',0,180],
  ]){
    const value=Number(settings[name]);
    if(!Number.isInteger(value)||value<min||value>max)errors.push(label+'은(는) '+min+'~'+max+'분 사이의 정수여야 합니다.');
  }
  return errors;
}
export function generateBellSchedule(baseRows=[],settings){
  const errors=validateBellSettings(settings);
  if(!baseRows.some(row=>row.type==='lesson'))errors.push('일과표에 수업 교시가 없습니다.');
  const startIndex=baseRows.findIndex(row=>row.type==='lesson');
  const baseRowsCopy=baseRows.map(row=>({...row}));
  if(errors.length)return {ok:false,rows:baseRowsCopy,errors};
  let cursor=clockMinutes(settings.firstLessonStart);
  let previous=null;
  let previousLessonPeriod=null;
  const output=baseRowsCopy.map((row,index)=>{
    if(index<startIndex)return row; // Preserve arrival / homeroom blocks.
    const originalDuration=minutesOf(row);
    const type=row.type;
    if(type==='lesson'){
      if(previous?.type==='lesson')cursor+=Number(settings.breakMinutes);
      // Lunch or another explicit block already separates these lessons.
      const period=Number(row.period);
      if(previousLessonPeriod!==null&&period<=previousLessonPeriod)errors.push('수업 교시의 순서가 올바르지 않습니다.');
      previousLessonPeriod=period;
    }
    const duration=type==='lesson'?Number(settings.lessonMinutes):
      type==='lunch'?Number(settings.lunchMinutes):originalDuration;
    const begin=minutesClock(cursor),end=minutesClock(cursor+duration);
    if(!begin||!end){
      errors.push('계산한 일과가 자정을 넘어갑니다. 시작 시각이나 수업 시간을 조정해 주세요.');
      return row;
    }
    cursor+=duration;
    previous=row;
    return {...row,start:begin,end};
  });
  const previousRow=startIndex>0?baseRows[startIndex-1]:null;
  if(previousRow&&clockMinutes(previousRow.end)!==null &&
      clockMinutes(previousRow.end)>clockMinutes(settings.firstLessonStart)){
    errors.push('첫 수업 시각이 앞선 조회·일과의 종료 시각보다 빠릅니다.');
  }
  return {ok:!errors.length,rows:errors.length?baseRowsCopy:output,errors};
}
export function selectOperatingBellRows(rows=[],firstPeriod,lastPeriod){
  const from=rows.findIndex(row=>row.type==='lesson'&&Number(row.period)===Number(firstPeriod));
  const to=rows.findLastIndex(row=>row.type==='lesson'&&Number(row.period)===Number(lastPeriod));
  if(from<0||to<from)return {ok:false,rows:[],error:'이 요일의 시작·종료 교시에 해당하는 일과표가 없습니다.'};
  const section=rows.slice(from,to+1).filter(row=>
    row.type!=='lesson'||(Number(row.period)>=Number(firstPeriod)&&Number(row.period)<=Number(lastPeriod)));
  return {ok:true,rows:section,error:null};
}
export function compareBellDay(rows=[],firstPeriod,lastPeriod,settings){
  const selection=selectOperatingBellRows(rows,firstPeriod,lastPeriod);
  if(!selection.ok)return {ok:false,errors:[selection.error],rows:[],oldEnd:null,newEnd:null,delta:null};
  const first=selection.rows.find(row=>row.type==='lesson');
  const originalEnd=selection.rows.at(-1)?.end;
  const calculated=generateBellSchedule(selection.rows,{...settings,firstLessonStart:settings.firstLessonStart||first.start});
  const oldEnd=clockMinutes(originalEnd);
  const newEnd=clockMinutes(calculated.rows.at(-1)?.end);
  const errors=[...calculated.errors];
  if(oldEnd===null||newEnd===null)errors.push('기존 일과의 종료 시각을 확인해 주세요.');
  return {ok:!errors.length,errors,rows:calculated.rows,oldEnd:originalEnd,
    newEnd:calculated.rows.at(-1)?.end??null,
    delta:errors.length?null:newEnd-oldEnd};
}

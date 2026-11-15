import {academicStart,academicEnd,rangeDates,weekday,plusDays} from './academic.js';
import {DAYS,effectiveDateRule,isInstructionDate,dateEvents,inYear,csvEscape} from './calendar.js';
export const LEDGER_COLUMNS=['날짜','요일','학사구분','학사일정','주요행사·교육활동','비고'];
export const ledgerDates=year=>rangeDates(academicStart(year),academicEnd(year));
export const ledgerKind=(plan,date)=>{
  const rule=effectiveDateRule(plan,date);
  if(rule?.kind==='vacation')return '방학';
  if(rule?.kind==='holiday')return '공휴일';
  if(rule?.kind==='closed')return rule.label?.includes('재량')?'재량휴업일':'휴업일';
  if(rule?.kind==='instruction')return '수업일';
  const wd=weekday(date);return wd===0||wd===6?'주말':'수업일';
};
export const ledgerRecord=(plan,events,date)=>{
  const rule=effectiveDateRule(plan,date);
  const note=(plan.dayNotes||{})[date]||{};
  const ev=dateEvents(events,date);
  const eventTitles=ev.map(e=>e.name).filter(Boolean);
  const eventDescription=ev.map(e=>{
    const period=e.affectsTimetable?`${e.periodStart}${e.periodStart===e.periodEnd?'':`~${e.periodEnd}`}교시: `:'';
    return `${period}${e.name}`;
  });
  const scheduleParts=[note.schedule||rule?.label||'',...eventTitles.filter(name=>!(note.schedule||'').includes(name))].filter(Boolean);
  const activityParts=[note.activities||'',...eventDescription.filter(line=>!(note.activities||'').includes(line))].filter(Boolean);
  return {date,month:date.slice(0,7),weekday:DAYS[weekday(date)],kind:ledgerKind(plan,date),
    schedule:scheduleParts.join(', '),activities:activityParts.join(' / '),memo:note.memo||'',
    isInstruction:isInstructionDate(plan,date),events:ev};
};
export const ledgerMove=(dates,date,col,key)=>{
  const position=dates.indexOf(date);if(position<0)return {date:dates[0],col};
  let nextDate=position,nextCol=col;
  if(key==='ArrowUp')nextDate=Math.max(0,position-1);
  else if(key==='ArrowDown')nextDate=Math.min(dates.length-1,position+1);
  else if(key==='ArrowLeft')nextCol=Math.max(0,col-1);
  else if(key==='ArrowRight')nextCol=Math.min(LEDGER_COLUMNS.length-1,col+1);
  else if(key==='Home')nextCol=0;
  else if(key==='End')nextCol=LEDGER_COLUMNS.length-1;
  else if(key==='PageUp')nextDate=Math.max(0,position-30);
  else if(key==='PageDown')nextDate=Math.min(dates.length-1,position+30);
  return {date:dates[nextDate],col:nextCol};
};
// TSV copied from the B:H columns of the school's original annual Excel ledger.
export const parseLedgerDate=(input,year)=>{
  const raw=String(input??'').trim();if(!raw)return null;
  if(/^\d{5}$/.test(raw)){const value=Number(raw);if(value>35000&&value<80000)return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);}
  const cleaned=raw.replace(/\s/g,'').replace(/년|월|[./]/g,'-').replace(/일/g,'').replace(/-+$/,'');
  let match=cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(match){const date=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;return inYear(year,date)?date:null;}
  match=cleaned.match(/^(\d{1,2})-(\d{1,2})$/);
  if(match){const m=Number(match[1]);const y=m>=3?year:year+1;const date=`${y}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`;return inYear(year,date)?date:null;}
  return null;
};
// Spreadsheet clipboard TSV can quote cells containing Alt+Enter line breaks.
export const splitSpreadsheetPaste=raw=>{
  const lines=[],cells=[];let value='',quoted=false;
  const data=String(raw||'').replaceAll('\r\n','\n').replaceAll('\r','\n');
  for(let i=0;i<data.length;i++){
    const ch=data[i];
    if(ch==='"'){
      if(quoted&&data[i+1]==='"'){value+='"';i++;}
      else quoted=!quoted;
    }else if(!quoted&&ch==='\t'){
      cells.push(value);value='';
    }else if(!quoted&&ch==='\n'){
      cells.push(value);if(cells.some(x=>x.trim()))lines.push(cells.slice());cells.length=0;value='';
    }else value+=ch;
  }
  cells.push(value);if(cells.some(x=>x.trim()))lines.push(cells.slice());
  return lines;
};
export const parseLedgerPaste=(text,year)=>{
  const errors=[],rows=[],seen=new Set();
  const lines=splitSpreadsheetPaste(text);
  if(lines.length>380)return {rows:[],errors:['한 번에 최대 380행까지 붙여넣을 수 있어요.']};
  for(const [idx,line] of lines.entries()){
    const cells=line.map(x=>x.trim());
    const first=cells[0]||'';
    if(first.includes('월') && (cells[1]||'').includes('날짜'))continue;
    // Support both B:H (month + date + weekday + status + schedule + activity + memo)
    // and C:H (date + weekday + status + schedule + activity + memo).
    const offset=cells.length>=7?1:0;
    const date=parseLedgerDate(cells[offset],year);
    if(!date){errors.push(`${idx+1}행: 날짜가 올바르지 않거나 해당 학년도 밖입니다.`);continue;}
    if(seen.has(date)){errors.push(`${idx+1}행: ${date} 날짜가 중복되어 있습니다.`);continue;}
    seen.add(date);
    const status=cells[offset+2]||'';
    const schedule=cells[offset+3]||'';
    const activities=cells[offset+4]||'';
    const memo=cells[offset+5]||'';
    let kind=null;
    if(/수업일/.test(status))kind='instruction';
    else if(/방학/.test(status))kind='vacation';
    else if(/공휴일|대체공휴일/.test(status))kind='holiday';
    else if(/재량휴업|휴업일|휴교/.test(status))kind='closed';
    else if(status&&status!=='주말')errors.push(`${idx+1}행: '${status}' 학사구분을 확인해 주세요.`);
    rows.push({date,kind,schedule,activities,memo,rawStatus:status});
  }
  return {rows,errors};
};
export const applyLedgerPaste=(plan,rows)=>{
  const dayNotes={...(plan.dayNotes||{})};
  const rules=new Map((plan.dayRules||[]).map(x=>[x.date,x]));
  for(const row of rows){
    if(row.kind){
      const current=rules.get(row.date);
      const label=(row.kind==='vacation'||row.kind==='holiday'||row.kind==='closed')?row.schedule.slice(0,60):'';
      rules.set(row.date,{...current,date:row.date,kind:row.kind,label,weekdayOverride:row.kind==='instruction'?current?.weekdayOverride||0:0,source:'import'});
    }
    const note={schedule:row.schedule,activities:row.activities,memo:row.memo};
    if(Object.values(note).some(Boolean))dayNotes[row.date]=note;
  }
  return {...plan,dayNotes,dayRules:[...rules.values()].sort((a,b)=>a.date.localeCompare(b.date)),status:'draft',confirmedAt:null};
};

export const ledgerCsv=(plan,events=[])=>{
  const header=['월','날짜','요일','학사구분','학사일정','주요행사일정','비고'];
  let lastMonth='';
  const rows=ledgerDates(plan.year).map(date=>{
    const r=ledgerRecord(plan,events,date);
    const monthLabel=r.month===lastMonth?'':`${Number(date.slice(5,7))}월`;
    lastMonth=r.month;
    return [monthLabel,r.date,r.weekday,r.kind,r.schedule,r.activities,r.memo];
  });
  return '\ufeff'+[header,...rows].map(row=>row.map(csvEscape).join(',')).join('\r\n');
};

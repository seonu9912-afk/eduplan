import {academicStart,academicEnd,rangeDates,weekday,dayRule,getTerm2Start} from './academic.js';

export const DAYS=['일','월','화','수','목','금','토'];
export const RULE_KINDS={instruction:'수업일',holiday:'공휴일',vacation:'방학',closed:'재량휴업·휴업일'};
// Reject impossible dates such as April 31; lexical ISO sorting alone is insufficient.
export const ymd = value => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day,12));
  return date.getUTCFullYear()===year&&date.getUTCMonth()+1===month&&date.getUTCDate()===day;
};
export const inYear = (year,date) => ymd(date)&&date>=academicStart(year)&&date<=academicEnd(year);
export const isWorkday = date => weekday(date)>0&&weekday(date)<6;
export const gradeIds = plan => [...new Set((plan?.classes||[]).map(c=>Number(c.grade)).filter(x=>x>0))].sort((a,b)=>a-b).length ? [...new Set((plan.classes||[]).map(c=>Number(c.grade)).filter(x=>x>0))].sort((a,b)=>a-b) : [1,2,3];
export const effectiveDateRule = (plan,date,grade=null) => {
  if(grade!==null){const gradeRule=(plan.gradeRules||[]).find(r=>r.date===date&&Number(r.grade)===Number(grade));if(gradeRule)return gradeRule;}
  return dayRule(date,plan.dayRules||[])||null;
};
export const isInstructionDate = (plan,date,grade=null) => {
  const rule=effectiveDateRule(plan,date,grade);
  return rule?rule.kind==='instruction':isWorkday(date);
};
export const tallyCalendar = (plan,events=[]) => {
  const grades=gradeIds(plan),dates=rangeDates(academicStart(plan.year),academicEnd(plan.year));
  const term2=getTerm2Start(plan);
  const totalByGrade=Object.fromEntries(grades.map(g=>[g,{total:0,first:0,second:0,weekdays:[0,0,0,0,0,0,0]}]));
  const monthCounts={};let commonTotal=0,first=0,second=0;
  for (const date of dates){
    const month=date.slice(0,7);
    if(!monthCounts[month])monthCounts[month]={total:0,first:0,second:0};
    if(isInstructionDate(plan,date)){
      commonTotal++;monthCounts[month].total++;
      if(term2){if(date<term2){first++;monthCounts[month].first++;}else{second++;monthCounts[month].second++;}}
    }
    for(const g of grades)if(isInstructionDate(plan,date,g)){
      const rec=totalByGrade[g];rec.total++;const gradeTerm=getTerm2Start(plan,g)||term2;if(gradeTerm)rec[date<gradeTerm?'first':'second']++;rec.weekdays[weekday(date)]++;
    }
  }
  const issues=[];
  if(!term2)issues.push({level:'info',title:'여름방학을 편성하면 방학 후 첫 수업일이 2학기 개학일로 자동 계산됩니다.',date:`${plan.year}-07-01`});
  const target=Number(plan.targetDays)||190;
  grades.forEach(g=>{const r=totalByGrade[g];if(r.total<target)issues.push({level:'error',title:`${g}학년 수업일수가 목표보다 ${target-r.total}일 부족해요.`,date:academicStart(plan.year)});});
  if(!plan.holidaysLastChecked)issues.push({level:'info',title:'공식 공휴일을 아직 조회하지 않았어요. 먼저 공휴일을 불러와 주세요.',date:academicStart(plan.year)});
  const dateList=new Set(dates);
  for(const rule of plan.dayRules||[]){
    if(!dateList.has(rule.date))continue;
    if(rule.kind==='instruction' && rule.source!=='kasi' && (plan.holidayDates||[]).includes(rule.date))issues.push({level:'warn',title:`${rule.date}은 공식 공휴일인데 수업일로 지정돼 있어요.`,date:rule.date});
    if(rule.weekdayOverride && rule.kind!=='instruction')issues.push({level:'warn',title:`${rule.date}의 휴업일에는 요일교체가 적용되지 않아요.`,date:rule.date});
  }
  for(const event of events){
    if(!inYear(plan.year,event.date))continue;
    for(const eventDate of rangeDates(event.date,event.endDate&&event.endDate>=event.date?event.endDate:event.date)){
      if(!inYear(plan.year,eventDate))continue;
      if(!isInstructionDate(plan,eventDate))issues.push({level:'warn',title:`${eventDate} '${event.name}' 행사가 학교 공통 휴업일에 등록돼 있어요.`,date:eventDate});
    }
  }
  const occupied=new Map();
  for(const event of events){
    if(!event.affectsTimetable||!inYear(plan.year,event.date))continue;
    const applies=(event.grades||[]).length?event.grades.map(Number):grades;
    for(const d of rangeDates(event.date,event.endDate&&event.endDate>=event.date?event.endDate:event.date)){
      if(!inYear(plan.year,d))continue;
      for(const g of applies)for(let period=Number(event.periodStart);period<=Number(event.periodEnd)&&period<=12;period++){
        const key=`${d}|${g}|${period}`;
        if(occupied.has(key))issues.push({level:'warn',title:`${d} ${g}학년 ${period}교시 행사 중복: ${occupied.get(key)} / ${event.name}`,date:d});
        else occupied.set(key,event.name);
      }
    }
  }
  return {total:commonTotal,first:term2?first:null,second:term2?second:null,term2Start:term2,byGrade:totalByGrade,grades,issues,monthCounts,dates};
};
export const monthGrid = (year,month) => {
  const first=new Date(Date.UTC(year,month-1,1,12)).getUTCDay();
  const days=new Date(Date.UTC(year,month,0,12)).getUTCDate();
  return {first,days,cells:Array.from({length:Math.ceil((first+days)/7)*7},(_,i)=>{const d=i-first+1;return d>=1&&d<=days?`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;})};
};
export const applyPublicHolidays = (plan,holidays) => {
  const dates=new Map((plan.dayRules||[]).filter(r=>r.source!=='kasi').map(r=>[r.date,r]));
  const confirmed=holidays.filter(h=>inYear(plan.year,h.date)&&h.holiday!==false);
  for(const h of confirmed){
    if(dates.has(h.date))continue;
    dates.set(h.date,{date:h.date,kind:'holiday',label:h.name,source:'kasi'});
  }
  return {...plan,dayRules:[...dates.values()].sort((a,b)=>a.date.localeCompare(b.date)),holidayDates:confirmed.map(h=>h.date),holidaysLastChecked:new Date().toISOString(),status:'draft',confirmedAt:null};
};
export const dateEvents=(events,date)=>(events||[]).filter(e=>e.date<=date && date<=(e.endDate||e.date));
export const csvEscape=value=>{const raw=String(value??'');const safe=/^[\s]*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('\"','\"\"')}"`;};
export const reportCsv=(plan,events)=>{
  const rows=[['날짜','요일','학기','학교 수업일 여부','운영 구분','표시명','요일교체','학년별 수업일','행사 및 교시·시수 영역']];
  const grades=gradeIds(plan),term2=getTerm2Start(plan);
  for(const d of rangeDates(academicStart(plan.year),academicEnd(plan.year))){
    const rule=effectiveDateRule(plan,d);
    const eventDescription=dateEvents(events,d).map(e=>[e.name,e.periodStart&&e.periodEnd?`${e.periodStart}~${e.periodEnd}교시`:'',e.curriculumArea||'',e.volunteer?'봉사 포함':''].filter(Boolean).join(' · ')).join(' / ');
    rows.push([d,DAYS[weekday(d)],!term2?'미설정':d<term2?'1학기':'2학기',isInstructionDate(plan,d)?'수업일':'휴업일',rule?.kind||'기본',rule?.label||'',rule?.weekdayOverride?DAYS[rule.weekdayOverride]+'요일 시간표':'',grades.map(g=>`${g}학년:${isInstructionDate(plan,d,g)?'수업':'휴업'}`).join(' / '),eventDescription]);
  }
  return '\ufeff'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');
};
export const EVENT_AREAS=[
  {value:'none',label:'시수 배정 없음'},
  {value:'creative_self',label:'창체 · 자율·자치'},
  {value:'creative_club',label:'창체 · 동아리'},
  {value:'creative_career',label:'창체 · 진로'},
  {value:'sports',label:'학교스포츠클럽'},
  {value:'autonomous',label:'학교자율시간'},
  {value:'subject',label:'교과(과목 지정)'}
];
export const blankEventRow=(year)=>({date:`${year}-03-02`,endDate:'',name:'',periodStart:1,periodEnd:6,category:'학교행사',curriculumArea:'none',volunteer:false,grades:[],department:'교무부',memo:'',subjectId:''});
export const validateEventRow=(year,row,subjects=[])=>{
  if(!(row.name||'').trim())return '행사명을 입력해 주세요.';
  if(!inYear(year,row.date)||row.endDate&&(!inYear(year,row.endDate)||row.endDate<row.date))return '학년도 범위 안의 날짜를 입력해 주세요.';
  if(row.curriculumArea&&row.curriculumArea!=='none'){
    const first=Number(row.periodStart),last=Number(row.periodEnd);
    if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last>12||first>last)return '1~12교시 범위에서 운영 교시를 지정하세요.';
    if(row.curriculumArea==='subject'&&!subjects.some(s=>s.id===row.subjectId&&s.kind==='subject'))return '교과 행사에는 해당 과목을 선택해야 합니다.';
  }
  if((row.grades||[]).some(g=>![1,2,3].includes(Number(g))))return '대상 학년을 확인하세요.';
  return null;
};
export const normalizeEventRow=(row,id)=>({
  ...row,id,name:(row.name||'').trim(),date:row.date,endDate:row.endDate||'',category:row.category||'학교행사',
  department:(row.department||'').trim(),memo:(row.memo||'').trim(),grades:(row.grades||[]).map(Number),
  curriculumArea:row.curriculumArea||'none',volunteer:!!row.volunteer,
  periodStart:Number(row.periodStart)||1,periodEnd:Number(row.periodEnd)||1,
  affectsTimetable:!!row.curriculumArea&&row.curriculumArea!=='none',
});

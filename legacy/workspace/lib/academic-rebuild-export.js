import {academicStart,academicEnd,rangeDates,weekday} from './academic.js';
import {DAYS,gradeIds} from './calendar.js';
import {activeOn,dateEnd,dateGrid,evaluate,eventPeriods,kinds,labels,need,ruleFor,status} from './academic-rebuild.js';
import {createAcademicXlsx} from './v12-xlsx.js';

const palette={holiday:4,vacation:5,closed:6,weekend:7};
const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'});
const title=(model,s,asOf)=>model.year+'학년도 · '+s+' · 자료 기준 '+asOf;
const terms=[[1,'1학기'],[2,'2학기'],['annual','연간']];

export function exportSheets(current,{paper='A3',grade=0,term=0,useFinal=false,now=new Date()}={}) {
  const snapshot=useFinal&&current.snapshot;
  const model=snapshot?snapshot.data:current;
  const report=evaluate(model);
  const heading=title(model,snapshot?'확정':status(current),dateFormat.format(snapshot?new Date(snapshot.at):now))+' · '+(report.boundary?'2학기 시작 '+report.boundary:'2학기 시작 미확정')+' · 확인 필요 '+report.warnings.length+'건';
  const {months,rows}=dateGrid(model.year);
  const grid=[ [heading], ['일',...months.map(({m})=>m+'월')]];
  const cellStyles={};
  rows.forEach((days,i)=>{
    cellStyles[i+2]={};
    grid.push([i+1,...days.map((d,j)=>{
      if(!d)return '';
      const r=ruleFor(model,d);
      cellStyles[i+2][j+1]=palette[r.kind]??(r.weekdayOverride?8:0);
      return [DAYS[weekday(d)],r.weekdayOverride?'→ '+DAYS[r.weekdayOverride]:r.kind==='instruction'||r.kind==='weekend'?'':kinds[r.kind]||r.kind].filter(Boolean).join(' ');
    })]);
  });
  const events=[[heading],['행사 시작','행사 종료','행사명','대상 학년','학기','날짜별·교시별 편성','비고']];
  const validDays=rangeDates(academicStart(model.year),academicEnd(model.year));
  for(const e of [...model.events].sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name))){
    const grades=e.grades?.length?e.grades.map(Number):gradeIds(model.plan);
    const months=validDays.filter(d=>activeOn(e,d));
    const semester=d=>report.boundary?d<report.boundary?1:2:0;
    const included=months.filter(d=>!term||semester(d)===term);
    if(!included.length||grade&&!grades.includes(grade))continue;
    const data=[];
    for(const d of included)for(const g of grades.filter(g=>!grade||g===grade)){
      const cls=model.plan.classes.filter(c=>Number(c.grade)===g);
      const scopes=e.rebuild?.classIds?.length?cls.filter(c=>e.rebuild.classIds.includes(c.id)):[{id:null,label:'학년 공통'},...cls.filter(c=>e.rebuild?.classes?.[c.id]?.[d])];
      for(const c of scopes){
        const periods=Object.entries(eventPeriods(model,e,d,g,c.id)||{}).sort(([a],[b])=>Number(a)-Number(b));
        if(periods.length)data.push(d+' '+g+'학년 '+(c.label||c.name)+' · '+periods.map(([p,a])=>p+'교시 '+(labels[a]||a)).join(' / '));
      }
    }
    const semesterLabel=[...new Set(months.map(semester))].map(n=>n?n+'학기':'미확정').join(' · ');
    // One event per row, with the detailed text split across columns at Excel's cell limit.
    const chunks=[];
    for(const line of data){
      if(!chunks.length||chunks.at(-1).length+line.length>=30000)chunks.push(line);
      else chunks[chunks.length-1]+='\n'+line;
    }
    events.push([e.date,dateEnd(e),e.name,grades.map(g=>g+'학년').join(' · '),semesterLabel,chunks[0]||'',e.memo||'',...chunks.slice(1)]);
  }
  const eventCols=Math.max(...events.map(row=>row.length));
  for(let i=7;i<eventCols;i++)events[1][i]='교시별 편성 계속 '+(i-6);
  const hours=[[heading],['학년','학급','구분','운영 교시','자율·자치','동아리','진로','봉사','창체','교과 확보','교과 필요','시수 차이','편성 점검']];
  for(const g of report.grades)for(const c of g.classes)for(const [k,label] of terms){
    const r=c.sums[k],target=g.targets[k],gap=need(r,target);
    hours.push(r?[g.grade,c.label||c.name,label,r.capacity,...Object.values(r.byArea),r.creative,r.subject,target?.subject??'미설정',gap??'',r.conflicts?'편성 검토 필요':gap==null?'계산 설정 필요':gap<0?'교과 총시수 부족':'교과 총시수 확보']:[g.grade,c.label||c.name,label,'미확정']);
  }
  for(const w of report.warnings)hours.push([w.grade??'',w.classLabel??'','점검',w.date||'','','','','','','','','',[w.type,w.text].filter(Boolean).join(' · ')]);
  return [
    {name:'연간 학사력',rows:grid,cellStyles,print:paper,widths:[8,...months.map(()=>12)]},
    {name:'행사 목록',rows:events,filter:true,widths:[14,14,28,20,15,48,25,...Array.from({length:Math.max(0,eventCols-7)},()=>48)]},
    {name:'시수 확보 현황',rows:hours,widths:[8,18,12,14,11,11,11,11,12,12,12,12,28]}
  ];
}
export function downloadCalendar(model,options) {
  const url=URL.createObjectURL(createAcademicXlsx(exportSheets(model,options)));
  const link=document.createElement('a');
  link.href=url;link.download='EduPlan_'+model.year+'_학사일정.xlsx';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}

import {academicStart, academicEnd, rangeDates, weekday, plusDays} from './academic.js';
import {gradeIds, inYear, isInstructionDate, effectiveDateRule, DAYS, RULE_KINDS} from './calendar.js';
import {normalizeCurriculum, operationalPlan} from './curriculum.js';
import {gradeArea, v12Recurring} from './v12-calendar-bridge.js';

export const kinds = {...RULE_KINDS, weekend:'주말'};
export const labels = {subject:'교과', creative_self:'자율·자치', creative_club:'동아리', creative_career:'진로', creative_volunteer:'봉사'};
const creative = Object.keys(labels).slice(1);
const legacy = {교과:'subject', 자율:'creative_self', 동아리:'creative_club', 진로:'creative_career', 봉사:'creative_volunteer'};
const number = v => v !== '' && v != null && Number.isInteger(Number(v)) && Number(v)>=0 && Number(v)<=12 ? Number(v) : null;
const area = kind => kind==='sports'?'creative_club':kind;
const clone = x => x == null ? x : structuredClone(x);
export const dateEnd = event => event.endDate || event.date;
export const activeOn = (event,date) => event.date<=date && date<=dateEnd(event);
export const tabs = ['연간 학사력','행사 편성','시수 확인','편성 점검','Excel 출력'];

export function dateGrid(year) {
  const months = Array.from({length:12},(_,i)=>({y:year+Number(i>=10),m:(i+2)%12+1}));
  const rows = Array.from({length:31},(_,d)=>months.map(({y,m})=>d<new Date(Date.UTC(y,m,0)).getUTCDate()?iso(y,m,d+1):null));
  return {months,rows};
}

const iso = (y,m,d) => [y,m,d].map(x=>String(x).padStart(2,'0')).join('-');

export function project(space,year) {
  const stored = space.academics?.[year] || {};
  const plan = {...stored,year,classes:space.classesByYear?.[year]||stored.classes||[],dayRules:stored.dayRules||[]};
  const curriculum = normalizeCurriculum(space.curricula);
  const targets = Object.fromEntries(operationalPlan(curriculum,year).grades.filter(g=>g.ready).map(g=>{
    const terms=g.semesters.map(({totals})=>{
      const a=totals.byArea;
      return {subject:Object.entries(a).filter(([k])=>!creative.includes(area(k))).reduce((sum,[,n])=>sum+n,0),...Object.fromEntries(creative.map(k=>[k,(a[k]||0)+(k==='creative_club'?(a.sports||0):0)]))};
    });
    return [g.grade,{1:terms[0],2:terms[1],annual:Object.fromEntries(Object.keys(terms[0]).map(k=>[k,terms[0][k]+terms[1][k]]))}];
  }));
  return {year,plan,targets,events:(space.events||[]).filter(e=>e.date<=academicEnd(year)&&dateEnd(e)>=academicStart(year)),dayHours:{},versions:{},history:[],snapshot:null};
}

export function ruleFor(model,date,grade=null) {
  return effectiveDateRule(model.plan,date,grade)||{date,kind:[0,6].includes(weekday(date))?'weekend':'instruction'};
}

export function capacity(model,date,grade) {
  if(!isInstructionDate(model.plan,date,grade)) return 0;
  const w=ruleFor(model,date,grade).weekdayOverride||weekday(date);
  const config=model.plan.timetableConfig;
  return number(model.dayHours[date]?.[grade]??config?.gradePeriods?.[grade]?.[w]??config?.periods?.[w]);
}

export function term2(model,grade=null) {
  const override=(model.plan.gradeRules||[]).filter(r=>Number(r.grade)===grade);
  const rules=new Map([...model.plan.dayRules,...override].map(r=>[r.date,r]));
  const summer=[...rules.values()].filter(r=>inYear(model.year,r.date)&&r.kind==='vacation'&&/여름|하계/.test(r.label||'')).map(r=>r.date).sort().at(-1);
  if(!summer) return null;
  return rangeDates(plusDays(summer,1),academicEnd(model.year)).find(d=>isInstructionDate(model.plan,d,grade))||null;
}

export function periodPreview(model,start,end,kind,label,replace=[]) {
  if(!inYear(model.year,start)||!inYear(model.year,end)||start>end) return [];
  return rangeDates(start,end).map(date=>{
    const stored=model.plan.dayRules.find(r=>r.date===date);
    return {date,before:ruleFor(model,date),after:{...stored,date,kind,label,source:'range',weekdayOverride:kind==='instruction'?stored?.weekdayOverride||0:0},blocked:Boolean(stored&&stored.source!=='range'&&!replace.includes(date))};
  });
}

export function eventPeriods(model,event,date,grade,classId=null) {
  if(!activeOn(event,date)||event.grades?.length&&!event.grades.map(Number).includes(grade)) return null;
  const slots=event.rebuild;
  if(slots) {
    if(slots.classIds?.length&&!slots.classIds.includes(classId)) return null;
    // A class exception replaces the full date's common allocation.
    const assigned=slots.classes?.[classId]?.[date]??slots.grades?.[grade]?.[date]??{};
    const count=capacity(model,date,grade);
    const map=Object.fromEntries(Array.from({length:count??0},(_,i)=>[i+1,'subject']));
    return {...map,...assigned};
  }
  const first=number(event.periodStart),last=number(event.periodEnd);
  const value=legacy[gradeArea(event,grade)];
  if(!event.affectsTimetable||!value||!first||!last||last<first) return null;
  return Object.fromEntries(Array.from({length:last-first+1},(_,i)=>[first+i,value]));
}

const totals = () => ({capacity:0,subject:0,creative:0,missing:0,conflicts:0,byArea:Object.fromEntries(creative.map(k=>[k,0]))});
function add(total,row) {
  for(const k of ['capacity','subject','creative','missing','conflicts']) total[k]+=row[k];
  for(const k of creative) total.byArea[k]+=row.byArea[k];
}
function weeklyCreative(plan,c) {
  const rows=plan.weekly||[];
  const subjects=new Map((plan.subjects||[]).map(s=>[s.id,area(s.kind)]));
  const groups=new Map((plan.groups||[]).map(g=>[g.id,g.classIds||[]]));
  return rows.filter(row=>creative.includes(subjects.get(row.subjectId))&&(row.scope==='class'?row.scopeId===c.id:groups.get(row.scopeId)?.includes(c.id))).map(row=>({...row,area:subjects.get(row.subjectId)}));
}

export function evaluate(model) {
  const dates=rangeDates(academicStart(model.year),academicEnd(model.year));
  const boundary=term2(model), days={annual:0,1:boundary?0:null,2:boundary?0:null}, warnings=[];
  const notice=(type,detail)=>warnings.push({type,...detail});
  for(const d of dates) if(isInstructionDate(model.plan,d)){days.annual++;if(boundary)days[d<boundary?1:2]++;}
  if(days.annual<(model.plan.targetDays||190)) notice('수업일수 기준 미달',{text:`${days.annual}일 / ${model.plan.targetDays||190}일`});
  if(!boundary) notice('2학기 시작일 미확정',{text:'여름방학 종료 후 첫 수업일을 확인하세요.'});
  if(!model.plan.holidaysLastChecked) notice('공식 공휴일 확인 필요',{});
  const recurring=v12Recurring(model.plan);
  const knownClasses=new Set(model.plan.classes.map(c=>c.id));
  const eventDays=new Map(dates.map(date=>[date,[]]));
  for(const e of model.events) {
    for(const id of new Set([...(e.rebuild?.classIds||[]),...Object.keys(e.rebuild?.classes||{})])) if(!knownClasses.has(id)) notice('학급 정보 확인',{text:`${e.name} · ${id}`});
    if(!e.rebuild&&e.subjectId) notice('기존 교과 지정 보존',{text:e.name});
    for(const date of dates) if(activeOn(e,date)) eventDays.get(date).push(e);
  }
  const grades=gradeIds(model.plan).map(grade=>{
    const start=term2(model,grade)||boundary;
    const classes=model.plan.classes.filter(c=>Number(c.grade)===grade);
    const scopes=classes.length?classes:[{id:null,label:'학년 공통'}];
    return {grade,targets:model.targets[grade]||{},classes:scopes.map(c=>{
      const sums={annual:totals(),1:start?totals():null,2:start?totals():null};
      const weekly=weeklyCreative(model.plan,c), repeated=recurring.filter(r=>Number(r.학년)===grade);
      for(const date of dates) {
        const max=capacity(model,date,grade), term=start?(date<start?1:2):null;
        const row=totals(), claims=new Map(), existing=new Map();
        const wd=ruleFor(model,date,grade).weekdayOverride||weekday(date);
        const append=(map,p,item)=>map.set(Number(p),[...(map.get(Number(p))||[]),item]);
        for(const w of weekly) if(Number(w.weekday)===wd&&(!w.term||Number(w.term)===term)) append(existing,w.period,w.area);
        for(const r of repeated) {
          if(DAYS[wd]!==r.요일||term&&term!==Number(r.학기)||String(r.제외일목록||'').split(',').map(s=>s.trim()).includes(date)) continue;
          for(let p=Number(r.시작교시);p<=Number(r.종료교시)&&p<=12;p++) append(existing,p,term?legacy[r.영역]:'unknown');
        }
        for(const event of eventDays.get(date)) {
          const result=eventPeriods(model,event,date,grade,c.id);
          for(const [p,a] of Object.entries(result||{})){
            if(max!=null&&Number(p)>max) notice('운영 교시 범위 밖 편성',{date,grade,classLabel:c.label,period:p,text:event.name});
            else append(claims,p,{area:a,name:event.name,id:event.id});
          }
        }
        row.capacity=max??0;row.missing=Number(max==null);
        if(max>0) for(const p of existing.keys()) if(p>max) notice('운영 교시 범위 밖 반복 창체',{date,grade,classLabel:c.label,period:p});
        for(let p=1;p<=row.capacity;p++) {
          const matches=claims.get(p)||[];
          const choices=new Set(matches.length?matches.map(x=>x.area):existing.get(p)||['subject']);
          if(matches.length>1) notice(choices.size>1?'행사 편성 충돌':'행사 중복',{date,grade,classLabel:c.label,period:p,ids:matches.map(x=>x.id),text:matches.map(x=>x.name).join(' / ')});
          const value=[...choices][0];
          if(choices.size!==1||!Object.hasOwn(labels,value)) row.conflicts++;
          else if(value==='subject') row.subject++;
          else {row.creative++;row.byArea[value]++;}
        }
        add(sums.annual,row);if(term)add(sums[term],row);
      }
      return {...c,sums};
    })};
  });
  return {days,boundary,warnings,grades};
}

export function need(row,target) {
  if(!row||!target||row.missing||row.conflicts) return null;
  return row.subject-target.subject;
}

export function readItem(model,key){
  const [type,id]=key.split(':');
  if(type==='day')return {rule:model.plan.dayRules.find(r=>r.date===id)||null,hours:model.dayHours[id]||{}};
  if(type==='event')return model.events.find(e=>e.id===id)||null;
  if(type==='holidays')return {at:model.plan.holidaysLastChecked||null,dates:model.plan.holidayDates||[]};
  throw Error('저장 항목의 유형이 올바르지 않습니다.');
}

export function commit(model,changes,{actor,canEdit,at=new Date().toISOString(),confirmation=false,operation='수정'}={}) {
  if(!canEdit||!actor) return {ok:false,message:'편집 권한을 확인해 주세요.'};
  const keys=new Set();
  for(const x of changes) {
    if(keys.has(x.key)) return {ok:false,message:'같은 항목이 저장 요청에 중복되어 있습니다.'};
    keys.add(x.key);
  }
  const conflicts=changes.filter(x=>(model.versions[x.key]||0)!==x.version).map(x=>({key:x.key,saved:readItem(model,x.key),incoming:x.value}));
  if(conflicts.length) return {ok:false,message:'다른 편집이 먼저 저장되었습니다.',conflicts};
  const next=clone(model);
  for(const {key,value} of changes) {
    const before=readItem(next,key),[type,id]=key.split(':');
    if(JSON.stringify(before)===JSON.stringify(value)) continue;
    if(type==='day'){
      if(!inYear(next.year,id)||Object.values(value.hours).some(n=>number(n)===null))return {ok:false,message:'날짜와 운영 교시를 확인해 주세요.'};
      next.plan.dayRules=next.plan.dayRules.filter(r=>r.date!==id);
      if(value.rule) next.plan.dayRules.push({...value.rule,date:id});
      if(Object.keys(value.hours).length) next.dayHours[id]=value.hours;
      else delete next.dayHours[id];
    }
    if(type==='event'){
      if(value&&(!value.name?.trim()||value.id!==id||!inYear(next.year,value.date)||!inYear(next.year,dateEnd(value))||value.date>dateEnd(value)))return {ok:false,message:'행사명과 기간을 확인해 주세요.'};
      next.events=next.events.filter(e=>e.id!==id);
      if(value)next.events.push(value);
    }
    if(type==='holidays'){next.plan.holidaysLastChecked=value.at;next.plan.holidayDates=value.dates;}
    const revision=(next.versions[key]||0)+1;
    next.versions[key]=revision;
    next.history.push({key,before,after:clone(value),revision,actor,at,operation});
  }
  if(confirmation) {
    const {history,snapshot,versions,...data}=next;
    next.snapshot={data:clone(data),at,actor,historyCount:history.length};
  }
  return {ok:true,model:next};
}

export const change = (model,key,value) => ({key,value,version:model.versions[key]||0});
export const status = model => model.snapshot?(model.history.length>model.snapshot.historyCount?'재확인 필요':'확정'):model.plan.status==='confirmed'?'재확인 필요':'초안';
export function holidayChanges(model,holidays,at=new Date().toISOString()){
  const incoming=new Map(holidays.filter(x=>x.holiday!==false&&inYear(model.year,x.date)).map(x=>[x.date,x]));
  if(!incoming.size) throw Error('해당 학년도의 공식 공휴일 자료가 없습니다.');
  const affected=new Set([...incoming.keys(),...model.plan.dayRules.filter(x=>x.source==='kasi').map(x=>x.date)]);
  const changes=[];
  for(const date of affected){
    const key='day:'+date,old=readItem(model,key),found=incoming.get(date);
    if(old.rule&&old.rule.source!=='kasi')continue;
    changes.push(change(model,key,{...old,rule:found?{date,kind:'holiday',label:found.name,source:'kasi'}:null}));
  }
  return [...changes,change(model,'holidays',{at,dates:[...incoming.keys()].sort()})];
}

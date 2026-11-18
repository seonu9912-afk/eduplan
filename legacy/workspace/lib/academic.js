// Academic planner: all calculations are pure and do not depend on the browser clock.
const pad = number => String(number).padStart(2, '0');
export const iso = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`;
export const parseDate = value => new Date(`${value}T12:00:00Z`);
export const plusDays = (value, number) => iso(new Date(parseDate(value).getTime() + number * 86400000));
export const weekday = value => parseDate(value).getUTCDay();
export const academicStart = year => `${year}-03-01`;
export const academicEnd = year => plusDays(`${year + 1}-03-01`, -1);
export const rangeDates = (a, b) => {
  if (!a || !b || a > b) return [];
  const result=[];
  for(let d=a;d<=b && result.length<390;d=plusDays(d,1)) result.push(d);
  return result;
};
export const KIND_LABELS = {
  subject:'교과', autonomous:'학교자율시간', creative_self:'창체 · 자율·자치',
  creative_club:'창체 · 동아리', creative_career:'창체 · 진로', creative_volunteer:'봉사활동(과거 편성)', free_topic:'자유학기 · 주제선택', free_career:'자유학기 · 진로탐색',free_other:'자유학기 활동',sports:'창체 · 동아리(스포츠클럽)',
};
export const DEFAULT_SUBJECTS = [
  {id:'korean',label:'국어',kind:'subject'}, {id:'math',label:'수학',kind:'subject'},
  {id:'english',label:'영어',kind:'subject'}, {id:'social',label:'사회',kind:'subject'},
  {id:'science',label:'과학',kind:'subject'}, {id:'physical',label:'체육',kind:'subject'},
  {id:'arts',label:'예술',kind:'subject'},
  {id:'creative-self',label:'자율·자치',kind:'creative_self'},
  {id:'creative-club',label:'동아리',kind:'creative_club'},
  {id:'creative-career',label:'진로활동',kind:'creative_career'},
  {id:'sports',label:'학교스포츠클럽',kind:'sports'},
  {id:'school-autonomy',label:'학교자율시간',kind:'autonomous'},
];
export const categoryOf = kind => kind==='sports'?'creative_club':kind;
export const schoolDay = (date, rules) => {
  const rule=rules.find(r=>r.date===date);
  if(rule) return rule.kind==='instruction';
  return weekday(date)>=1&&weekday(date)<=5;
};
export const dayRule = (date, rules) => rules.find(r=>r.date===date);
export const effectiveWeekday = (date, rules) => dayRule(date,rules)?.weekdayOverride || weekday(date);
// The first school day after the last summer-vacation date is derived,
// never entered independently before the vacation has been arranged.
// Derive the first instructional day after the *summer* vacation block.
// A separate autumn break must not move the second-semester start.
export const getTerm2Start = (plan,grade=null) => {
  const year=plan?.year;
  if(!Number.isInteger(year))return null;
  const byDate=new Map((plan.dayRules||[]).map(r=>[r.date,r]));
  if(grade!==null){for(const r of plan.gradeRules||[])if(Number(r.grade)===Number(grade))byDate.set(r.date,r);}
  const summerDays=[...byDate.values()]
    .filter(r=>r.kind==='vacation'&&r.date>=`${year}-06-01`&&r.date<=`${year}-09-15`)
    .sort((a,b)=>a.date.localeCompare(b.date));
  if(!summerDays.length)return null;
  const groups=[];
  for(const r of summerDays){
    const last=groups.at(-1);
    if(last&&plusDays(last.at(-1).date,1)===r.date)last.push(r);
    else groups.push([r]);
  }
  // Prefer an explicitly named summer vacation; otherwise use the longest block.
  const score=g=>g.length*10+(g.some(r=>/여름|하계/.test(r.label||''))?10000:0);
  const block=groups.sort((a,b)=>score(b)-score(a)||a[0].date.localeCompare(b[0].date))[0];
  const last=block.at(-1).date;
  for(let d=plusDays(last,1);d<=academicEnd(year);d=plusDays(d,1)){
    const rule=byDate.get(d);
    if(rule?rule.kind==='instruction':weekday(d)>=1&&weekday(d)<=5)return d;
  }
  return null;
};
// A grade-specific day rule supersedes the school-wide rule, including weekend instruction.
export const instructionForGrade = (plan,date,grade=null) => {
  const rule=grade===null?null:(plan.gradeRules||[]).find(r=>r.date===date&&Number(r.grade)===Number(grade));
  return rule?rule.kind==='instruction':schoolDay(date,plan.dayRules||[]);
};
export const effectiveWeekdayForGrade = (plan,date,grade=null) => {
  const specific=grade===null?null:(plan.gradeRules||[]).find(r=>r.date===date&&Number(r.grade)===Number(grade));
  return specific?(specific.weekdayOverride||weekday(date)):effectiveWeekday(date,plan.dayRules||[]);
};
export const findAcademic = (space,year=2027) => space?.academics?.[String(year)] || createAcademic(year);
export const createAcademic = (year=2027) => {
  const classes = [1,2,3].flatMap(grade=>[1,2].map(no=>({id:`g${grade}c${no}`,grade,label:`${grade}학년 ${no}반`})));
  const subjects=DEFAULT_SUBJECTS.map(s=>({...s}));
  const weekly=[];
  const monFri=[1,2,3,4,5];
  for (const c of classes) {
    const templates=[['korean','math','english','social','physical'],['math','korean','science','english','creative-career'],['english','science','social','korean','creative-self'],['social','physical','math','science','creative-club'],['physical','english','arts','korean','sports']];
    monFri.forEach((day,di)=>templates[di].forEach((subjectId,pi)=>weekly.push({id:`wk-${c.id}-${day}-${pi+1}`,scope:'class',scopeId:c.id,weekday:day,period:pi+1,subjectId,teacherId:'',room:''})));
  }
  // Demo sports groups: four classes in grades 1 and 2 show how split class arrangements work.
  const rules=[]; // Official holidays are only added after fetching the verified public-data source.
  // Do not pre-populate unverified holiday lists or annual vacations.
  return {
    year, status:'draft', targetDays:190,
    classes, subjects, teachers:[{id:'teacher1',label:'국어 교사'},{id:'teacher2',label:'수학 교사'}],
    groups:[], rooms:[], targets:[], weekly, dayRules:rules, overrides:[],
    createdAt:new Date().toISOString(),
  };
};
const eventSubjectMap={creative_self:'creative-self',creative_club:'creative-club',creative_career:'creative-career',sports:'sports',autonomous:'school-autonomy'};
// A school may import its curriculum with generated course IDs. Resolve activities
// by the curriculum classification instead of relying on demo-only subject IDs.
export function eventSubjectForArea(plan,event){
  const subjects=plan.subjects||[];
  if(event.curriculumArea==='subject')return subjects.some(s=>s.id===event.subjectId)?event.subjectId:null;
  const kind=event.curriculumArea;
  if(!kind||kind==='none')return null;
  const exact=subjects.find(s=>s.kind===kind);
  if(exact)return exact.id;
  const fallback=eventSubjectMap[kind];
  return subjects.find(s=>s.id===fallback)?.id||null;
}
function eventsForDate(plan,date,events){
  const classes=plan.classes||[];
  const activeClasses=classes.filter(c=>instructionForGrade(plan,date,c.grade));
  const result=[];
  for(const event of (events||[])){
    if(event.affectsTimetable!==true||event.date>date||date>(event.endDate||event.date))continue;
    const first=Number(event.periodStart),last=Number(event.periodEnd);
    if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last>12||first>last)continue;
    const eligible=activeClasses.filter(c=>(!event.grades?.length||event.grades.map(Number).includes(Number(c.grade))) &&
      (!event.classIds?.length||event.classIds.includes(c.id)));
    if(!event.gradeAreas){
      const subjectId=eventSubjectForArea(plan,event);
      if(subjectId)result.push({event,subjectId,first,last,chosen:eligible});
      continue;
    }
    // Original academic planner v12 allows distinct curricular areas for each grade.
    // Only areas replacing the ordinary class subject create timetable changes.
    // '교과' retains the originally scheduled subject, '없음' skips that grade.
    const mapping={자율:'creative_self','자율·자치':'creative_self',동아리:'creative_club',진로:'creative_career',봉사:'creative_self',학교자율시간:'autonomous'};
    const groups=new Map();
    for(const c of eligible){
      const area=event.gradeAreas[c.grade]??event.gradeAreas[String(c.grade)];
      if(!mapping[area])continue;
      if(!groups.has(area))groups.set(area,[]);
      groups.get(area).push(c);
    }
    for(const [area,chosen] of groups){
      const adapted={...event,curriculumArea:mapping[area],volunteer:area==='봉사'};
      const subjectId=eventSubjectForArea(plan,adapted);
      if(subjectId)result.push({event:adapted,subjectId,first,last,chosen});
    }
  }
  return result;
}
// Record collisions independently of the chosen visual ordering. Never silently
// treat two simultaneous school events as two delivered class periods.
export function eventOverlapsForDate(plan,date,events=[]){
  const seen=new Map(),conflicts=[];
  for(const {event,first,last,chosen} of eventsForDate(plan,date,events))for(const c of chosen)for(let p=first;p<=last;p++){
    const key=`${c.id}:${p}`;
    if(seen.has(key))conflicts.push({date,classId:c.id,period:p,firstEventId:seen.get(key).id,secondEventId:event.id,
      message:`${c.label} ${date} ${p}교시 행사 중복: ${seen.get(key).name} / ${event.name}`});
    else seen.set(key,event);
  }
  return conflicts;
}
export const planForDate = (plan,date,events=[]) => {
  const classes=plan.classes||[];
  const classMap=new Map(classes.map(c=>[c.id,c]));
  const activeClasses=classes.filter(c=>instructionForGrade(plan,date,c.grade));
  const allowedIds=new Set(activeClasses.map(c=>c.id));
  const groupIsActive=g=>{
    const members=(g.classIds||[]).map(id=>classMap.get(id)).filter(Boolean);
    return members.length>0&&members.length===(g.classIds||[]).length&&members.every(c=>allowedIds.has(c.id))&&
      new Set(members.map(c=>effectiveWeekdayForGrade(plan,date,c.grade))).size===1;
  };
  const groups=(plan.groups||[]).filter(groupIsActive);
  const allowedGroups=new Set(groups.map(g=>g.id));
  const activeGroupDay=Object.fromEntries(groups.map(g=>[g.id,effectiveWeekdayForGrade(plan,date,classMap.get(g.classIds[0]).grade)]));
  const base=(plan.weekly||[]).filter(slot=>{
    if(slot.scope==='class')return allowedIds.has(slot.scopeId)&&slot.weekday===effectiveWeekdayForGrade(plan,date,classMap.get(slot.scopeId).grade);
    if(slot.scope==='group')return allowedGroups.has(slot.scopeId)&&slot.weekday===activeGroupDay[slot.scopeId];
    return false;
  }).map(slot=>({...slot,date,source:'base'}));
  for(const change of plan.overrides||[]){
    if(change.date!==date)continue;
    if(change.scope==='class'&&!allowedIds.has(change.scopeId))continue;
    if(change.scope==='group'&&!allowedGroups.has(change.scopeId))continue;
    const index=base.findIndex(s=>s.scope===change.scope&&s.scopeId===change.scopeId&&s.period===change.period);
    if(index>=0)base.splice(index,1);
    if(change.action==='replace')base.push({...change,id:`change-${change.id}`,source:'override',date});
  }
  // Events replace dated occurrences, never the recurring weekly template.
  const reservedEvents=new Set();
  for(const {event,chosen,first,last,subjectId} of eventsForDate(plan,date,events)){
    const chosenIds=new Set(chosen.map(c=>c.id));
    for(let i=base.length-1;i>=0;i--){
      const slot=base[i];
      if(slot.scope!=='group'||slot.period<first||slot.period>last)continue;
      const members=(plan.groups||[]).find(g=>g.id===slot.scopeId)?.classIds||[];
      if(members.length&&members.every(id=>chosenIds.has(id)))base.splice(i,1);
    }
    for(const c of chosen)for(let period=first;period<=last;period++){
      const key=`${c.id}:${period}`;
      if(reservedEvents.has(key))continue; // conflict reported by eventOverlapsForDate
      reservedEvents.add(key);
      for(let i=base.length-1;i>=0;i--){const x=base[i];if(x.scope==='class'&&x.scopeId===c.id&&x.period===period)base.splice(i,1);}
      base.push({id:`event-${event.id}-${c.id}-${date}-${period}`,date,source:'event',eventId:event.id,activityLabel:event.name,volunteer:!!event.volunteer,scope:'class',scopeId:c.id,weekday:effectiveWeekdayForGrade(plan,date,c.grade),period,subjectId,teacherId:'',room:''});
    }
  }
  return base;
};
export const classesForSlot = (plan,slot) => {
  if(slot.scope==='class')return [slot.scopeId];
  return plan.groups.find(g=>g.id===slot.scopeId)?.classIds||[];
};
export const hoursPerKind = (counts,plan,grade) => {
  const count={subject:0,autonomous:0,creative_self:0,creative_club:0,creative_career:0};
  for (const a of plan.subjects||[]) {
    const target=counts[a.id]||0;
    const key=categoryOf(a.kind);
    count[key]=(count[key]||0)+target;
  }
  return count;
};
export function summarizeAcademic(plan,events=[]){
  const days=rangeDates(academicStart(plan.year),academicEnd(plan.year));
  const subjectsById=Object.fromEntries((plan.subjects||[]).map(s=>[s.id,s]));
  const classMap=Object.fromEntries((plan.classes||[]).map(c=>[c.id,c]));
  const totals=Object.fromEntries((plan.classes||[]).map(c=>[c.id,{total:0,bySubject:{},byCategory:{},terms:[0,0]}]));
  let daysTotal=0,firstTerm=0,secondTerm=0;
  const term2=getTerm2Start(plan);
  const byWeekday={1:0,2:0,3:0,4:0,5:0,6:0,0:0};
  const warnings=[];
  const sampleConflicts=new Map();
  const addConflict=(key,date,message)=>{
    if(!sampleConflicts.has(key))sampleConflicts.set(key,{date,message,count:0});
    sampleConflicts.get(key).count++;
  };
  for (const date of days){
    if(schoolDay(date,plan.dayRules||[])){
      daysTotal++;
      if(term2){if(date<term2)firstTerm++;else secondTerm++;}
      const wd=effectiveWeekday(date,plan.dayRules||[]);byWeekday[wd]++;
    }
    for(const overlap of eventOverlapsForDate(plan,date,events))addConflict(`event:${overlap.classId}:${overlap.period}:${overlap.firstEventId}:${overlap.secondEventId}`,date,overlap.message);
    const slots=planForDate(plan,date,events);
    if(!slots.length)continue;
    const classPeriods=new Map(), teacherPeriods=new Map(), roomPeriods=new Map();
    for (const s of slots){
      const activity=subjectsById[s.subjectId];
      if(!activity)continue;
      const expanded=classesForSlot(plan,s);
      const kind=categoryOf(activity.kind);
      for(const cid of expanded){
        const t=totals[cid];if(!t)continue;
        t.total++;
        const cls=classMap[cid];const gradeTerm=getTerm2Start(plan,cls?.grade)||term2;
        if(gradeTerm)t.terms[date<gradeTerm?0:1]++;
        t.bySubject[s.subjectId]=(t.bySubject[s.subjectId]||0)+1;
        t.byCategory[kind]=(t.byCategory[kind]||0)+1;
        const k=`${cid}-${s.period}`;
        if(classPeriods.has(k))addConflict(`class:${k}` ,date,`${classMap[cid]?.label||cid} ${s.period}교시 중복 (${date})`);
        classPeriods.set(k,true);
      }
      if(s.teacherId){
        const k=`${s.teacherId}-${s.period}`;
        if(teacherPeriods.has(k))addConflict(`teacher:${k}`,date,`동일 교사 ${s.period}교시 중복 (${date})`);
        teacherPeriods.set(k,true);
      }
      if(s.room){
        const k=`${s.room.toLowerCase()}-${s.period}`;
        if(roomPeriods.has(k))addConflict(`room:${k}`,date,`${s.room} ${s.period}교시 중복 (${date})`);
        roomPeriods.set(k,true);
      }
    }
  }
  for (const cls of plan.classes||[]){
    const t=totals[cls.id];
    for(const x of plan.targets||[]){
      if(x.grade===cls.grade&&Number(x.hours)>0){
        const actual=t.bySubject[x.subjectId]||0;
        if(actual<Number(x.hours)) warnings.push({level:'warn',message:`${cls.label} · ${subjectsById[x.subjectId]?.label||x.subjectId}: 목표 ${x.hours}시간, 예상 ${actual}시간 (부족 ${Number(x.hours)-actual}시간)`});
      }
    }
  }
  // A complete allocation sheet without an applied weekly timetable is not a
  // completed school schedule. Check each demanded class/subject pair, even if
  // annual plan.targets was never populated by the curriculum import screen.
  const lessons=plan.timetableConfig?.lessons||[];
  if(lessons.length){
    const expected=new Map(),actual=new Map();
    const classIdsFor=row=>row.scope==='class'?[row.scopeId]:(plan.groups||[]).find(g=>g.id===row.scopeId)?.classIds||[];
    for(const d of lessons)for(const cid of classIdsFor(d)){
      const key=`${cid}|${d.subjectId}`;expected.set(key,(expected.get(key)||0)+Number(d.hours||0));
    }
    for(const d of plan.weekly||[])for(const cid of classIdsFor(d)){
      const key=`${cid}|${d.subjectId}`;actual.set(key,(actual.get(key)||0)+1);
    }
    const gaps=[...expected].filter(([key,hours])=>Math.abs(hours-(actual.get(key)||0))>0.001);
    if(gaps.length){
      const missing=gaps.reduce((total,[key,h])=>total+Math.max(0,h-(actual.get(key)||0)),0);
      warnings.unshift({level:'error',message:`수업 배정표와 기본 시간표가 일치하지 않습니다: ${gaps.length}개 학급·과목, 주당 미배정 ${missing}시간. 교육과정 예정시수는 시간표 적용 전까지 미확정입니다.`});
      for(const [key,h] of gaps.slice(0,12)){
        const [cid,sid]=key.split('|');const cls=classMap[cid];
        warnings.push({level:'warn',message:`${cls?.label||cid} · ${subjectsById[sid]?.label||sid}: 배정표 ${h}시간 / 기본 시간표 ${actual.get(key)||0}시간`});
      }
      if(gaps.length>12)warnings.push({level:'info',message:`그 밖에 불일치한 학급·과목 ${gaps.length-12}개가 더 있습니다.`});
    }
  }
  if(daysTotal<Number(plan.targetDays||190))warnings.unshift({level:'error',message:`수업일수 목표 ${plan.targetDays}일보다 ${Number(plan.targetDays||190)-daysTotal}일 부족합니다.`});
  // A conflict is repeated weekly; show its first occurrence and total number of dates.
  const conflicts=[...sampleConflicts.values()].map(x=>({...x,level:'error'}));
  return {daysTotal,firstTerm,secondTerm,byWeekday,totals,warnings,conflicts,days};
}

export function validatePlan(plan){
  if(!plan || !Number.isInteger(plan.year)||plan.year<2020||plan.year>2100)return '유효한 학년도가 아닙니다.';
  if(!Array.isArray(plan.classes)||!Array.isArray(plan.subjects)||!Array.isArray(plan.weekly)||!Array.isArray(plan.dayRules)||!Array.isArray(plan.overrides)||!Array.isArray(plan.groups))return '필수 편성 데이터가 없습니다.';
  if(plan.weekly.some(s=>!Number.isInteger(s.weekday)||s.weekday<1||s.weekday>5||s.period<1||s.period>12))return '주간 시간표 데이터에 올바르지 않은 교시가 있습니다.';
  return null;
}

// Deterministic, browser-safe constraint search. No school data is uploaded to solve.
export const WDAYS = [1,2,3,4,5];
export const WDAY_NAMES = {1:'월',2:'화',3:'수',4:'목',5:'금'};
export const DEFAULT_DAY_PERIODS = {1:7,2:7,3:7,4:7,5:6};
export const DEFAULT_BELL = [
  {id:'arrival',label:'조회',type:'routine',start:'08:40',end:'08:50'},
  {id:'p1',label:'1교시',type:'lesson',period:1,start:'09:00',end:'09:45'},
  {id:'p2',label:'2교시',type:'lesson',period:2,start:'09:55',end:'10:40'},
  {id:'p3',label:'3교시',type:'lesson',period:3,start:'10:50',end:'11:35'},
  {id:'p4',label:'4교시',type:'lesson',period:4,start:'11:45',end:'12:30'},
  {id:'lunch',label:'점심시간',type:'lunch',start:'12:30',end:'13:30'},
  {id:'p5',label:'5교시',type:'lesson',period:5,start:'13:30',end:'14:15'},
  {id:'p6',label:'6교시',type:'lesson',period:6,start:'14:25',end:'15:10'},
  {id:'p7',label:'7교시',type:'lesson',period:7,start:'15:20',end:'16:05'},
];
export const EMPTY_TIMETABLE_CONFIG = () => ({teacherQuality:{maxDailyLessons:5,maxConsecutiveLessons:3,targetDailySpread:2},periods:{...DEFAULT_DAY_PERIODS},bell:DEFAULT_BELL.map(x=>({...x})),unavailable:[],lessons:[],fixed:[],lastApplied:null});
export const timetableConfig = plan => ({...EMPTY_TIMETABLE_CONFIG(),...(plan.timetableConfig||{}), periods:{...DEFAULT_DAY_PERIODS,...(plan.timetableConfig?.periods||{})}});
export function extractDemands(plan) {
  const grouped=new Map();
  for(const s of plan.weekly||[]){
    if(!s.subjectId)continue;
    const key=[s.scope,s.scopeId,s.subjectId,s.teacherId||'',s.room||''].join('|');
    if(!grouped.has(key))grouped.set(key,{id:`demand-${grouped.size}-${s.scopeId}`,scope:s.scope,scopeId:s.scopeId,subjectId:s.subjectId,teacherId:s.teacherId||'',room:s.room||'',hours:0,block:1,syncKey:'',fixedDay:0,fixedPeriod:0});
    grouped.get(key).hours++;
  }
  return [...grouped.values()];
}
export function demandScopes(plan,demand) {
  if(demand.scope==='class')return (plan.classes||[]).some(c=>c.id===demand.scopeId)?[demand.scopeId]:[];
  const group=(plan.groups||[]).find(g=>g.id===demand.scopeId);
  return (group?.classIds||[]).filter(id=>(plan.classes||[]).some(c=>c.id===id));
}
const keyOf=(a,b,c)=>`${a}|${b}|${c}`;
const positiveInt=n=>Number.isInteger(Number(n))&&Number(n)>0;
const lessonTitle=(plan,d)=>`${(plan.classes||[]).find(c=>c.id===d.scopeId)?.label||(plan.groups||[]).find(g=>g.id===d.scopeId)?.label||d.scopeId} · ${(plan.subjects||[]).find(s=>s.id===d.subjectId)?.label||d.subjectId}`;
export function validateTimetableInput(plan,config=timetableConfig(plan)) {
  const errors=[]; const warnings=[];
  const lessons=config.lessons||[];
  if(!lessons.length)errors.push('수업 배정표가 비어 있습니다. 수업 배정을 입력하거나 기존 시간표에서 불러오세요.');
  for(const w of WDAYS)if(!Number.isInteger(Number(config.periods[w]))||Number(config.periods[w])<1||Number(config.periods[w])>12)errors.push(`${WDAY_NAMES[w]}요일 운영 교시는 1~12교시여야 합니다.`);
  const groups=new Map(); const seen=new Set();
  for(const d of lessons){
    if(seen.has(d.id))errors.push('수업 배정 ID가 중복됩니다.');seen.add(d.id);
    const label=lessonTitle(plan,d);
    if(!positiveInt(d.hours)||Number(d.hours)>30)errors.push(`${label}: 주당 시수는 1~30이어야 합니다.`);
    if(!positiveInt(d.block)||Number(d.block)>3)errors.push(`${label}: 연속 수업 길이는 1~3교시여야 합니다.`);
    if(!(plan.subjects||[]).some(s=>s.id===d.subjectId))errors.push(`${label}: 과목을 확인하세요.`);
    const classes=demandScopes(plan,d);
    if(!classes.length)errors.push(`${label}: 배정 학급/활동반이 존재하지 않습니다.`);
    if(d.scope==='group'&&classes.length!==(plan.groups||[]).find(g=>g.id===d.scopeId)?.classIds?.length)errors.push(`${label}: 활동반 학급 구성이 올바르지 않습니다.`);
    if(d.teacherId&&!(plan.teachers||[]).some(t=>t.id===d.teacherId))errors.push(`${label}: 교원 목록에 없는 교사입니다.`);
    if(!d.teacherId)warnings.push(`${label}: 교사가 미지정되어 교사 중복 여부를 확인할 수 없습니다.`);
    if(d.room&&!(plan.rooms||[]).includes(d.room))warnings.push(`${label}: 특별실 목록에 없는 장소입니다.`);
    if(d.fixedDay||d.fixedPeriod){
      if(!WDAYS.includes(Number(d.fixedDay))||!positiveInt(d.fixedPeriod))errors.push(`${label}: 고정 요일·교시를 모두 지정하세요.`);
    }
    if(d.syncKey?.trim()){
      const name=d.syncKey.trim(); if(!groups.has(name))groups.set(name,[]);groups.get(name).push(d);
    }
  }
  for(const [name,rows] of groups){
    if(rows.length<2)warnings.push(`공통시간 '${name}'은 2개 이상의 배정 행에 지정할 때 적용됩니다.`);
    const signature=rows.map(d=>`${d.hours}/${d.block}`);
    if(new Set(signature).size>1)errors.push(`공통시간 '${name}'의 수업시수와 연속수업 길이가 서로 다릅니다.`);
  }
  const capacityByClass=new Map((plan.classes||[]).map(c=>[c.id,0]));
  for(const d of lessons)for(const cid of demandScopes(plan,d))capacityByClass.set(cid,(capacityByClass.get(cid)||0)+Number(d.hours||0));
  const available=WDAYS.reduce((n,w)=>n+Number(config.periods[w]||0),0);
  for(const [cid,n] of capacityByClass){if(n>available)errors.push(`${(plan.classes||[]).find(c=>c.id===cid)?.label||cid}: 배정 ${n}시간이 한 주의 수업 가능 칸 ${available}시간을 초과합니다.`);}
  const teacherHours=new Map();const roomHours=new Map();
  for(const d of lessons){if(d.teacherId)teacherHours.set(d.teacherId,(teacherHours.get(d.teacherId)||0)+Number(d.hours||0));if(d.room)roomHours.set(d.room,(roomHours.get(d.room)||0)+Number(d.hours||0));}
  const unavailable=new Set((config.unavailable||[]).map(x=>keyOf(x.teacherId,x.weekday,x.period)));
  for(const [id,hours] of teacherHours){
    let possible=0;for(const wd of WDAYS)for(let p=1;p<=Number(config.periods[wd]||0);p++)if(!unavailable.has(keyOf(id,wd,p)))possible++;
    if(hours>possible)errors.push(`${(plan.teachers||[]).find(t=>t.id===id)?.label||id}: 담당 ${hours}시간이 수업 가능 ${possible}시간을 초과합니다.`);
  }
  for(const [id,hours] of roomHours)if(hours>available)errors.push(`특별실 '${id}': 필요 ${hours}시간이 수업 가능 ${available}시간을 초과합니다.`);
  // A room with long contiguous lessons can be infeasible even if its total
  // hours fit the school week (e.g. 28h of two-period labs in 24h of pairs).
  // Fixed shared activities block an entire room only if *every* class using
  // that room is occupied. This is a safe necessary, not sufficient, test.
  const fixedByClass=new Map();
  for(const d of lessons){
    if(!d.fixedDay||!d.fixedPeriod)continue;
    for(const cid of demandScopes(plan,d)){
      if(!fixedByClass.has(cid))fixedByClass.set(cid,new Set());
      for(let off=0;off<Math.min(Number(d.hours||0),Number(d.block||1));off++)fixedByClass.get(cid).add(keyOf(d.fixedDay,Number(d.fixedPeriod)+off,''));
    }
  }
  const roomDemands=new Map();
  for(const d of lessons)if(d.room){if(!roomDemands.has(d.room))roomDemands.set(d.room,[]);roomDemands.get(d.room).push(d);}
  for(const [room,demands] of roomDemands){
    const members=[...new Set(demands.flatMap(d=>demandScopes(plan,d)))];
    for(const length of new Set(demands.map(d=>Number(d.block||1)).filter(n=>n>=2&&n<=3))){
      const required=demands.filter(d=>Number(d.block||1)===length).reduce((n,d)=>n+Math.floor(Number(d.hours||0)/length),0);
      let maximum=0;
      for(const day of WDAYS){let run=0;
        for(let period=1;period<=Number(config.periods[day]||0);period++){
          const everyClassBusy=members.length>0&&members.every(cid=>fixedByClass.get(cid)?.has(keyOf(day,period,'')));
          if(everyClassBusy){maximum+=Math.floor(run/length);run=0;}else run++;
        }
        maximum+=Math.floor(run/length);
      }
      if(required>maximum)errors.push(`특별실 '${room}': ${length}교시 연속수업 ${required}묶음이 필요하지만 공통활동 등 고정시간을 제외하면 최대 ${maximum}묶음만 편성할 수 있습니다.`);
    }
  }
  return {errors,warnings,capacityByClass:Object.fromEntries(capacityByClass),available};
}
function splitBlocks(d){
  const blocks=[]; let rest=Number(d.hours),idx=0;
  while(rest>0){const length=Math.min(Number(d.block)||1,rest);blocks.push({row:d,index:idx++,length});rest-=length;}
  return blocks;
}
// Each synchronization key is a synchronized placement of separate classes at the
// same weekday/period. A group scope instead represents a single shared lesson.
export function buildTimetableTasks(plan,config) {
  const sync=new Map(),tasks=[],errors=[];
  for(const d of config.lessons||[]){
    const blocks=splitBlocks(d);
    if(d.syncKey?.trim()){
      const key=d.syncKey.trim();if(!sync.has(key))sync.set(key,[]);sync.get(key).push({row:d,blocks});
    }else for(const b of blocks)tasks.push({id:`${d.id}-${b.index}`,length:b.length,blocks:[b],fixedDay:b.index===0?Number(d.fixedDay||0):0,fixedPeriod:b.index===0?Number(d.fixedPeriod||0):0});
  }
  for(const [name,rows] of sync){
    const count=rows[0].blocks.length;
    for(let i=0;i<count;i++){
      const blocks=rows.map(r=>r.blocks[i]);
      const fixed=blocks.filter(b=>b.index===0&&b.row.fixedDay);
      if(new Set(fixed.map(b=>`${b.row.fixedDay}:${b.row.fixedPeriod}`)).size>1)errors.push(`공통시간 '${name}'의 고정 시각이 충돌합니다.`);
      tasks.push({id:`sync-${name}-${i}`,length:blocks[0].length,blocks,fixedDay:Number(fixed[0]?.row.fixedDay||0),fixedPeriod:Number(fixed[0]?.row.fixedPeriod||0)});
    }
  }
  return {tasks,errors};
}
export function checkScheduledSlots(plan,slots,config=timetableConfig(plan)) {
  const errors=[];const teachers=new Set(),rooms=new Set(),classes=new Set(),unavailable=new Set((config.unavailable||[]).map(x=>keyOf(x.teacherId,x.weekday,x.period)));
  for(const s of slots){
    const day=Number(s.weekday),period=Number(s.period);
    if(!WDAYS.includes(day)||!Number.isInteger(period)||period<1||period>12){errors.push(`유효하지 않은 시간표 슬롯: 요일 ${s.weekday}, 교시 ${s.period}`);continue;}
    if(period>Number(config.periods[day]||0))errors.push(`운영 교시 초과: ${WDAY_NAMES[day]} ${period}교시`);
    if(s.scope!=='class'&&s.scope!=='group'){errors.push(`잘못된 시간표 대상: ${s.scope}`);continue;}
    if(!demandScopes(plan,s).length){errors.push(`존재하지 않는 학급·수업 집단: ${s.scopeId}`);continue;}
    if(!(plan.subjects||[]).some(x=>x.id===s.subjectId))errors.push(`등록되지 않은 과목: ${s.subjectId}`);
    if(s.teacherId&&!(plan.teachers||[]).some(x=>x.id===s.teacherId))errors.push(`등록되지 않은 교사: ${s.teacherId}`);
    for(const cid of (s.scope==='group'?demandScopes(plan,s):[s.scopeId])){
      const key=keyOf(cid,s.weekday,s.period);if(classes.has(key))errors.push(`학급 중복: ${cid} ${WDAY_NAMES[s.weekday]} ${s.period}교시`);classes.add(key);
    }
    if(s.teacherId){const key=keyOf(s.teacherId,s.weekday,s.period);if(teachers.has(key))errors.push(`교사 중복: ${s.teacherId} ${WDAY_NAMES[s.weekday]} ${s.period}교시`);teachers.add(key);if(unavailable.has(key))errors.push(`수업 불가 시간: ${s.teacherId} ${WDAY_NAMES[s.weekday]} ${s.period}교시`);}
    if(s.room){const key=keyOf(s.room,s.weekday,s.period);if(rooms.has(key))errors.push(`특별실 중복: ${s.room} ${WDAY_NAMES[s.weekday]} ${s.period}교시`);rooms.add(key);}
  }
  return errors;
}
export function solveTimetable(plan,options={}){
  const config=options.config||timetableConfig(plan);
  const validation=validateTimetableInput(plan,config);
  if(validation.errors.length)return {ok:false,errors:validation.errors,warnings:validation.warnings,slots:[],stats:{nodes:0}};
  const built=buildTimetableTasks(plan,config);
  if(built.errors.length)return {ok:false,errors:built.errors,warnings:validation.warnings,slots:[],stats:{nodes:0}};
  const tasks=built.tasks;
  const timetableCapacity=WDAYS.flatMap(day=>Array.from({length:Number(config.periods[day])},(_,i)=>({day,period:i+1})));
  const unavailable=new Set((config.unavailable||[]).map(x=>keyOf(x.teacherId,x.weekday,x.period)));
  const occClass=new Set(),occTeacher=new Set(),occRoom=new Set();
  const classDay=new Map(), teacherDay=new Map(),subjectDay=new Map(),placed=[];
  const classIDsByTask=new Map(tasks.map(t=>[t.id,t.blocks.flatMap(b=>demandScopes(plan,b.row))]));
  const quality={maxDailyLessons:Number(config.teacherQuality?.maxDailyLessons)||5,maxConsecutiveLessons:Number(config.teacherQuality?.maxConsecutiveLessons)||3};
  const lunchAfter=(()=>{const rows=(config.bell||DEFAULT_BELL);const lunch=rows.find(b=>b.type==='lunch');return rows.filter(b=>b.type==='lesson'&&b.end<=lunch?.start).reduce((n,b)=>Math.max(n,Number(b.period)||0),0)||4;})();
  const maxNodes=options.maxNodes||75000, limitMs=options.limitMs||2200;
  const start=Date.now();let nodes=0,backtracks=0,bestDepth=0,deadlineExceeded=false;
  const addCount=(m,k,delta)=>{const n=(m.get(k)||0)+delta;if(n)m.set(k,n);else m.delete(k);};
  function valid(task,day,startPeriod){
    if(task.fixedDay&&task.fixedDay!==day)return false;
    if(task.fixedPeriod&&task.fixedPeriod!==startPeriod)return false;
    if(startPeriod+task.length-1>Number(config.periods[day]))return false;
    for(let off=0;off<task.length;off++){
      const period=startPeriod+off;const usedClass=new Set(),usedTeacher=new Set(),usedRoom=new Set();
      for(const b of task.blocks){
        for(const cid of demandScopes(plan,b.row)){
          const key=keyOf(cid,day,period);if(occClass.has(key)||usedClass.has(key))return false;usedClass.add(key);
        }
        if(b.row.teacherId){const key=keyOf(b.row.teacherId,day,period);if(occTeacher.has(key)||usedTeacher.has(key)||unavailable.has(key))return false;usedTeacher.add(key);}
        if(b.row.room){const key=keyOf(b.row.room,day,period);if(occRoom.has(key)||usedRoom.has(key))return false;usedRoom.add(key);}
      }
    }
    // Teacher wellbeing limits are hard placement conditions; lunch breaks a streak.
    const affected=new Set(task.blocks.map(b=>b.row.teacherId).filter(Boolean));
    for(const id of affected){
      if((teacherDay.get(keyOf(id,day,''))||0)+task.length>quality.maxDailyLessons)return false;
      let run=0;
      for(let p=1;p<=Number(config.periods[day]);p++){
        if(p===lunchAfter+1)run=0;
        const occupied=occTeacher.has(keyOf(id,day,p))||(p>=startPeriod&&p<startPeriod+task.length);
        run=occupied?run+1:0;
        if(run>quality.maxConsecutiveLessons)return false;
      }
    }
    return true;
  }
  function place(task,day,startPeriod,delta){
    for(let off=0;off<task.length;off++){
      const period=startPeriod+off;
      for(const b of task.blocks){
        for(const cid of demandScopes(plan,b.row)){
          const key=keyOf(cid,day,period);if(delta>0)occClass.add(key);else occClass.delete(key);
          addCount(classDay,keyOf(cid,day,''),delta);
          addCount(subjectDay,keyOf(cid,day,b.row.subjectId),delta);
        }
        if(b.row.teacherId){const key=keyOf(b.row.teacherId,day,period);if(delta>0)occTeacher.add(key);else occTeacher.delete(key);addCount(teacherDay,keyOf(b.row.teacherId,day,''),delta);}
        if(b.row.room){const key=keyOf(b.row.room,day,period);if(delta>0)occRoom.add(key);else occRoom.delete(key);}
      }
    }
  }
  function score(task,day,startPeriod){
    let result=0;
    for(const b of task.blocks){
      for(const cid of demandScopes(plan,b.row)){
        const dayHours=classDay.get(keyOf(cid,day,''))||0;
        const same=subjectDay.get(keyOf(cid,day,b.row.subjectId))||0;
        result+=dayHours*1.4+same*11;
      }
      if(b.row.teacherId)result+=(teacherDay.get(keyOf(b.row.teacherId,day,''))||0)*7;
    }
    return result+Math.abs(startPeriod-3)*.09+(((day*37+startPeriod*11+Number(options.variant||0)*19+task.id.length*7)%13)*.004);
  }
  function choices(task){
    const results=[];
    for(const d of WDAYS)for(let p=1;p<=Number(config.periods[d]);p++)if(valid(task,d,p))results.push({day:d,period:p,score:score(task,d,p)});
    results.sort((a,b)=>a.score-b.score||a.day-b.day||a.period-b.period);
    return results;
  }
  function dfs(remaining){
    if(!remaining.length)return true;
    if(++nodes>maxNodes||Date.now()-start>limitMs){deadlineExceeded=true;return false;}
    let pick=-1,opts=null,priority=-Infinity;
    for(let i=0;i<remaining.length;i++){
      const t=remaining[i], candidates=choices(t);
      if(!candidates.length)return false;
      const tie=(t.fixedDay?100:0)+(t.length>1?20:0)+(t.blocks.length>1?10:0)+(t.blocks.some(b=>b.row.room)?5:0);
      if(!opts||candidates.length<opts.length||(candidates.length===opts.length&&tie>priority)){pick=i;opts=candidates;priority=tie;}
      if(opts.length===1)break;
    }
    const task=remaining[pick],next=[...remaining.slice(0,pick),...remaining.slice(pick+1)];
    for(const opt of opts){
      place(task,opt.day,opt.period,1);placed.push({task,day:opt.day,period:opt.period});
      bestDepth=Math.max(bestDepth,placed.length);
      if(dfs(next))return true;
      placed.pop();place(task,opt.day,opt.period,-1);backtracks++;
      if(deadlineExceeded)return false;
    }
    return false;
  }
  const ok=dfs(tasks);
  if(!ok)return {ok:false,errors:[deadlineExceeded?`탐색 한도에 도달했습니다(${nodes.toLocaleString()}회). 조건을 완화하거나 공통시간·연속수업 수를 줄여 다시 시도해 주세요.`:'모든 필수조건을 만족하는 시간표를 찾지 못했습니다. 고정시간, 공통시간, 교사 불가능 시간, 특별실 예약을 확인해 주세요.'],warnings:validation.warnings,slots:[],stats:{nodes,backtracks,taskCount:tasks.length,bestDepth,durationMs:Date.now()-start}};
  const slots=[];
  for(const place of placed)for(const b of place.task.blocks)for(let offset=0;offset<place.task.length;offset++)slots.push({id:`auto-${b.row.id}-${b.index}-${offset}`,scope:b.row.scope,scopeId:b.row.scopeId,subjectId:b.row.subjectId,teacherId:b.row.teacherId||'',room:b.row.room||'',weekday:place.day,period:place.period+offset,source:'auto'});
  const issues=checkScheduledSlots(plan,slots,config);
  if(issues.length)return {ok:false,errors:issues,warnings:validation.warnings,slots:[],stats:{nodes,backtracks}};
  return {ok:true,errors:[],warnings:validation.warnings,slots,stats:{nodes,backtracks,taskCount:tasks.length,durationMs:Date.now()-start,placedHours:slots.length}};
}

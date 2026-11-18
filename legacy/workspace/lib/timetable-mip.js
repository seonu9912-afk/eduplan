// Deterministic mixed-integer assignment model. All timetable rules are encoded
// as binary decision variables and one-per-task / resource-capacity constraints.
// Build/parsing are pure; the HiGHS WASM runtime is loaded by the isolated API.
import {WDAYS,buildTimetableTasks,checkScheduledSlots,demandScopes,timetableConfig,validateTimetableInput,dayPeriodRange} from './timetable-solver.js';
import {teacherQuality,teachingSegments,teacherHoursPreflight} from './teacher-workload.js';
const slotKey=(type,id,weekday,period)=>`${type}:${id}:${weekday}:${period}`;
export function buildMipProblem(plan,config=timetableConfig(plan),variant=0){
  const validation=validateTimetableInput(plan,config),built=buildTimetableTasks(plan,config);
  const errors=[...validation.errors,...built.errors,...teacherHoursPreflight(plan,config)], warnings=[...validation.warnings];
  if(errors.length)return {errors,warnings};
  const resources=new Map(),byTask=new Map(),candidates=[];
  const teacherDays=new Map(),teacherTotals=new Map(),quality=teacherQuality(config);
  for(const lesson of config.lessons||[])if(lesson.teacherId)teacherTotals.set(lesson.teacherId,(teacherTotals.get(lesson.teacherId)||0)+Number(lesson.hours||0));
  const unavailable=new Set((config.unavailable||[]).map(x=>slotKey('t',x.teacherId,Number(x.weekday),Number(x.period))));
  for(let index=0;index<built.tasks.length;index++){
    const task=built.tasks[index], options=[];
    for(const day of WDAYS){
      const {start,end}=dayPeriodRange(config,day);
      for(let period=start;period+task.length-1<=end;period++){
      if(task.fixedDay&&task.fixedDay!==day||task.fixedPeriod&&task.fixedPeriod!==period)continue;
      const keys=new Set();let valid=true;
      for(let offset=0;offset<task.length&&valid;offset++)for(const block of task.blocks){
        const p=period+offset;
        const items=[...demandScopes(plan,block.row).map(cid=>slotKey('c',cid,day,p))];
        if(block.row.teacherId)items.push(slotKey('t',block.row.teacherId,day,p));
        if(block.row.room)items.push(slotKey('r',block.row.room,day,p));
        for(const key of items){if(keys.has(key)||unavailable.has(key)){valid=false;break;}keys.add(key);}
        if(!valid)break;
      }
      if(!valid)continue;
      const column=candidates.length,variable=`x${column}`;
      candidates.push({column,variable,taskIndex:index,weekday:day,period});options.push(column);
      for(const teacherId of new Set(task.blocks.map(b=>b.row.teacherId).filter(Boolean))){
        const key=`${teacherId}:${day}`;if(!teacherDays.has(key))teacherDays.set(key,[]);teacherDays.get(key).push({column,variable,period,length:task.length});
      }
      for(const key of keys){if(!resources.has(key))resources.set(key,[]);resources.get(key).push(column);}
    }
    }
    if(!options.length)errors.push(`${task.id}에 배정 가능한 교시가 없습니다.`);
    byTask.set(index,options);
  }
  if(errors.length)return {errors,warnings};
  if(candidates.length>35000||built.tasks.length>1500)return {errors:['시간표 문제가 최대 지원 규모를 초과합니다. 범위를 나누어 편성해 주세요.'],warnings};
  const lines=['Minimize'];
  // Teacher workload fairness is part of the optimization, not a post-hoc label.
  // Two continuous deviation variables per teaching day favor an even workload.
  const deviations=[];let aux=0;
  for(const teacherId of teacherTotals.keys())for(const day of WDAYS){
    const key=`${teacherId}:${day}`,daily=teacherDays.get(key)||[];
    if(!daily.length)continue;
    deviations.push({teacherId,day,daily,up:`over${aux}`,down:`under${aux}`,target:teacherTotals.get(teacherId)/WDAYS.length});aux++;
  }
  // Objective: reduce daily workload spread. Tie-breakers generate reproducible alternatives.
  lines.push(' objective: '+[...deviations.flatMap(d=>[`1 ${d.up}`,`1 ${d.down}`]),...candidates.map(c=>`${(((c.column*19+variant*53+7)%193+1)/10000000).toFixed(7)} ${c.variable}`)].join(' + '));
  lines.push('Subject To');
  for(const [index,options] of byTask)lines.push(` task${index}: ${options.map(i=>`x${i}`).join(' + ')} = 1`);
  let row=0;
  for(const variables of resources.values())if(variables.length>1)lines.push(` resource${row++}: ${variables.map(i=>`x${i}`).join(' + ')} <= 1`);
  let qualityConstraints=0;
  for(const [key,assignments] of teacherDays){
    const expression=assignments.map(a=>`${a.length} ${a.variable}`).join(' + ');
    lines.push(` daily${qualityConstraints++}: ${expression} <= ${quality.maxDailyLessons}`);
    const day=Number(key.split(':').at(-1));
    const windowLength=quality.maxConsecutiveLessons+1;
    for(const segment of teachingSegments(config,day))for(let start=0;start+windowLength<=segment.length;start++){
      const windowStart=segment[start], windowEnd=segment[start+windowLength-1];
      const parts=assignments.map(a=>{const overlap=Math.max(0,Math.min(a.period+a.length-1,windowEnd)-Math.max(a.period,windowStart)+1);return overlap?`${overlap} ${a.variable}`:null;}).filter(Boolean);
      if(parts.length)lines.push(` streak${qualityConstraints++}: ${parts.join(' + ')} <= ${quality.maxConsecutiveLessons}`);
    }
  }
  for(const d of deviations){
    lines.push(` fairness${qualityConstraints++}: ${d.daily.map(a=>`${a.length} ${a.variable}`).join(' + ')} - ${d.up} + ${d.down} = ${d.target}`);
  }
  lines.push('Bounds');
  for(const d of deviations){lines.push(` 0 <= ${d.up}`);lines.push(` 0 <= ${d.down}`);}
  lines.push('Binaries');
  for(let i=0;i<candidates.length;i+=30)lines.push(candidates.slice(i,i+30).map(c=>c.variable).join(' '));
  lines.push('End');
  return {lp:lines.join('\n'),candidates,tasks:built.tasks,warnings,errors,resourceConstraints:row,qualityConstraints,quality,teacherCount:teacherTotals.size};
}
export function parseMipSchedule(plan,config,model,solution){
  const columns=solution?.Columns||{};
  const chosen=model.candidates.filter(c=>Number(columns[c.variable]?.Primal||0)>.5);
  if(chosen.length!==model.tasks.length)throw Error(`자동편성이 완료되지 않았습니다. 요청한 수업 묶음 ${model.tasks.length}개 중 ${chosen.length}개만 배치됐습니다.`);
  const perTask=new Set(),slots=[];
  for(const c of chosen){if(perTask.has(c.taskIndex))throw Error('중복 배정된 수업 묶음이 있습니다.');perTask.add(c.taskIndex);
    const task=model.tasks[c.taskIndex];
    for(const block of task.blocks)for(let off=0;off<task.length;off++){
      const row=block.row;
      slots.push({id:`auto-${row.id}-${block.index}-${off}`,scope:row.scope,scopeId:row.scopeId,subjectId:row.subjectId,teacherId:row.teacherId||'',room:row.room||'',weekday:c.weekday,period:c.period+off,source:'auto'});
    }
  }
  const issues=checkScheduledSlots(plan,slots,config);
  if(issues.length)throw Error(`생성된 시간표 검증 실패: ${issues.slice(0,3).join('; ')}`);
  return slots;
}

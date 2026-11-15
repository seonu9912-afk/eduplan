// Resource-based large-school heuristic: bounded min-conflicts with deterministic
// restarts and an explicit post-solve collision check. Browser-safe, no network.
import {WDAYS,demandScopes,buildTimetableTasks,checkScheduledSlots,timetableConfig,validateTimetableInput} from './timetable-solver.js';
const ky=(a,b,c)=>`${a}|${b}|${c}`;
const randomState=seed=>{let x=(Number(seed)||1337)>>>0;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};};
const countPairs=n=>n>1?(n*(n-1))/2:0;
const weightKey=k=>k[0]==='c'?10:7;
function makeProblem(plan,config,variant){
  const input=validateTimetableInput(plan,config),built=buildTimetableTasks(plan,config);
  const errors=[...input.errors,...built.errors];
  if(errors.length)return {errors,warnings:input.warnings};
  const periods=WDAYS.flatMap(day=>Array.from({length:Number(config.periods[day])},(_,n)=>({day,period:n+1})));
  const unavailable=new Set((config.unavailable||[]).map(u=>ky(u.teacherId,u.weekday,u.period)));
  const resourceIds=new Map(),weights=[];
  function rid(key){if(!resourceIds.has(key)){resourceIds.set(key,weights.length);weights.push(weightKey(key));}return resourceIds.get(key);}
  const tasks=built.tasks.map((task,i)=>{
    const choices=[];
    for(const {day,period} of periods){
      if(task.fixedDay&&task.fixedDay!==day || task.fixedPeriod&&task.fixedPeriod!==period)continue;
      if(period+task.length-1>Number(config.periods[day]))continue;
      const keys=[],internal=new Set();let impossible=false;
      for(let offset=0;offset<task.length&&!impossible;offset++)for(const b of task.blocks){
        const p=period+offset;
        const resources=[...demandScopes(plan,b.row).map(cid=>`c:${cid}:${day}:${p}`)];
        if(b.row.teacherId){if(unavailable.has(ky(b.row.teacherId,day,p))){impossible=true;break;}resources.push(`t:${b.row.teacherId}:${day}:${p}`);}
        if(b.row.room)resources.push(`r:${b.row.room}:${day}:${p}`);
        for(const resource of resources){if(internal.has(resource)){impossible=true;break;}internal.add(resource);keys.push(rid(resource));}
      }
      if(!impossible)choices.push({day,period,keys});
    }
    if(!choices.length)errors.push(`${task.id}: 배치할 수 있는 시간대가 없습니다.`);
    return {id:task.id,task,index:i,choices,fixed:choices.length===1};
  });
  return {errors,warnings:input.warnings,tasks,weights,periods};
}
export function optimizeTimetable(plan,options={}){
  const config=options.config||timetableConfig(plan);
  const problem=makeProblem(plan,config,options.variant||0);
  if(problem.errors.length)return {ok:false,errors:problem.errors,warnings:problem.warnings,slots:[],stats:{nodes:0,reason:'invalid-input'}};
  const {tasks,weights}=problem;
  const maxIterations=Math.max(5000,Number(options.maxIterations)||140000);
  const limitMs=Math.max(1000,Number(options.limitMs)||8000);
  const random=randomState(927631+Number(options.variant||0)*9176+tasks.length);
  const positions=new Int16Array(tasks.length).fill(-1);
  const occ=new Int16Array(weights.length);
  let score=0,attempts=0,moves=0,bestScore=Infinity,iterations=0;
  const start=Date.now();
  const impacts=(choice)=>choice.keys.reduce((sum,id)=>sum+occ[id]*weights[id],0);
  function set(i,candidateIndex){const current=positions[i];if(current>=0){const previous=tasks[i].choices[current];for(const id of previous.keys){occ[id]--;score-=occ[id]*weights[id];}}
    positions[i]=candidateIndex;
    if(candidateIndex>=0){const next=tasks[i].choices[candidateIndex];for(const id of next.keys){score+=occ[id]*weights[id];occ[id]++;}}}
  const fixed=tasks.map((task,i)=>i).filter(i=>tasks[i].fixed);
  const flex=tasks.map((task,i)=>i).filter(i=>!tasks[i].fixed);
  const weightsByTask=tasks.map(t=>t.choices[0]?.keys.length||0);
  function initialize(){occ.fill(0);score=0;positions.fill(-1);for(const i of fixed)set(i,0);
    const seq=flex.map(i=>({i,priority:1000/tasks[i].choices.length+weightsByTask[i]/5+random()*4})).sort((a,b)=>b.priority-a.priority);
    for(const {i} of seq){let best=Infinity,choices=[];
      for(let c=0;c<tasks[i].choices.length;c++){const cost=impacts(tasks[i].choices[c]);if(cost<best){best=cost;choices=[c];}else if(cost===best)choices.push(c);}
      const idx=choices[Math.floor(random()*choices.length)];set(i,idx);
    }
  }
  // A move is chosen among current resource clashes, not a full DFS scan of 500+ tasks.
  function degree(i){const choice=tasks[i].choices[positions[i]];let n=0;for(const id of choice.keys)n+=(occ[id]-1)*weights[id];return n;}
  function step(temperature){let pick=-1,bad=-1;
    for(let j=0;j<Math.min(24,flex.length);j++){
      const i=flex[Math.floor(random()*flex.length)],n=degree(i);
      if(n>bad&& (n>0 || random()<.002)){bad=n;pick=i;}
    }
    if(pick<0)return false;
    const current=positions[pick];set(pick,-1);
    let best=Infinity,chosen=current,selectedCost=Infinity,maybes=[];
    const choices=tasks[pick].choices;
    for(let c=0;c<choices.length;c++){
      const cost=impacts(choices[c]);
      if(cost<best){best=cost;maybes=[c];}else if(cost===best)maybes.push(c);
      if(c===current)selectedCost=cost;
    }
    if(maybes.length)chosen=maybes[Math.floor(random()*maybes.length)];
    if(best>=selectedCost&&temperature>0){
      const alternatives=[];
      for(let c=0;c<choices.length;c++)if(c!==current && impacts(choices[c])<=best+temperature)alternatives.push(c);
      if(alternatives.length)chosen=alternatives[Math.floor(random()*alternatives.length)];
    }
    set(pick,chosen);moves++;return true;
  }
  let loops=0;
  while(Date.now()-start<limitMs&&iterations<maxIterations){
    attempts++;initialize();if(score<bestScore)bestScore=score;
    let stalls=0,prior=score;
    for(let local=0;local<45000&&iterations<maxIterations;local++){
      if(Date.now()-start>=limitMs)break;
      iterations++;
      if(score===0)break;
      const temp=local<700?8:local<3000?5:local<14000?3:local<30000?1:0;
      if(!step(temp))break;
      if(score<bestScore)bestScore=score;
      if(score<prior){prior=score;stalls=0;}else stalls++;
      if(stalls>9500)break;
    }
    if(score===0)break;
    loops++;
  }
  if(score!==0)return {ok:false,errors:[`자동편성 탐색 한도 또는 복합 조건에 도달했습니다. 잔여 충돌 점수 ${bestScore}; 상세 제약과 수업 배정량을 확인해 주세요.`],warnings:problem.warnings,slots:[],stats:{reason:'search-limit',attempts,iterations,moves,bestScore,durationMs:Date.now()-start,taskCount:tasks.length}};
  const slots=[];
  for(let i=0;i<tasks.length;i++){const placement=tasks[i].choices[positions[i]];for(const b of tasks[i].task.blocks)for(let offset=0;offset<tasks[i].task.length;offset++)slots.push({id:`auto-${b.row.id}-${b.index}-${offset}`,scope:b.row.scope,scopeId:b.row.scopeId,subjectId:b.row.subjectId,teacherId:b.row.teacherId||'',room:b.row.room||'',weekday:placement.day,period:placement.period+offset,source:'auto'});}
  const collisions=checkScheduledSlots(plan,slots,config);
  if(collisions.length)return {ok:false,errors:collisions,warnings:problem.warnings,slots:[],stats:{reason:'post-validate',attempts,iterations}};
  return {ok:true,errors:[],warnings:problem.warnings,slots,stats:{reason:'optimized',attempts,iterations,moves,bestScore:0,durationMs:Date.now()-start,taskCount:tasks.length,placedHours:slots.length}};
}

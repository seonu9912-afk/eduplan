/** Teacher-first weekly-hour matrix. The original timetableConfig.lessons remains the
 * single source of truth. This module never flattens away room/block/group rules. */
const text=x=>String(x??'').trim();
export const matrixKey=(teacherId,subjectId,classId)=>JSON.stringify([teacherId,subjectId,classId]);
const known=(items,id)=>items.some(x=>x.id===id);
const assignedKey=d=>matrixKey(d.teacherId,d.subjectId,d.scopeId);
export const hasSpecialRules=d=>Boolean(d.scope==='group'||d.room||d.syncKey||d.fixedDay||d.fixedPeriod||Number(d.block||1)>1);

/** Returns every existing teacher/subject pairing, including teachers with no assignments.
 * Subjects for otherwise empty teachers come from their staff record only if unambiguous. */
export function buildTeacherHoursGrid(plan,lessons,staff=[]){
  const subjects=plan.subjects||[],teachers=plan.teachers||[],classes=[...(plan.classes||[])].sort((a,b)=>Number(a.grade)-Number(b.grade)||a.label.localeCompare(b.label,'ko',{numeric:true}));
  const classIds=new Set(classes.map(c=>c.id));
  const cells=new Map(),rowPairs=new Map();
  let hidden=0;
  for(const d of lessons||[]){
    if(d.scope!=='class'||!classIds.has(d.scopeId)||!known(teachers,d.teacherId)||!known(subjects,d.subjectId)){hidden++;continue;}
    const key=assignedKey(d),entry=cells.get(key)||{hours:0,records:[]};
    entry.hours+=Number(d.hours)||0;entry.records.push(d);cells.set(key,entry);
    rowPairs.set(matrixKey(d.teacherId,d.subjectId,''),{teacherId:d.teacherId,subjectId:d.subjectId});
  }
  const suggestSubject=t=>{
    const profile=staff.find(x=>x.id===t.id),hint=text(profile?.subject).replace(/[·\s]/g,'');
    if(!hint)return '';
    const exact=subjects.filter(s=>text(s.label).replace(/[·\s]/g,'')===hint);
    if(exact.length===1)return exact[0].id;
    const partial=subjects.filter(s=>hint.includes(text(s.label).replace(/[·\s]/g,'')));
    return partial.length===1?partial[0].id:'';
  };
  for(const t of teachers){
    if([...rowPairs.values()].some(x=>x.teacherId===t.id))continue;
    const subjectId=suggestSubject(t);if(subjectId)rowPairs.set(matrixKey(t.id,subjectId,''),{teacherId:t.id,subjectId});
  }
  const subjectOrder=new Map(subjects.map((s,i)=>[s.id,i]));const teacherOrder=new Map(teachers.map((t,i)=>[t.id,i]));
  const rows=[...rowPairs.values()].sort((a,b)=>(subjectOrder.get(a.subjectId)??999)-(subjectOrder.get(b.subjectId)??999)||(teacherOrder.get(a.teacherId)??999)-(teacherOrder.get(b.teacherId)??999));
  const cellOf=(row,c)=>cells.get(matrixKey(row.teacherId,row.subjectId,c.id));
  const totalsByClass=Object.fromEntries(classes.map(c=>[c.id,0]));
  const totalsByTeacher=Object.fromEntries(teachers.map(t=>[t.id,0]));
  for(const d of lessons||[]){
    if(d.teacherId&&d.hours)totalsByTeacher[d.teacherId]=(totalsByTeacher[d.teacherId]||0)+Number(d.hours);
    if(d.scope==='class'&&classIds.has(d.scopeId))totalsByClass[d.scopeId]+=Number(d.hours)||0;
    if(d.scope==='group')for(const id of (plan.groups||[]).find(g=>g.id===d.scopeId)?.classIds||[])if(id in totalsByClass)totalsByClass[id]+=Number(d.hours)||0;
  }
  return {classes,rows,cells,cellOf,hidden,totalsByClass,totalsByTeacher};
}

/** Calculate a prospective update atomically. Blank/0 clears simple rows; locked or
 * multi-record cells require the advanced editor to avoid destroying constraints. */
export function applyTeacherHoursEdits(plan,lessons,edits){
  const teachers=plan.teachers||[],subjects=plan.subjects||[],classes=plan.classes||[];
  const issues=[],next=[...(lessons||[])],changes=[];
  for(const [key,raw] of Object.entries(edits||{})){
    let tuple;
    try{tuple=JSON.parse(key);}catch{issues.push('편성 셀의 식별자를 읽지 못했습니다.');continue;}
    if(!Array.isArray(tuple)||tuple.length!==3){issues.push('잘못된 편성 셀이 있습니다.');continue;}
    const [teacherId,subjectId,classId]=tuple;
    if(!known(teachers,teacherId)||!known(subjects,subjectId)||!known(classes,classId)){issues.push('현재 교사·과목·학급 목록에 존재하지 않는 셀이 있습니다.');continue;}
    const value=text(raw),hours=value===''||value==='0'?0:Number(value);
    if(!Number.isInteger(hours)||hours<0||hours>30){issues.push(`${teacherId} / ${classId}: 시수는 공란 또는 0~30의 정수여야 합니다.`);continue;}
    const candidates=next.filter(d=>d.scope==='class'&&d.scopeId===classId&&d.subjectId===subjectId&&d.teacherId===teacherId);
    const current=candidates.reduce((n,x)=>n+Number(x.hours||0),0);
    if(candidates.length>1){if(hours!==current)issues.push(`${classId}의 수업은 연속·특별실 등이 분리되어 있어 상세 배정표에서 수정해야 합니다.`);continue;}
    const candidate=candidates[0];
    if(candidate&&hours===Number(candidate.hours))continue;
    if(candidate&&hours===0&&hasSpecialRules(candidate)){issues.push(`${classId}: 연속·특별실·공통·고정 설정이 있는 수업은 상세 배정에서 삭제해 주세요.`);continue;}
    if(candidate&&hours>0&&hours%Number(candidate.block||1)!==0){issues.push(`${classId}: ${candidate.block}교시 연속수업은 ${candidate.block}의 배수로 입력해야 합니다.`);continue;}
    if(hours===0){if(candidate)next.splice(next.indexOf(candidate),1);}
    else if(candidate)next.splice(next.indexOf(candidate),1,{...candidate,hours});
    else next.push({id:`grid-${teacherId}-${subjectId}-${classId}`,scope:'class',scopeId:classId,subjectId,teacherId,room:'',hours,block:1,syncKey:'',fixedDay:0,fixedPeriod:0});
    changes.push({teacherId,subjectId,classId,before:current,after:hours});
  }
  return issues.length?{ok:false,errors:issues,lessons,changes:[]}:{ok:true,errors:[],lessons:next,changes};
}

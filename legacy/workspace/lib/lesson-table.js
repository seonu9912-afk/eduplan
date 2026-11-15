import {splitSpreadsheetPaste} from './ledger.js';
const clean=value=>String(value??'').trim();
const headings=['ID','대상','과목','교사','주당시수','연속교시','특별실','공통시간','고정요일','고정교시'];
const textCell=value=>clean(value).replaceAll(/\t|\r|\n/g,' ');
export function lessonsToTsv(plan,rows){
  const scope=lesson=>lesson.scope==='group'?(plan.groups||[]).find(x=>x.id===lesson.scopeId)?.label:(plan.classes||[]).find(x=>x.id===lesson.scopeId)?.label;
  const rowsToCopy=rows.map(r=>[r.id,scope(r)||r.scopeId,(plan.subjects||[]).find(x=>x.id===r.subjectId)?.label||r.subjectId,(plan.teachers||[]).find(x=>x.id===r.teacherId)?.label||r.teacherId||'',r.hours,r.block||1,r.room||'',r.syncKey||'',r.fixedDay||'',r.fixedPeriod||'']);
  return [headings,...rowsToCopy].map(row=>row.map(textCell).join('\t')).join('\n');
}
function resolve(items,raw,what,{allowEmpty=false}={}){
  const value=clean(raw);
  if(!value&&allowEmpty)return {value:''};
  const matches=items.filter(x=>x.id===value||x.label===value);
  if(matches.length===1)return {value:matches[0].id};
  return {error:!matches.length?`${what} '${value}'을(를) 찾을 수 없습니다.`:`${what} '${value}'이(가) 중복됩니다. ID를 입력해 주세요.`};
}
export function parseLessonTsv(text,plan,previous=[]){
  const lines=splitSpreadsheetPaste(text),errors=[],parsed=[],seen=new Set();
  if(lines.length>1001)return {rows:[],errors:['한 번에 최대 1,000개의 수업 행까지 가져올 수 있습니다.']};
  if(!lines.length)return {rows:[],errors:['붙여넣을 수업 배정표가 없습니다.']};
  let data=lines;
  if(clean(lines[0][0]).toLowerCase()==='id' && clean(lines[0][1])==='대상')data=lines.slice(1);
  const classes=(plan.classes||[]).map(x=>({...x,scope:'class'})),groups=(plan.groups||[]).map(x=>({...x,scope:'group'}));
  for(const [idx,cells] of data.entries()){
    const line=idx+(data===lines?1:2),v=cells.map(clean);
    if(v.length!==10){errors.push(`${line}행: 10개 열(ID·대상·과목·교사·시수·연속·특별실·공통·요일·교시)을 입력해 주세요.`);continue;}
    let id=v[0]||`lesson-import-${line}-${Math.random().toString(36).slice(2,7)}`;
    if(seen.has(id)){errors.push(`${line}행: ID '${id}'가 중복입니다.`);continue;}
    seen.add(id);
    const target=resolve([...classes,...groups],v[1],'대상');
    const subject=resolve(plan.subjects||[],v[2],'과목');
    const teacher=resolve(plan.teachers||[],v[3],'교사',{allowEmpty:true});
    for(const result of [target,subject,teacher])if(result.error)errors.push(`${line}행: ${result.error}`);
    const match=[...classes,...groups].find(x=>x.id===target.value);
    const hours=Number(v[4]),block=Number(v[5]||1),dayNames={월:1,화:2,수:3,목:4,금:5};
    const day=v[8]?(dayNames[v[8]]??Number(v[8])):0,period=v[9]?Number(v[9]):0;
    if(!Number.isInteger(hours)||hours<1||hours>30)errors.push(`${line}행: 주당시수는 1~30 사이 정수여야 합니다.`);
    if(![1,2,3].includes(block))errors.push(`${line}행: 연속교시는 1~3이어야 합니다.`);
    if(v[6]&&!(plan.rooms||[]).includes(v[6]))errors.push(`${line}행: 특별실 '${v[6]}'이(가) 등록되어 있지 않습니다.`);
    if(![0,1,2,3,4,5].includes(day))errors.push(`${line}행: 고정요일은 월~금 또는 1~5여야 합니다.`);
    if(!Number.isInteger(period)||period<0||period>12)errors.push(`${line}행: 고정교시는 0~12여야 합니다.`);
    if(!!day!==!!period)errors.push(`${line}행: 고정요일과 고정교시는 함께 입력하거나 모두 비워야 합니다.`);
    if((day||period)&&block&&hours%block!==0)errors.push(`${line}행: 주당시수가 연속교시의 배수가 아닙니다.`);
    if(!target.error&&!subject.error&&!teacher.error){parsed.push({id,scope:match?.scope||'class',scopeId:target.value,subjectId:subject.value,teacherId:teacher.value,room:v[6],hours,block,syncKey:v[7],fixedDay:day,fixedPeriod:period});}
  }
  if(!data.length)errors.push('데이터 행이 없습니다.');
  return {rows:errors.length?[]:parsed,errors};
}
export function mergeLessonRows(existing,incoming,mode='update'){
  if(mode==='replace')return incoming;
  const ids=new Set(incoming.map(x=>x.id));
  return [...existing.filter(x=>!ids.has(x.id)),...incoming];
}

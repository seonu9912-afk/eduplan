'use client';
import {useEffect,useMemo,useState} from 'react';
import {Check,ChevronDown,Copy,Download,Info,LockKeyhole,Plus,RotateCcw} from 'lucide-react';
import {applyTeacherHoursEdits,buildTeacherHoursGrid,matrixKey} from '../lib/teacher-hours-grid.js';

const cellText=entry=>entry?String(entry.hours):'';
const numeric=value=>/^\s*(?:[0-9]{1,2})?\s*$/.test(value)&&Number(value||0)<=30;
const gradeOf=c=>Number(c.grade)||Number(String(c.label).match(/\d+/)?.[0])||0;
const subjectName=(subjects,id)=>subjects.find(x=>x.id===id)?.label||id;
const teacherName=(teachers,id)=>teachers.find(x=>x.id===id)?.label||id;
const shortSubject=(subjects,id)=>{const s=subjects.find(x=>x.id===id);return s?.shortLabel||s?.shortName||s?.abbreviation||s?.label||id;};
export default function TeacherHoursGrid({plan,lessons,staff=[],onApply,onDirtyChange,notify}){
  const [edits,setEdits]=useState({});
  const [search,setSearch]=useState('');
  const [grade,setGrade]=useState('all');
  const [openAdd,setOpenAdd]=useState(false);
  const [extraRows,setExtraRows]=useState([]);
  const [addTeacher,setAddTeacher]=useState('');
  const [addSubject,setAddSubject]=useState('');
  const matrix=useMemo(()=>buildTeacherHoursGrid(plan,lessons,staff),[plan,lessons,staff]);
  const dirty=Object.keys(edits).length>0;
  useEffect(()=>onDirtyChange?.(dirty),[dirty,onDirtyChange]);
  useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange]);
  const filteredClasses=matrix.classes.filter(c=>grade==='all'||String(gradeOf(c))===grade);
  const totalRows=[...matrix.rows,...extraRows].filter((x,i,arr)=>arr.findIndex(y=>y.teacherId===x.teacherId&&y.subjectId===x.subjectId)===i);
  const filteredRows=totalRows.filter(r=>`${teacherName(plan.teachers||[],r.teacherId)} ${subjectName(plan.subjects||[],r.subjectId)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const byGrade=[...new Set(filteredClasses.map(gradeOf))];
  const lessonAt=(r,c)=>matrix.cellOf(r,c);
  const keyAt=(r,c)=>matrixKey(r.teacherId,r.subjectId,c.id);
  const displayed=(r,c)=>Object.hasOwn(edits,keyAt(r,c))?edits[keyAt(r,c)]:cellText(lessonAt(r,c));
  const locked=(r,c)=>(lessonAt(r,c)?.records.length||0)>1;
  const setCell=(r,c,value)=>{const key=keyAt(r,c),old=cellText(lessonAt(r,c));setEdits(prev=>{const copy={...prev};if(value===old)delete copy[key];else copy[key]=value;return copy;});};
  const rowTotal=r=>matrix.classes.reduce((n,c)=>{const v=displayed(r,c);return n+(numeric(v)?Number(v||0):0);},0);
  const teacherTotal=tId=>{
    const sumOfGrid=totalRows.filter(r=>r.teacherId===tId).reduce((n,r)=>n+rowTotal(r),0);
    const hidden=lessons.filter(d=>d.teacherId===tId&&(d.scope!=='class'||!matrix.classes.some(c=>c.id===d.scopeId))).reduce((n,d)=>n+Number(d.hours||0),0);
    return sumOfGrid+hidden;
  };
  const colTotal=c=>{const base=Number(matrix.totalsByClass[c.id]||0);const delta=Object.entries(edits).reduce((n,[key,value])=>{let parsed;try{parsed=JSON.parse(key);}catch{return n;}if(parsed[2]!==c.id||!numeric(value))return n;const old=matrix.cells.get(key)?.hours||0;return n+Number(value||0)-old;},0);return base+delta;};
  const invalidKeys=Object.entries(edits).filter(([,v])=>!numeric(String(v))).map(([k])=>k);
  const prospective=useMemo(()=>applyTeacherHoursEdits(plan,lessons,edits),[plan,lessons,edits]);
  const save=()=>{
    if(!dirty)return;
    if(!prospective.ok)return notify(prospective.errors.slice(0,3).join(' / '));
    if(!prospective.changes.length){setEdits({});return;}
    const cleared=prospective.changes.filter(x=>x.after===0).length;
    if((prospective.changes.length>=12||cleared>=3)&&!window.confirm(`${prospective.changes.length}칸 변경${cleared?` (배정 삭제 ${cleared}건)`:''}을 적용할까요? 기본 시간표는 유지되며, 변경한 배정은 다음 자동편성 때 반영됩니다.`))return;
    onApply(prospective.lessons);setEdits({});
    notify(`${prospective.changes.length}개 학급별 수업시수를 반영했어요. 자동편성 전에 편성 조건을 다시 확인해 주세요.`);
  };
  const navigate=(el,step,vertical=false)=>{
    const table=el.closest('table'),inputs=[...table.querySelectorAll('[data-tt-matrix-cell]')].filter(x=>!x.disabled&&!x.readOnly);
    const current=inputs.indexOf(el);
    if(current<0)return;
    let next;
    if(vertical){const row=Number(el.dataset.row)+step,col=Number(el.dataset.col);next=table.querySelector(`[data-row="${row}"][data-col="${col}"]`);if(next?.readOnly)next=null;}
    else next=inputs[current+step];
    if(next){next.focus();next.select();}
  };
  const paste=(e,r,c)=>{
    const data=e.clipboardData.getData('text/plain');
    if(!/[\t\r\n]/.test(data))return;
    e.preventDefault();
    const lines=data.replace(/\r/g,'').replace(/\n$/,'').split('\n').map(line=>line.split('\t'));
    const rows=filteredRows,cols=filteredClasses;
    const r0=rows.findIndex(x=>x.teacherId===r.teacherId&&x.subjectId===r.subjectId),c0=cols.findIndex(x=>x.id===c.id);
    if(r0<0||c0<0)return;
    const next={...edits};let count=0,error='';
    for(let dy=0;dy<lines.length&&!error;dy++)for(let dx=0;dx<lines[dy].length;dx++){
      const rr=rows[r0+dy],cc=cols[c0+dx],value=lines[dy][dx].trim();
      if(!rr||!cc){error='붙여넣을 범위가 현재 표 밖으로 벗어났어요. 학년 필터를 넓혀 보세요.';break;}
      if(!numeric(value)){error=`숫자 또는 공란만 붙여넣을 수 있어요. (${dy+1}행 ${dx+1}열)`;break;}
      const entry=lessonAt(rr,cc),old=cellText(entry);
      if(locked(rr,cc)&&value!==old){error='여러 수업으로 나뉜 셀이 포함되어 있어요. 아래 상세 배정에서 수정해 주세요.';break;}
      if(entry?.records[0]?.block>1&&Number(value||0)%Number(entry.records[0].block)!==0){error='연속수업 배정은 연속 교시 수의 배수로 입력해야 해요.';break;}
      const key=keyAt(rr,cc);
      if(value===old)delete next[key];else next[key]=value;
      count++;
    }
    if(error){notify(error);return;}
    setEdits(next);notify(`${count}개 셀을 입력했어요. 내용을 확인한 뒤 ‘변경 적용’을 눌러 주세요.`);
  };
  const addRow=()=>{
    if(!addTeacher||!addSubject)return notify('추가할 교사와 과목을 선택해 주세요.');
    if(totalRows.some(x=>x.teacherId===addTeacher&&x.subjectId===addSubject))return notify('이미 시수표에 있는 교사·과목 조합입니다.');
    setExtraRows(rows=>[...rows,{teacherId:addTeacher,subjectId:addSubject}]);setOpenAdd(false);setAddTeacher('');setAddSubject('');
  };
  const exportGrid=async()=>{
    const heading=['정식 과목명','단축 과목명','교사명',...matrix.classes.map(c=>c.label),'계'];
    const tsv=[heading,...totalRows.map(r=>[subjectName(plan.subjects||[],r.subjectId),shortSubject(plan.subjects||[],r.subjectId),teacherName(plan.teachers||[],r.teacherId),...matrix.classes.map(c=>displayed(r,c)||''),rowTotal(r)])].map(row=>row.join('\t')).join('\n');
    try{await navigator.clipboard.writeText(tsv);notify('시수표를 복사했어요. 엑셀에 붙여넣을 수 있어요.');}catch{notify('클립보드 권한을 확인해 주세요.');}
  };
  return <div className="tt-hours-matrix-shell">
    <div className="tt-matrix-toolbar"><div className="tt-matrix-controls"><input aria-label="교사와 과목 검색" value={search} onChange={e=>setSearch(e.target.value)} placeholder="교사·과목 검색"/><select aria-label="시수표 학년 필터" value={grade} onChange={e=>setGrade(e.target.value)}><option value="all">전 학년</option>{[...new Set(matrix.classes.map(gradeOf))].map(g=><option key={g} value={g}>{g}학년</option>)}</select><button type="button" className="tt-btn" onClick={()=>setOpenAdd(x=>!x)}><Plus size={15}/> 과목 행 추가</button><button type="button" className="tt-btn" onClick={exportGrid}><Copy size={15}/> 표 복사</button></div><div className="tt-matrix-save"><span role="status">{dirty?`저장 전 ${Object.keys(edits).length}칸 수정`:'모든 변경 적용됨'}</span><button type="button" className="tt-btn" disabled={!dirty} onClick={()=>setEdits({})}><RotateCcw size={14}/> 취소</button><button type="button" className="tt-btn primary" disabled={!dirty||invalidKeys.length>0||!prospective.ok} onClick={save}><Check size={15}/> 변경 적용</button></div></div>
    {openAdd&&<div className="tt-matrix-add"><label>교사<select aria-label="시수표 행 추가 교사" value={addTeacher} onChange={e=>setAddTeacher(e.target.value)}><option value="">선택</option>{(plan.teachers||[]).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label>교과·활동<select aria-label="시수표 행 추가 과목" value={addSubject} onChange={e=>setAddSubject(e.target.value)}><option value="">선택</option>{(plan.subjects||[]).map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label><button type="button" className="tt-btn primary" onClick={addRow}>시수표에 행 추가</button></div>}
    <div className="tt-matrix-scroll" role="region" aria-label="교사별 수업시수표 — 가로 스크롤 가능" tabIndex={0}>
      <table className="tt-hours-matrix"><thead><tr><th className="tt-matrix-sticky subject" rowSpan="2">정식 과목명</th><th className="tt-matrix-sticky short" rowSpan="2">단축 과목명</th><th className="tt-matrix-sticky teacher" rowSpan="2">교사명</th>{byGrade.map(g=><th key={g} colSpan={filteredClasses.filter(c=>gradeOf(c)===g).length} className={`tt-matrix-grade grade-${g}`}>{g}학년</th>)}<th className="tt-matrix-sticky-right" rowSpan="2">계</th></tr><tr>{filteredClasses.map(c=><th key={c.id} className={`tt-matrix-class-head grade-${gradeOf(c)}`}>{String(c.label).match(/(\d+)반/)?.[1]||c.label}</th>)}</tr></thead>
      <tbody>{filteredRows.map((r,i)=><tr key={matrixKey(r.teacherId,r.subjectId,'')}><th scope="row" className="tt-matrix-sticky subject" title={subjectName(plan.subjects||[],r.subjectId)}>{subjectName(plan.subjects||[],r.subjectId)}</th><th scope="row" className="tt-matrix-sticky short">{shortSubject(plan.subjects||[],r.subjectId)}</th><th scope="row" className="tt-matrix-sticky teacher" title={teacherName(plan.teachers||[],r.teacherId)}>{teacherName(plan.teachers||[],r.teacherId)}</th>{filteredClasses.map((c,j)=>{const entry=lessonAt(r,c),value=displayed(r,c),isLocked=locked(r,c),isSpecial=entry?.records.some(x=>x.room||x.block>1||x.syncKey||x.fixedDay||x.fixedPeriod),key=keyAt(r,c);return <td key={c.id} className={`tt-matrix-cell ${Object.hasOwn(edits,key)?'edited':''} ${isLocked?'locked':''}`}><input type="text" inputMode="numeric" pattern="[0-9]*" data-tt-matrix-cell="" tabIndex={isLocked?-1:0} data-row={i} data-col={j} aria-label={`${teacherName(plan.teachers||[],r.teacherId)} ${subjectName(plan.subjects||[],r.subjectId)} ${c.label} 주당 시수`} value={value} readOnly={isLocked} title={isLocked?`${entry.records.length}개 수업으로 나뉘어 있습니다. 상세 배정표에서 편집하세요.`:isSpecial?'연속수업 또는 특별실 조건은 그대로 유지됩니다.':'공란은 배정 없음'} onChange={e=>setCell(r,c,e.target.value)} onPaste={e=>paste(e,r,c)} onKeyDown={e=>{if(e.nativeEvent?.isComposing||e.key==='Process')return;if(e.key==='Enter'){e.preventDefault();navigate(e.currentTarget,e.shiftKey?-1:1,true);}}} className={!numeric(value)?'invalid':''}/>{isLocked?<LockKeyhole size={11} aria-hidden="true"/>:isSpecial?<span className="tt-matrix-special" aria-hidden="true">•</span>:null}</td>;})}<td className="tt-matrix-sticky-right total">{rowTotal(r)}</td></tr>)}
      {filteredRows.length===0&&<tr><td colSpan={filteredClasses.length+4} className="tt-matrix-empty">해당 교사·과목이 없습니다. 검색어를 바꾸거나 ‘과목 행 추가’를 사용하세요.</td></tr>}</tbody><tfoot><tr><th className="tt-matrix-sticky subject">학급 합계</th><th className="tt-matrix-sticky short">전체 수업</th><th className="tt-matrix-sticky teacher">주당 시수</th>{filteredClasses.map(c=><th key={c.id}>{colTotal(c)}</th>)}<th className="tt-matrix-sticky-right">{matrix.classes.reduce((n,c)=>n+colTotal(c),0)}</th></tr></tfoot></table>
    </div>
    <div className="tt-matrix-notes"><span><Info size={14}/> 학급 합계는 검색·학년 필터와 관계없이 전체 수업을 기준으로 표시합니다.</span><span>Enter: 아래 칸 · Shift+Enter: 위 칸 · Tab: 오른쪽 칸 · 여러 칸 붙여넣기 가능</span><span>파란 점: 특별실·연속·고정 조건 있음 / <LockKeyhole size={12}/> 복합 배정: 상세 편집 필요</span></div>
    {(invalidKeys.length>0||!prospective.ok&&dirty)&&<p className="tt-matrix-errors" role="alert">{invalidKeys.length?`숫자 또는 공란만 입력해 주세요. 오류 ${invalidKeys.length}칸.`:prospective.errors.slice(0,3).join(' / ')}</p>}
    {matrix.hidden>0&&<p className="tt-matrix-hidden">활동반 등 특수 수업 {matrix.hidden}행은 아래 ‘상세 배정표’에 유지되어 있습니다. 시수표의 합계에는 포함되지 않을 수 있습니다.</p>}
  </div>;
}

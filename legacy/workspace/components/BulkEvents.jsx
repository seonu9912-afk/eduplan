'use client';
import {useState} from 'react';
import {Plus,Copy,Trash2,Check,ClipboardPaste} from 'lucide-react';
import {EVENT_AREAS,blankEventRow,validateEventRow} from '../lib/calendar';

const makeRow=year=>({...blankEventRow(year),localId:`row-${Math.random().toString(36).slice(2)}`,gradeText:'전체'});
function readGrades(raw){
  if(!raw||raw.trim()==='전체'||raw.trim()==='모두')return [];
  const cells=raw.replaceAll('학년','').split(/[,，\s/]+/).filter(Boolean).map(Number);
  if(!cells.length||cells.some(x=>![1,2,3].includes(x)))return null;
  return [...new Set(cells)];
}
// Dates copied from Excel commonly contain dots, slashes, or Korean suffixes.
function normalizePasteDate(raw){
  const cleaned=String(raw||'').trim().replace(/\s+/g,'').replace(/년|월/g,'-').replace(/일/g,'').replace(/[./]/g,'-').replace(/-+$/,'');
  const match=cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(match)return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  // Excel day serial: epoch 1899-12-30, valid only for modern school dates.
  if(/^\d{5}$/.test(cleaned)){
    const value=Number(cleaned);
    if(value>40000&&value<80000)return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);
  }
  return String(raw||'').trim();
}
const normalizePasteArea=raw=>{
  const val=String(raw||'').trim();
  if(EVENT_AREAS.some(x=>x.value===val))return val;
  if(val.includes('학교자율'))return 'autonomous';
  if(val.includes('자율'))return 'creative_self';
  if(val.includes('스포츠'))return 'sports';
  if(val.includes('동아리'))return 'creative_club';
  if(val.includes('진로'))return 'creative_career';
  if(val.includes('교과'))return 'subject';
  return 'none';
};

export default function BulkEvents({year,subjects,onSave}){
  const [rows,setRows]=useState(()=>Array.from({length:6},()=>makeRow(year)));
  const [errors,setErrors]=useState({});
  const [paste,setPaste]=useState('');
  const [pasteOpen,setPasteOpen]=useState(false);
  const [pasteError,setPasteError]=useState('');
  const gridKeyDown=e=>{
    const active=e.target;if(!active.matches('input,select'))return;
    const td=active.closest('td'),tr=active.closest('tr');if(!td||!tr)return;
    const key=e.key;
    // Up/down moves to the same editable column in another event row, as in a spreadsheet.
    // Left/right preserve text editing; Ctrl+Left/Right navigates between fields.
    if(!['ArrowUp','ArrowDown'].includes(key)&&!(e.ctrlKey&&['ArrowLeft','ArrowRight'].includes(key)))return;
    const rows=Array.from(tr.parentElement.querySelectorAll('tr'));
    const index=rows.indexOf(tr),cells=Array.from(tr.children),column=cells.indexOf(td);
    const ri=Math.min(rows.length-1,Math.max(0,index+({ArrowUp:-1,ArrowDown:1,ArrowLeft:0,ArrowRight:0}[key])));
    const ci=e.ctrlKey&&key==='ArrowLeft'?Math.max(0,column-1):e.ctrlKey&&key==='ArrowRight'?Math.min(cells.length-2,column+1):column;
    const next=rows[ri]?.children[ci]?.querySelector('input,select');
    if(next){e.preventDefault();next.focus();if(next instanceof HTMLInputElement&&next.type==='text')next.select();}
  };
  const update=(i,field,value)=>{setRows(p=>p.map((r,index)=>index===i?{...r,[field]:value}:r));setErrors({});};
  const append=(n=5)=>{setRows(p=>[...p,...Array.from({length:n},()=>makeRow(year))]);};
  const save=()=>{
    const prepared=[];const mistakes={};
    for(let i=0;i<rows.length;i++){
      const row=rows[i];if(!row.name.trim())continue;
      const grades=readGrades(row.gradeText);
      if(grades===null){mistakes[i]='대상 학년은 전체 또는 1,2,3처럼 입력하세요.';continue;}
      const item={...row,grades};delete item.gradeText;delete item.localId;
      const error=validateEventRow(year,item,subjects);
      if(error)mistakes[i]=error;else prepared.push(item);
    }
    if(Object.keys(mistakes).length){setErrors(mistakes);return;}
    if(!prepared.length){setErrors({0:'행사를 한 건 이상 입력하세요.'});return;}
    const result=onSave(prepared);
    if(result!==false){setRows(Array.from({length:6},()=>makeRow(year)));setErrors({});setPaste('');}
  };
  const pasteRows=()=>{
    const parts=paste.trim().split(/\r?\n/).map(x=>x.split('\t')).filter(x=>x.length>=2)
      .filter(x=>!(String(x[0]||'').includes('날짜')&&String(x[1]||'').includes('행사')));
    if(!parts.length){setPasteError('날짜와 행사명이 포함된 두 개 이상의 열을 붙여넣으세요.');return;}
    if(parts.length>120){setPasteError(`붙여넣은 ${parts.length}행은 120행 제한을 초과합니다. 데이터를 나누어 등록해 주세요. 일부 행을 임의로 버리지 않았습니다.`);return;}
    const next=parts.map(x=>({...makeRow(year),date:normalizePasteDate(x[0])||`${year}-03-02`,name:x[1]?.trim()||'',periodStart:Number(x[2])||1,periodEnd:Number(x[3])||6,curriculumArea:normalizePasteArea(x[4]),gradeText:x[5]?.trim()||'전체',department:x[6]?.trim()||'교무부'}));
    setRows(p=>[...p.filter(r=>r.name.trim()),...next]);setPaste('');setPasteError('');setPasteOpen(false);setErrors({});
  };
  return <section className="cal-card cal-bulk-card">
    <div className="cal-bulk-head"><div><h3>학년도 행사 일괄 입력</h3><p>한 해의 행사를 표에 모아서 입력하고 한 번에 등록하세요. 빈 행은 저장되지 않아요. ↑ ↓ 방향키로 행 사이를 이동할 수 있어요.</p></div><div className="cal-bulk-actions"><button type="button" className="cal-action secondary" onClick={()=>setPasteOpen(v=>!v)}><ClipboardPaste size={15}/> 엑셀 붙여넣기</button><button type="button" className="cal-action secondary" onClick={()=>append()}><Plus size={15}/> 5행 추가</button></div></div>
    {pasteOpen&&<div className="cal-paste"><p>엑셀에서 복사한 내용을 붙여넣으세요. 열 순서는 <b>날짜 / 행사명 / 시작교시 / 종료교시 / 교육과정 영역 / 학년 / 담당부서</b>입니다. 날짜는 YYYY-MM-DD 형식으로 입력하세요.</p><textarea value={paste} onChange={e=>setPaste(e.target.value)} rows={4} placeholder={`${year}-03-02\t시업식\t1\t2\t자율·자치\t전체\t교무부`}/><button type="button" className="cal-action main" onClick={pasteRows} disabled={!paste.trim()}>표에 붙여넣기</button>{pasteError&&<p role="alert" className="cal-bulk-error">{pasteError}</p>}</div>}
    <div className="cal-bulk-scroll" onKeyDown={gridKeyDown}><table className="cal-bulk-table"><thead><tr><th>날짜</th><th>행사명</th><th>대상 학년</th><th>시작</th><th>종료</th><th>시수 영역</th><th>봉사</th><th>담당</th><th>복사·삭제</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.localId} className={errors[i]?'has-error':''}>
      <td><input aria-label={`${i+1}행 날짜`} type="date" value={r.date} onChange={e=>update(i,'date',e.target.value)}/></td>
      <td><input aria-label={`${i+1}행 행사명`} value={r.name} onChange={e=>update(i,'name',e.target.value)} placeholder="행사명 입력" maxLength={90}/>{errors[i]&&<small className="cal-bulk-error">{errors[i]}</small>}</td>
      <td><input className="cal-grade-text" aria-label={`${i+1}행 대상 학년`} value={r.gradeText} onChange={e=>update(i,'gradeText',e.target.value)} placeholder="전체 / 1,2"/></td>
      <td><select aria-label={`${i+1}행 시작교시`} value={r.periodStart} onChange={e=>update(i,'periodStart',Number(e.target.value))}>{Array.from({length:12},(_,j)=><option key={j} value={j+1}>{j+1}</option>)}</select></td>
      <td><select aria-label={`${i+1}행 종료교시`} value={r.periodEnd} onChange={e=>update(i,'periodEnd',Number(e.target.value))}>{Array.from({length:12},(_,j)=><option key={j} value={j+1}>{j+1}</option>)}</select></td>
      <td><select aria-label={`${i+1}행 시수 영역`} value={r.curriculumArea} onChange={e=>update(i,'curriculumArea',e.target.value)}>{EVENT_AREAS.map(a=><option value={a.value} key={a.value}>{a.label}</option>)}</select>{r.curriculumArea==='subject'&&<select aria-label={`${i+1}행 교과 선택`} value={r.subjectId} onChange={e=>update(i,'subjectId',e.target.value)}><option value="">과목 선택</option>{subjects.filter(s=>s.kind==='subject').map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>}</td>
      <td><input type="checkbox" aria-label={`${i+1}행 봉사활동 포함`} checked={!!r.volunteer} onChange={e=>update(i,'volunteer',e.target.checked)}/></td>
      <td><input aria-label={`${i+1}행 담당 부서`} value={r.department} onChange={e=>update(i,'department',e.target.value)} maxLength={50}/></td>
      <td><div className="cal-bulk-row-actions"><button title="행 복사" aria-label={`${i+1}행 복사`} onClick={()=>setRows(p=>[...p.slice(0,i+1),{...r,localId:makeRow(year).localId},...p.slice(i+1)])}><Copy size={15}/></button><button title="행 삭제" aria-label={`${i+1}행 삭제`} onClick={()=>setRows(p=>p.length===1?[makeRow(year)]:p.filter((_,idx)=>idx!==i))}><Trash2 size={15}/></button></div></td>
    </tr>)}</tbody></table></div>
    <div className="cal-bulk-footer"><p>영역을 지정하면 해당 날짜·교시에 시간표 변경으로 반영돼요. 봉사활동은 별도 중복 시수로 계산하지 않고 선택한 주 영역의 세부활동으로 기록합니다.</p><button type="button" className="cal-action main" onClick={save}><Check size={16}/> 입력한 행사 한 번에 등록</button></div>
  </section>;
}

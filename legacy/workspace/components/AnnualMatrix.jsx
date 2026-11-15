'use client';
import {useEffect,useRef,useState} from 'react';
import {weekday,plusDays} from '../lib/academic';
import {DAYS,inYear,effectiveDateRule,isInstructionDate,dateEvents} from '../lib/calendar';
import {Check,Keyboard,Info} from 'lucide-react';
import {gridDestination,monthDays} from '../lib/year-grid';

const MONTHS=year=>Array.from({length:12},(_,i)=>({year:year+(i>=10?1:0),month:i<10?i+3:i-9}));
const pad=n=>String(n).padStart(2,'0');
const ym=(y,m)=>`${y}-${pad(m)}`;
export default function AnnualMatrix({year,plan,events,selected,onSelect,onEdit,onSaveMemo}){
  const ref=useRef(null);
  const [memo,setMemo]=useState(plan.annualMemo||'');
  const [memoDirty,setMemoDirty]=useState(false);
  useEffect(()=>{setMemo(plan.annualMemo||'');setMemoDirty(false);},[year,plan.annualMemo]);
  const months=MONTHS(year);
  const navigate=(e,date)=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();onEdit(date);return;}
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key))return;
    e.preventDefault();
    const dest=gridDestination(year,date,e.key);
    if(!dest)return;
    onSelect(dest);
    const node=ref.current?.querySelector(`button[data-date="${dest}"]`);
    node?.focus({preventScroll:true});
    node?.scrollIntoView({block:'nearest',inline:'nearest'});
  };
  return <div className="cal-matrix-outer cal-year-sheet">
    <div className="cal-sheet-title"><div><span className="cal-sheet-eyebrow">YEARLY PLANNING SHEET</span><h3>{year}학년도 연간 학사력</h3><p>3월부터 다음 해 2월까지, 12개월을 하나의 표에서 편성합니다.</p></div><div className="cal-sheet-hints"><Keyboard size={15}/> ↑ ↓ 날짜 · ← → 월 이동 · Enter 편집</div></div>
    <div className="cal-matrix-scroll" ref={ref} role="region" aria-label={`${year}학년도 연간 학사력 (12개월 × 31일)`} tabIndex={0}>
      <table className="cal-matrix"><thead><tr><th scope="col" className="cal-matrix-sticky">일</th>{months.map(({year:y,month:m})=><th scope="col" key={ym(y,m)}>{m}월 <span>{y}</span></th>)}<th scope="col" className="cal-matrix-right">일</th></tr></thead>
        <tbody>{Array.from({length:31},(_,i)=>i+1).map(day=><tr key={day}><th scope="row" className="cal-matrix-sticky">{day}</th>{months.map(({year:y,month:m})=>{
          const date=`${ym(y,m)}-${pad(day)}`;
          if(day>monthDays(y,m))return <td key={date} className="cal-matrix-empty" aria-label={`${m}월 ${day}일 없음`}/>;
          const w=weekday(date),rule=effectiveDateRule(plan,date),isClass=isInstructionDate(plan,date),notes=plan.dayNotes?.[date]||{};
          const entries=dateEvents(events,date);
          const text=entries[0]?.name||notes.schedule||rule?.label||'';
          const secondary=entries.length>1?`+${entries.length-1}`:(!entries.length&&notes.activities)?'활동':'';
          const tags=[w===0?'sun':w===6?'sat':'',rule?.kind||'',entries.length?'event':'',selected===date?'active':''].filter(Boolean).join(' ');
          return <td key={date} className={tags}>
            <button className="cal-matrix-cell" type="button" data-date={date} aria-current={selected===date?'date':undefined} aria-label={`${y}년 ${m}월 ${day}일 ${DAYS[w]}요일. ${text||'등록된 일정 없음'}. Enter를 누르면 편집`} title={`${date} ${DAYS[w]}요일${rule?.label?' · '+rule.label:''}${entries.length?' · '+entries.map(v=>v.name).join(', '):''}${notes.schedule?' · '+notes.schedule:''}`} onClick={()=>onEdit(date)} onKeyDown={e=>navigate(e,date)}>
              <span className="cal-matrix-weekday">{DAYS[w]}</span><span className="cal-matrix-content">{text?<b>{text}</b>:<i>·</i>}{secondary&&<small>{secondary}</small>}</span>
            </button>
          </td>;
        })}<th scope="row" className="cal-matrix-right">{day}</th></tr>)}</tbody>
      </table>
    </div>
    <div className="cal-matrix-legend"><span><i className="work"/> 수업일</span><span><i className="holiday"/> 공휴일</span><span><i className="vacation"/> 방학</span><span><i className="closed"/> 재량휴업일</span><span><i className="event"/> 학교 행사</span></div>
    <div className="cal-sheet-memo"><label htmlFor="cal-year-memo">연간 편성 메모</label><textarea id="cal-year-memo" value={memo} onChange={e=>{setMemo(e.target.value);setMemoDirty(true);}} rows={3} maxLength={3000} placeholder="편성 근거, 수업일수 조정 논의, 운영 참고사항 등을 기록하세요."/><div><small>메모는 이 학년도 편성안에 저장됩니다.</small><button type="button" disabled={!memoDirty} onClick={()=>{onSaveMemo(memo);setMemoDirty(false);}}><Check size={14}/> 메모 저장</button></div></div>
    <p className="cal-sheet-foot"><Info size={14}/> 표에는 주요 일정만 간략히 표시합니다. 날짜를 선택하면 행사·교시·수업일 설정을 자세히 확인할 수 있어요.</p>
  </div>;
}

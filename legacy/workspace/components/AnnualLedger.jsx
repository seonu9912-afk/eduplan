'use client';
import {useMemo,useState,useRef} from 'react';
import {ledgerDates,ledgerRecord,ledgerMove,LEDGER_COLUMNS} from '../lib/ledger';
import {tallyCalendar} from '../lib/calendar';

export default function AnnualLedger({year,plan,events,selected,onSelect,onEditField}){
  const dates=useMemo(()=>ledgerDates(year),[year]);
  const [activeCol,setActiveCol]=useState(0);
  const tableRef=useRef(null);
  const tally=useMemo(()=>tallyCalendar(plan,events),[plan,events]);
  const rows=useMemo(()=>dates.map(d=>ledgerRecord(plan,events,d)),[dates,plan,events]);
  const focusCell=(date,col)=>{
    const cell=tableRef.current?.querySelector(`button[data-date="${date}"][data-col="${col}"]`);
    cell?.focus({preventScroll:true});
    cell?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  };
  const handleKey=(e,date,col)=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(date);onEditField?.(col);return;}
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key))return;
    e.preventDefault();const next=ledgerMove(dates,date,col,e.key);
    setActiveCol(next.col);onSelect(next.date);focusCell(next.date,next.col);
  };
  const jumpToMonth=event=>{
    const month=event.target.value;
    const row=rows.find(r=>r.month===month);
    if(row){onSelect(row.date);setActiveCol(0);focusCell(row.date,0);}
  };
  const dataColumns=r=>[r.date.slice(5).replace('-','.'),r.weekday,r.kind,r.schedule,r.activities,r.memo];
  return <section className="cal-ledger-outer" aria-label={`${year}학년도 날짜별 학사일정 편성표`}>
    <div className="cal-ledger-tools"><div><strong>학년도 전체 편성표</strong><small>원본 엑셀처럼 날짜순으로 이어지는 한 장의 표 · 총 {dates.length}일</small></div><div className="cal-ledger-tools-actions"><label>월 바로가기 <select aria-label="월로 이동" value={selected.slice(0,7)} onChange={jumpToMonth}>{Array.from({length:12},(_,i)=>({year:year+(i>=10?1:0),month:i<10?i+3:i-9})).map(({year:y,month:m})=><option key={`${y}-${m}`} value={`${y}-${String(m).padStart(2,'0')}`}>{y}년 {m}월</option>)}</select></label></div></div>
    <div className="cal-ledger-scroll" ref={tableRef} role="region" tabIndex={0} aria-label="학사일정 표, 화살표로 셀 이동">
      <table className="cal-ledger-table"><thead><tr><th className="month-cell">월</th>{LEDGER_COLUMNS.map((c,i)=><th key={c} className={i===0?'date-cell':''}>{c}</th>)}</tr></thead><tbody>
      {rows.map((r,i)=>{
        const firstOfMonth=i===0||r.month!==rows[i-1].month;
        const cols=dataColumns(r);
        return <tr key={r.date} data-ledger-month={r.month} className={`${firstOfMonth?'month-start':''} ${r.date===selected?'selected':''} ${r.kind==='방학'?'vacation':r.kind==='공휴일'?'holiday':r.kind==='주말'?'weekend':r.kind==='재량휴업일'?'closed':''}`}>
          <th className="month-cell" scope="row">{firstOfMonth?<span>{Number(r.date.slice(5,7))}월<small>{tally.monthCounts[r.month]?.total||0}일 수업</small></span>:null}</th>
          {cols.map((content,col)=><td key={col} className={`col-${col}`}><button type="button" data-date={r.date} data-col={col} onClick={()=>{setActiveCol(col);onSelect(r.date);}} onDoubleClick={()=>onEditField?.(col)} onFocus={()=>{setActiveCol(col);if(selected!==r.date)onSelect(r.date);}} onKeyDown={e=>handleKey(e,r.date,col)} tabIndex={selected===r.date&&activeCol===col?0:-1} aria-label={`${r.date}, ${LEDGER_COLUMNS[col]}, ${String(content||'내용 없음').slice(0,65)}`} aria-current={selected===r.date&&col===0?'date':undefined} title={String(content||'선택해 편집').slice(0,220)}>{content||<span className="muted-cell">—</span>}</button></td>)}
        </tr>;
      })}
      </tbody></table>
    </div>
    <div className="cal-ledger-foot"><span>↑ ↓ 이전·다음 날짜</span><span>← → 열 이동</span><span>Enter 편집</span><span>PageUp / PageDown 30일 이동</span><span>총 수업일수 <b>{tally.total}일</b></span></div>
  </section>;
}

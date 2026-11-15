'use client';
import {useMemo,useRef} from 'react';
import {CalendarDays,ArrowDown,Info} from 'lucide-react';
import {monthGrid,tallyCalendar,dateEvents,effectiveDateRule,isInstructionDate,DAYS} from '../lib/calendar';
import {weekday,plusDays,academicStart,academicEnd} from '../lib/academic';

const pad=n=>String(n).padStart(2,'0');
const monthsForYear=year=>Array.from({length:12},(_,i)=>({year:year+(i>=10?1:0),month:i<10?i+3:i-9}));

export default function AnnualBoard({year,plan,events,selected,onSelect}){
  const root=useRef(null);
  const summary=useMemo(()=>tallyCalendar(plan,events),[plan,events]);
  const months=useMemo(()=>monthsForYear(year),[year]);
  const changeSelection=(e,date)=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter'].includes(e.key))return;
    if(e.key==='Enter'){onSelect(date);return;}
    e.preventDefault();
    const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];
    const next=e.key==='Home'?`${date.slice(0,7)}-01`:e.key==='End'?`${date.slice(0,7)}-${pad(new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),0)).getUTCDate())}`:plusDays(date,delta);
    if(next<academicStart(year)||next>academicEnd(year))return;
    onSelect(next);
    // A keyboard move can cross month cards; keep the selection in view.
    requestAnimationFrame(()=>{
      const cell=root.current?.querySelector(`button[data-date="${next}"]`);
      cell?.focus({preventScroll:true});cell?.scrollIntoView({block:'nearest',inline:'nearest'});
    });
  };
  return <div className="cal-board" ref={root}>
    <div className="cal-board-intro"><div><span>YEAR AT A GLANCE</span><h3>{year}학년도 전체 운영 지도</h3><p>12개월을 한 화면에서 훑어보고, 날짜를 선택해 오른쪽 편집창에서 바로 수정하세요.</p></div><div className="cal-board-legend"><span><i className="instruction"/> 수업</span><span><i className="holiday"/> 공휴일</span><span><i className="vacation"/> 방학</span><span><i className="event"/> 행사</span></div></div>
    <div className="cal-month-grid">
    {months.map(({year:y,month:m},idx)=>{
      const ym=`${y}-${pad(m)}`,grid=monthGrid(y,m);
      const monthEvents=events.filter(e=>e.date.slice(0,7)===ym).sort((a,b)=>a.date.localeCompare(b.date));
      const first=monthEvents.slice(0,2);
      const count=summary.monthCounts[ym]?.total||0;
      return <section className="cal-month-card" key={ym} aria-label={`${y}년 ${m}월 학사일정`}>
        <header><div><b>{m}<small>월</small></b><span>{idx>=10?`${y}년`:idx===0?`${y}학년도`:''}</span></div><strong className="cal-month-count">수업 <em>{count}일</em></strong></header>
        <div className="cal-month-weekdays">{DAYS.map((name,i)=><span className={i===0?'sunday':i===6?'saturday':''} key={name}>{name}</span>)}</div>
        <div className="cal-month-days">{grid.cells.map((date,i)=>{
          if(!date)return <span key={`blank-${i}`} className="cal-day-blank"/>;
          const eventsHere=dateEvents(events,date),kind=effectiveDateRule(plan,date)?.kind||'',workday=isInstructionDate(plan,date),dow=weekday(date),cls=[kind,workday?'workday':'',selected===date?'selected':'',dow===0?'sunday':'',dow===6?'saturday':''].filter(Boolean).join(' ');
          const names=eventsHere.map(e=>e.name).slice(0,2).join(', ');
          return <button type="button" key={date} data-date={date} className={cls} title={`${date} ${kind||'기본'}${names?' · '+names:''}`} aria-label={`${y}년 ${m}월 ${Number(date.slice(8))}일${names?' · '+names:''}`} aria-pressed={selected===date} onClick={()=>onSelect(date)} onKeyDown={e=>changeSelection(e,date)}>{Number(date.slice(8))}{eventsHere.length>0&&<i className="cal-day-event"/>}</button>;
        })}</div>
        <footer>{monthEvents.length?<>{first.map(e=><button type="button" onClick={()=>onSelect(e.date)} key={e.id}><span>{Number(e.date.slice(8))}일</span>{e.name}</button>)}{monthEvents.length>2&&<small>외 {monthEvents.length-2}건의 행사</small>}</>:<p>등록된 학사행사가 없습니다.</p>}</footer>
      </section>;
    })}
    </div>
    <div className="cal-board-footnote"><Info size={15}/> 연간 보드는 편성 현황을 훑어보는 기본 화면입니다. 상세 일정은 날짜를 선택해 수정하고, 전체 내용을 길게 대조할 때만 '날짜별 표' 보기를 이용하세요. <span>키보드 ↑ ↓ ← → 로 날짜 이동</span></div>
  </div>;
}

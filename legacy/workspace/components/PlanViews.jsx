'use client';
import {useMemo,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Download,Printer,Link2,Clock3} from 'lucide-react';
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const asDate=s=>new Date(`${s}T12:00:00`);
const startMonday=d=>{const a=new Date(d);a.setDate(a.getDate()-((a.getDay()+6)%7));return a;};
const fmt=s=>s?.slice(5).replace('-','.')||'';
const shiftDay=(date,days)=>{const d=asDate(date);d.setDate(d.getDate()+days);return ymd(d);};
const downloadCsv=(headers,rows,filename)=>{
  const safe=v=>{let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s))s=`'${s}`;return `"${s.replaceAll('"','""')}"`;};
  const blob=new Blob(['\ufeff'+[headers,...rows].map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
export default function PlanViews({events,tasks,mode,setMode,goEvent,goTask}){
  const [anchor,setAnchor]=useState(()=>ymd(new Date()));
  const weekStart=ymd(startMonday(asDate(anchor)));
  const month=anchor.slice(0,7);
  const days=useMemo(()=>Array.from({length:7},(_,i)=>shiftDay(weekStart,i)),[weekStart]);
  const visible=useMemo(()=>{
    const pred=d=>mode==='week'?d>=weekStart&&d<=days[6]:d.startsWith(month);
    return [...events.filter(e=>pred(e.date)).map(e=>({id:e.id,date:e.date,name:e.name,type:'행사',department:e.department,event:e})),...tasks.filter(t=>pred(t.due)).map(t=>({id:t.id,date:t.due,name:t.title,type:'업무',department:t.department,task:t}))].sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
  },[events,tasks,mode,weekStart,month,days]);
  const shift=direction=>{
    if(mode==='week')setAnchor(shiftDay(anchor,direction*7));
    else {const d=asDate(`${month}-01`);d.setMonth(d.getMonth()+direction);setAnchor(ymd(d));}
  };
  const exportPlan=()=>downloadCsv(['날짜','구분','일정·업무명','담당 부서','상태'],visible.map(x=>[x.date,x.type,x.name,x.department,x.task?.status||'']),`EduPlan_${mode==='week'?'주간':'월중'}계획_${month}.csv`);
  return <div className="planner-layout"><div className="planner-toolbar"><div className="planner-tabs"><button className={mode==='list'?'selected':''} onClick={()=>setMode('list')}>업무 목록</button><button className={mode==='week'?'selected':''} onClick={()=>setMode('week')}>주간 계획</button><button className={mode==='month'?'selected':''} onClick={()=>setMode('month')}>월중 계획</button></div>{mode!=='list'&&<div className="planner-tools"><button aria-label="이전 기간" onClick={()=>shift(-1)}><ChevronLeft size={17}/></button><strong>{mode==='week'?`${fmt(weekStart)} ~ ${fmt(days[6])}`:`${month.replace('-','년 ')}월`}</strong><button aria-label="다음 기간" onClick={()=>shift(1)}><ChevronRight size={17}/></button><button className="planner-today" onClick={()=>setAnchor(ymd(new Date()))}>이번 기간</button><button title="CSV 내려받기" onClick={exportPlan}><Download size={17}/></button><button title="계획 인쇄" onClick={()=>window.print()}><Printer size={17}/></button></div>}</div>
    {mode==='week'&&<div className="planner-print-area print-scope"><div className="planner-print-title"><h2>주간 업무계획</h2><small>{weekStart} ~ {days[6]}</small></div><div className="planner-week-grid">{days.map((d,i)=><div key={d} className="planner-week-day"><div className="planner-week-label"><strong>{['월','화','수','목','금','토','일'][i]}요일</strong><span>{fmt(d)}</span></div><div className="planner-week-items">{visible.filter(x=>x.date===d).map(x=><button key={`${x.type}-${x.id}`} className={`planner-plan-chip ${x.type==='업무'?'task':''}`} onClick={()=>x.event?goEvent(x.event):goTask(x.task)}><span>{x.type}</span><strong>{x.name}</strong><small>{x.department}</small></button>)}{!visible.some(x=>x.date===d)&&<span className="planner-week-empty">등록된 일정 없음</span>}</div></div>)}</div></div>}
    {mode==='month'&&<div className="planner-print-area print-scope"><div className="planner-print-title"><h2>{month.replace('-','년 ')}월 월중 업무계획</h2><small>학교 업무 종합 일정표</small></div>{visible.length?<table className="planner-month-table"><thead><tr><th>일자</th><th>구분</th><th>업무 및 행사</th><th>담당</th><th>진행</th></tr></thead><tbody>{visible.map(x=><tr key={`${x.type}-${x.id}`}><td>{fmt(x.date)}</td><td>{x.type}</td><td><button onClick={()=>x.event?goEvent(x.event):goTask(x.task)}>{x.name}</button></td><td>{x.department}</td><td>{x.task?.status||'—'}</td></tr>)}</tbody></table>:<div className="planner-no-data">이 달에 등록된 행사와 마감 업무가 없습니다.</div>}</div>}
    {mode!=='list'&&<p className="planner-note"><Link2 size={16}/> 학사일정의 행사일과 업무의 마감일을 함께 표시합니다. 인쇄하거나 CSV로 내보낼 수 있습니다.</p>}
  </div>;
}

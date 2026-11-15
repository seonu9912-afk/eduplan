'use client';
import {useMemo,useState} from 'react';
import {AlertTriangle,ArrowRight,BookOpen,CalendarDays,CheckCircle2,ClipboardList,Download,Info,RefreshCcw,Table2} from 'lucide-react';
import {auditWorkspace} from '../lib/integrated-audit.js';
const labels={curriculum:'교육과정',calendar:'학사일정',timetable:'시간표',plans:'월중·주간계획'};
const icons={curriculum:BookOpen,calendar:CalendarDays,timetable:Table2,plans:ClipboardList};
const kinds={error:'수정 필요',warning:'확인 필요',info:'안내'};
export default function IntegratedAudit({space,onNavigate,onCalendarDate,notify}){
  const years=useMemo(()=>[...new Set([...Object.keys(space.academics||{}).map(Number),Number(space.exampleMeta?.year)||new Date().getFullYear()])].filter(Number.isInteger).sort((a,b)=>b-a),[space.academics,space.exampleMeta]);
  const [chosen,setChosen]=useState(years[0]);
  const [filter,setFilter]=useState('all');
  const year=years.includes(chosen)?chosen:years[0];
  const audit=useMemo(()=>auditWorkspace(space,year),[space,year]);
  const sorted=[...audit.issues].sort((a,b)=>({error:0,warning:1,info:2}[a.level]-{error:0,warning:1,info:2}[b.level]));
  const shown=sorted.filter(x=>filter==='all'||x.level===filter);
  const navigate=(issue)=>issue.date&&issue.route==='calendar'?onCalendarDate(issue.date):onNavigate(issue.route);
  const exportReport=()=>{
    const lines=[`EduPlan ${year}학년도 통합 점검`,`수정 필요 ${audit.summary.errors} · 확인 필요 ${audit.summary.warnings} · 안내 ${audit.summary.info}`,...sorted.map(x=>`[${labels[x.area]} / ${kinds[x.level]}] ${x.title}\n${x.detail}`)];
    const url=URL.createObjectURL(new Blob([lines.join('\n\n')],{type:'text/plain;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`EduPlan_${year}_통합점검.txt`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('통합 점검 결과를 내려받았습니다.');
  };
  return <div className="ia-page">
    <div className="ia-toolbar"><div><h1>{year}학년도 편성 현황</h1><p>교육과정·학사일정·시간표·업무계획을 한곳에서 검토합니다. 수정은 해당 메뉴에서 진행해요.</p></div><div className="ia-actions"><select value={year} onChange={e=>setChosen(Number(e.target.value))} aria-label="점검 학년도">{years.map(y=><option key={y} value={y}>{y}학년도</option>)}</select><button className="btn outline" onClick={exportReport}><Download size={16}/> 결과 저장</button></div></div>
    <div className="ia-summary"><div className="ia-count"><span>수정 필요</span><strong className="ia-danger">{audit.summary.errors}</strong></div><div className="ia-count"><span>확인 필요</span><strong className="ia-warn">{audit.summary.warnings}</strong></div><div className="ia-count"><span>안내</span><strong>{audit.summary.info}</strong></div></div>
    <div className="ia-cards">{Object.entries(labels).map(([key,label])=>{const Icon=icons[key],section=audit.sections[key]||{},count=audit.issues.filter(x=>x.area===key&&x.level!=='info').length;return <button key={key} className="ia-card" onClick={()=>onNavigate(key)}><div className="ia-card-top"><span className="ia-icon"><Icon size={18}/></span><span className={count?'ia-badge warn':'ia-badge'}>{count?`${count}건 확인`:'중요 경고 없음'}</span></div><strong>{label}</strong><small>{key==='curriculum'?`${section.grades?.filter(g=>g.ready).length||0}/3개 학년 편성 자료 확인`:key==='calendar'?`${section.days??'—'}일 · 목표 ${section.target??'—'}일`:key==='timetable'?`${section.placed??'—'}/${section.requested??'—'}교시 배치`: `${section.entries||0}건 일정 · ${section.stale||0}건 재확인`}</small><ArrowRight size={17}/></button>})}</div>
    <section className="ia-panel"><div className="ia-section-head"><div><h2>점검 목록</h2><p>문제를 선택하면 실제 수정할 메뉴로 이동합니다. 이 진단은 법령 적합성이나 모든 실제 수업 운영을 인증하지 않아요.</p></div><div className="ia-filters" role="group" aria-label="점검 목록 필터">{[['all','전체'],['error','수정 필요'],['warning','확인 필요'],['info','안내']].map(([key,label])=><button key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{label}</button>)}</div></div>
      <div className="ia-list">{shown.map((issue,i)=><button key={`${issue.area}-${issue.level}-${i}`} className={`ia-issue ${issue.level}`} onClick={()=>navigate(issue)}><span className="ia-issue-icon">{issue.level==='error'?<AlertTriangle size={18}/>:issue.level==='warning'?<Info size={18}/>:<CheckCircle2 size={18}/>}</span><span className="ia-issue-copy"><span className="ia-issue-category">{labels[issue.area]} · {kinds[issue.level]}</span><strong>{issue.title}</strong>{issue.detail&&<small>{issue.detail}</small>}</span><ArrowRight size={17}/></button>)}{shown.length===0&&<div className="ia-clear"><CheckCircle2 size={20}/> 선택한 유형의 점검 항목이 없습니다.</div>}</div>
    </section>
  </div>;
}

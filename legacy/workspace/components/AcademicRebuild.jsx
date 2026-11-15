'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {academicStart,rangeDates,weekday} from '../lib/academic.js';
import {DAYS,inYear,monthGrid} from '../lib/calendar.js';
import {activeOn,capacity,change,commit,dateEnd,dateGrid,evaluate,holidayChanges,kinds,labels,need,periodPreview,project,readItem,status,tabs} from '../lib/academic-rebuild.js';
import {downloadCalendar} from '../lib/academic-rebuild-export.js';
import '../app/academic-rebuild.css';

const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const yearOf=d=>Number(d.slice(0,4))-Number(Number(d.slice(5,7))<=2);
const monthOf=d=>d.slice(0,7);
const defaultRule=date=>({date,kind:[0,6].includes(weekday(date))?'weekend':'instruction',label:'',weekdayOverride:0});
const scopeName=x=>x.label||x.name;
const getStored=key=>JSON.parse(localStorage.getItem(key)||'null');
const warning=w=>[w.type,w.date,w.grade&&w.grade+'학년',w.classLabel,w.period&&w.period+'교시',w.text].filter(Boolean).join(' · ');

export default function AcademicRebuild(props) {
  const [open,setOpen]=useState(false);
  return open?<Preview {...props} close={()=>setOpen(false)}/>:<><div className="ar-entry"><button className="btn outline" onClick={()=>setOpen(true)}>학사일정 개편 미리보기</button></div>{props.children}</>;
}

function Preview({workspaceId,space,focusDate,close}) {
  const focus=typeof focusDate==='string'?focusDate:focusDate?.date;
  const initial=focus?yearOf(focus):Number(space.exampleMeta?.year)||yearOf(today());
  const [year,setYear]=useState(initial),[date,setDate]=useState(focus||academicStart(initial)),[tab,setTab]=useState(0);
  const [storage,setStorage]=useState({}),[years,setYears]=useState([]),[edition,setEdition]=useState(null);
  const [mode,setMode]=useState('edit'),[result,setResult]=useState(null),[grade,setGrade]=useState(null),[busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const prefix='eduplan:academic-rebuild-preview:'+encodeURIComponent(workspaceId);
  const key=prefix+':'+year;
  const base=useMemo(()=>project(space,year),[space,year]);
  const model=storage.key===key&&storage.data?storage.data:base;
  const report=useMemo(()=>evaluate(model),[model]);
  const canEdit=mode==='edit'&&Boolean(workspaceId&&storage.key===key&&storage.ready&&globalThis.navigator?.locks);
  const dirty=edition?.dirty;
  useEffect(()=>{
    const refresh=()=>{
      try {setStorage({key,data:getStored(key),ready:true});setYears(getStored(prefix+':years')||[]);}
      catch {setStorage({key,data:null,ready:false});}
    };
    const handle=e=>{if(e.key===key||e.key===prefix+':years')refresh();};
    refresh();window.addEventListener('storage',handle);
    return ()=>window.removeEventListener('storage',handle);
  },[key,prefix]);
  useEffect(()=>{
    const handler=e=>{if(dirty){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',handler);
    return ()=>window.removeEventListener('beforeunload',handler);
  },[dirty]);

  async function save(changes,options={},destination=key,source=base) {
    if(!canEdit||busyRef.current)return false;
    busyRef.current=true;setBusy(true);
    try {
      return await navigator.locks.request(destination,()=>{
        const saved=commit(getStored(destination)||source,changes,{actor:'미리보기 편집자',canEdit:true,...options});
        if(saved.ok){
          localStorage.setItem(destination,JSON.stringify(saved.model));
          setStorage(current=>current.key===destination?{key:destination,data:saved.model,ready:true}:current);
        }
        setResult(saved.ok?{message:'미리보기 편성안에 저장했습니다.'}:saved);
        return saved.ok;
      });
    } catch(e) {setResult({message:e.message||'저장에 실패했습니다.'});return false;}
    finally {busyRef.current=false;setBusy(false);}
  }

  function navigate(action) {
    if(busyRef.current)return;
    if(edition?.dirty){setEdition({...edition,next:action});return;}
    setEdition(null);action();
  }

  function chooseYear(y) {
    const preserved=String(y+(Number(date.slice(5,7))<3?1:0))+date.slice(4);
    setYear(y);setDate(inYear(y,preserved)?preserved:academicStart(y));
  }

  async function importHolidays(y=year,baseline=model) {
    try {
      const response=await fetch('/api/holidays?year='+y);
      const answer=await response.json();
      if(!response.ok||!answer.ok)throw Error(answer.error||'공식 공휴일 조회 실패');
      await save(holidayChanges(baseline,answer.holidays),{operation:'공휴일 반영'},prefix+':'+y,project(space,y));
    } catch(error) {setResult({message:error.message});}
  }

  function addYear() {
    const raw=window.prompt('추가할 학년도',String(Math.max(...allYears)+1));
    if(raw===null)return;
    const value=Number(raw);
    if(!Number.isInteger(value)||value<2000||value>2100){setResult({message:'2000~2100 사이의 학년도를 입력하세요.'});return;}
    try {
      const list=[...new Set([...(getStored(prefix+':years')||[]),value])];
      localStorage.setItem(prefix+':years',JSON.stringify(list));
      setYears(list);chooseYear(value);
      if(!allYears.includes(value))void importHolidays(value,project(space,value));
    }catch(error){setResult({message:error.message});}
  }

  function selectDay(d) {
    navigate(()=>{
      setDate(d);
      if(canEdit){
        const k='day:'+d,v=readItem(model,k);
        setEdition({type:'day',request:change(model,k,{...v,rule:v.rule||defaultRule(d)}),dirty:false});
      }
    });
  }
  function selectEvent(e) {
    navigate(()=>{
      if(e&&!e.rebuild){setResult({message:'기존 행사 기록은 기존 학사일정 화면에서 수정할 수 있습니다.'});return;}
      const v=e||{id:crypto.randomUUID(),date,endDate:date,name:'',memo:'',grades:[],rebuild:{grades:{},classes:{},classIds:[]}};
      setEdition({type:'event',request:change(model,'event:'+v.id,structuredClone(v)),dirty:false,existing:Boolean(e)});
    });
  }
  function edit(value){setEdition(e=>({...e,dirty:true,request:{...e.request,value}}));}
  async function saveEdition({discard=false,remove=false}={}) {
    const view=edition;
    if(!view)return;
    if(discard){setEdition(null);view.next?.();return;}
    if(view.type==='range'){
      if(!view.checked||!view.changes?.length)return;
      if(await save(view.changes,{operation:'기간 설정'})){setEdition(null);view.next?.();}
      return;
    }
    const request={...view.request};
    if(view.type==='event'&&!remove&&request.value.name.trim()&&inYear(year,request.value.date)&&inYear(year,dateEnd(request.value))){
      const revised={...model,events:[...model.events.filter(e=>e.id!==request.value.id),request.value]};
      const overlaps=evaluate(revised).warnings.filter(w=>w.ids?.includes(request.value.id));
      if(overlaps.length&&!window.confirm(overlaps.slice(0,5).map(warning).join('\n')+'\n겹치는 행사를 확인한 뒤 저장할까요?'))return;
    }
    if(remove)request.value=view.type==='day'?{rule:null,hours:{}}:null;
    if(await save([request],{operation:remove?'삭제':'수정'})){
      if(view.type==='day'&&!view.next&&!remove){
        setEdition({...view,dirty:false,request:{...request,version:request.version+Number(JSON.stringify(readItem(model,request.key))!==JSON.stringify(request.value))}});
      }else setEdition(null);
      view.next?.();
    }
  }

  const allYears=[...new Set([year,...years,...Object.keys(space.academics||{}).map(Number),initial])].sort((a,b)=>a-b);
  const {months,rows}=useMemo(()=>dateGrid(year),[year]);
  const [calYear,calMonth]=date.split('-').map(Number);
  const cal=monthGrid(calYear,calMonth);
  const monthEvents=model.events.filter(e=>e.date<=monthOf(date)+'-'+String(cal.days).padStart(2,'0')&&dateEnd(e)>=monthOf(date)+'-01').sort((a,b)=>a.date.localeCompare(b.date));
  const currentGrade=report.grades.find(g=>g.grade===grade)||report.grades[0];
  const finalChanges=model.snapshot?model.history.slice(model.snapshot.historyCount):[];
  const goMonth=n=>navigate(()=>{
    const i=months.findIndex(x=>x.y===calYear&&x.m===calMonth);
    const next=months[i+n];if(next)setDate(next.y+'-'+String(next.m).padStart(2,'0')+'-01');
  });

  return <section className="ar">
    <header className="ar-line"><div><h2>학사일정</h2><p>{status(model)}{model.snapshot&&' · '+model.snapshot.at.slice(0,10)}</p></div><div className="ar-tools">
      <label>학년도 <select value={year} onChange={e=>{const y=Number(e.target.value);navigate(()=>chooseYear(y));}}>{allYears.map(y=><option key={y} value={y}>{y}학년도</option>)}</select></label>
      {canEdit&&<button onClick={()=>navigate(addYear)}>학년도 추가</button>}
      <label>미리보기 모드 <select value={mode} onChange={e=>{const v=e.target.value;navigate(()=>setMode(v));}}><option value="edit">편집</option><option value="read">조회</option></select></label>
      <button onClick={()=>navigate(close)}>기존 학사일정</button>
    </div></header>
    <p className="ar-callout">미리보기에서 저장한 내용은 이 브라우저의 별도 편성안에 반영됩니다.</p>
    <nav className="ar-tabs" aria-label="학사일정 개편 메뉴">{tabs.map((label,i)=><button key={i} aria-current={tab===i?'page':undefined} onClick={()=>navigate(()=>setTab(i))}>{label}</button>)}</nav>
    {result&&<p role="status" className="ar-callout">{result.message}</p>}
    {result?.conflicts?.length>0&&<details open><summary>저장 충돌</summary>{result.conflicts.map(c=><pre key={c.key}>{c.key}{'\n'+JSON.stringify({저장된값:c.saved,새값:c.incoming},null,2)}</pre>)}</details>}
    {tab===0&&<>
      <div className="ar-line"><small>{report.warnings.some(w=>w.type==='수업일수 기준 미달')?'수업일수 기준 미달':''}</small><div className="ar-tools">
        {canEdit&&<><button disabled={busy} onClick={()=>void importHolidays()}>공휴일 불러오기</button><button onClick={()=>navigate(()=>setEdition({type:'range',base:model,start:date,end:date,kind:'vacation',label:'여름방학',override:[]}))}>기간 설정</button></>}
        <button onClick={()=>navigate(()=>setTab(1))}>선택 날짜의 행사 편성</button></div></div>
      <details className="ar-panel"><summary>수업일수 확인</summary><p>1학기 {report.days[1]??'미확정'} · 2학기 {report.days[2]??'미확정'} · 연간 {report.days.annual}일</p>{report.boundary&&<p>2학기 시작일 {report.boundary}</p>}</details>
      {edition?.type==='range'&&<RangeEditor edition={edition} setEdition={setEdition} model={model} report={report} save={()=>saveEdition()} cancel={()=>navigate(()=>{})}/>}
      <div className="ar-scroll"><table className="ar-annual" aria-label="3월부터 2월까지 연간 학사력"><thead><tr><th scope="col">일</th>{months.map(({m})=><th key={m} scope="col">{m}월</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}><th scope="row">{i+1}</th>{row.map((d,j)=>{
        if(!d)return <td key={j}/>;
        const rule=readItem(model,'day:'+d).rule||defaultRule(d);
        return <td key={d}><button aria-label={d+' '+(kinds[rule.kind]||rule.kind)} aria-pressed={d===date} className={'ar-day-'+rule.kind} onClick={()=>selectDay(d)}>{DAYS[weekday(d)]}{rule.kind!=='instruction'&&rule.kind!=='weekend'&&<small>{kinds[rule.kind]||rule.kind}</small>}{rule.weekdayOverride>0&&<small>→{DAYS[rule.weekdayOverride]}</small>}</button></td>;
      })}</tr>)}</tbody></table></div>
      {edition?.type==='day'&&<DayEditor edition={edition} grades={report.grades} edit={edit} close={()=>navigate(()=>{})} save={saveEdition} busy={busy}/>}
    </>}
    {tab===1&&<><div className="ar-tools"><button onClick={()=>navigate(()=>setTab(0))}>선택 날짜의 연간 학사력</button></div>
      <div className="ar-duo"><div className="ar-panel"><div className="ar-line"><button onClick={()=>goMonth(-1)} aria-label="이전 월">‹</button><h3>{calYear}년 {calMonth}월</h3><button onClick={()=>goMonth(1)} aria-label="다음 월">›</button></div><div className="ar-month">{DAYS.map(d=><b key={d}>{d}</b>)}{cal.cells.map((d,i)=>d?<button key={d} aria-pressed={d===date} onClick={()=>navigate(()=>setDate(d))}>{Number(d.slice(-2))}{monthEvents.some(x=>activeOn(x,d))&&<sup> ●</sup>}</button>:<span key={i}/>)}</div></div>
      <div className="ar-panel"><div className="ar-line"><h3>{calMonth}월 전체 행사</h3>{canEdit&&<button className="ar-primary" onClick={()=>selectEvent(null)}>행사 추가</button>}</div>{monthEvents.length?monthEvents.map(e=><details className={activeOn(e,date)?'ar-focus':''} key={e.id}><summary>{e.name} <small>{e.date}{dateEnd(e)!==e.date?' ~ '+dateEnd(e):''}</small></summary><p>{e.memo||e.department}</p><p>{e.grades?.length?e.grades.map(g=>g+'학년').join(' · '):'전 학년'}</p>{canEdit&&<button onClick={()=>selectEvent(e)}>행사 편집</button>}</details>):<p>등록된 행사가 없습니다.</p>}</div></div>
      {edition?.type==='event'&&<EventEditor key={edition.request.key} model={model} grades={report.grades} value={edition.request.value} edit={edit} existing={edition.existing} close={()=>navigate(()=>{})} save={saveEdition} busy={busy}/>}
    </>}
    {tab===2&&<><nav className="ar-tabs" aria-label="학년 선택">{report.grades.map(g=><button key={g.grade} aria-pressed={g.grade===currentGrade.grade} onClick={()=>setGrade(g.grade)}>{g.grade}학년</button>)}</nav><Hours grade={currentGrade}/></>}
    {tab===3&&<section className="ar-panel"><div className="ar-line"><h3>편성 점검</h3>{canEdit&&<button className="ar-primary" disabled={busy} onClick={()=>{if(window.confirm('현재 편성안과 기준정보를 확정본으로 저장할까요?'))void save([],{confirmation:true});}}>현재 편성안 확정</button>}</div>
      {report.grades.map(g=><p key={g.grade}>{g.grade}학년 · {g.classes.some(c=>c.sums.annual.conflicts)?'편성 검토 필요':g.classes.some(c=>c.sums.annual.missing)||!g.targets.annual?'운영 교시 수 및 목표 시수 설정 확인':g.classes.some(c=>need(c.sums.annual,g.targets.annual)<0)?'교과 총시수 부족':'교과 총시수 확보'}</p>)}
      {report.warnings.length>0&&<details><summary>확인 필요 {report.warnings.length}건</summary><ul>{report.warnings.map((w,i)=><li key={i}>{warning(w)}</li>)}</ul></details>}
      {model.snapshot&&<details><summary>확정 이후 변경 {finalChanges.length}건</summary>{finalChanges.map((h,i)=><p key={i}>{h.key} · {h.operation} · {h.at.slice(0,10)}</p>)}</details>}
      {model.history.length>0&&<details><summary>수정 이력</summary>{model.history.slice().reverse().map((h,i)=><details key={i}><summary>{h.key} · {h.operation} · {h.actor} · {h.at.slice(0,19).replace('T',' ')}</summary><pre>{JSON.stringify({이전:h.before,이후:h.after},null,2)}</pre>{canEdit&&h.key!=='holidays'&&<button disabled={busy} onClick={()=>{if(window.confirm('이 변경 전의 값으로 복원할까요?'))void save([change(model,h.key,h.before)],{operation:'복원'});}}>이전 값 복원</button>}</details>)}</details>}
    </section>}
    {tab===4&&<Export model={model} grades={report.grades}/>}
    {edition?.next&&<div className="ar-backdrop"><section className="ar-panel" role="alertdialog" aria-label="저장하지 않은 변경"><h3>저장하지 않은 변경이 있습니다.</h3><div className="ar-tools"><button className="ar-primary" onClick={()=>saveEdition()}>저장 후 이동</button><button onClick={()=>saveEdition({discard:true})}>변경 취소 후 이동</button><button onClick={()=>setEdition({...edition,next:null})}>이동 취소</button></div></section></div>}
  </section>;
}

function DayEditor({edition,grades,edit,close,save,busy}) {
  const v=edition.request.value, rule=v.rule;
  const patch=x=>edit({...v,rule:{...rule,...x}});
  return <aside className="ar-popup ar-panel" role="dialog" aria-label="날짜 편집">
    <div className="ar-line"><h3>{rule.date} 편집</h3><button onClick={close} aria-label="닫기">×</button></div>
    <label>날짜 유형<select value={rule.kind} onChange={e=>patch({kind:e.target.value,weekdayOverride:e.target.value==='instruction'?rule.weekdayOverride:0,source:'manual'})}>{Object.entries({...kinds,[rule.kind]:kinds[rule.kind]||rule.kind}).map(([k,l])=><option value={k} key={k}>{l}</option>)}</select></label>
    <label>표시 이름<input value={rule.label||''} onChange={e=>patch({label:e.target.value,source:'manual'})}/></label>
    <details><summary>고급 설정</summary><label>요일교체<select value={rule.weekdayOverride||0} disabled={rule.kind!=='instruction'} onChange={e=>patch({weekdayOverride:Number(e.target.value),source:'manual'})}><option value="0">없음</option>{DAYS.slice(1).map((x,i)=><option value={i+1} key={x}>{x}요일</option>)}</select></label>
    {grades.map(({grade:g})=><label key={g}>{g}학년 운영 교시<input type="number" min="0" max="12" value={v.hours[g]??''} placeholder="시간표 기본값" onChange={e=>{const hours={...v.hours};if(e.target.value==='')delete hours[g];else hours[g]=Number(e.target.value);edit({...v,hours});}}/></label>)}</details>
    <div className="ar-tools"><button disabled={busy} onClick={()=>save({remove:true})}>개별 설정 해제</button><button className="ar-primary" disabled={busy} onClick={()=>save()}>저장</button></div>
  </aside>;
}

function RangeEditor({edition:e,setEdition,model,report,save,cancel}) {
  const baseline=e.base;
  const rows=periodPreview(baseline,e.start,e.end,e.kind,e.label,e.override);
  const choices=rows.filter(r=>!r.blocked).map(r=>change(baseline,'day:'+r.date,{...readItem(baseline,'day:'+r.date),rule:r.after}));
  const patch=x=>setEdition({...e,...x,dirty:true,checked:false,changes:null});
  function check(override=e.override) {
    const selected=periodPreview(baseline,e.start,e.end,e.kind,e.label,override).filter(r=>!r.blocked);
    setEdition({...e,override,checked:true,changes:selected.map(r=>change(baseline,'day:'+r.date,{...readItem(baseline,'day:'+r.date),rule:r.after})),dirty:true});
  }
  const selected=new Set(choices.map(c=>c.value.rule.date));
  const projected=e.checked&&evaluate({...model,plan:{...model.plan,dayRules:[...model.plan.dayRules.filter(r=>!selected.has(r.date)),...choices.map(x=>x.value.rule)]}});
  return <section className="ar-panel"><div className="ar-line"><h3>기간 설정</h3><button onClick={cancel}>닫기</button></div><div className="ar-fields"><label>시작일<input type="date" value={e.start} onChange={x=>patch({start:x.target.value})}/></label><label>종료일<input type="date" value={e.end} onChange={x=>patch({end:x.target.value})}/></label><label>날짜 유형<select value={e.kind} onChange={x=>patch({kind:x.target.value})}>{Object.entries(kinds).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label><label>표시 이름<input value={e.label} onChange={x=>patch({label:x.target.value})}/></label></div>
    <button onClick={()=>check()}>변경 미리보기</button>{projected&&<><p>{rows.length}일 중 {choices.length}일 적용 · 수업일수 {report.days.annual} → {projected.days.annual}</p><p>{projected.grades.map((g,i)=>g.grade+'학년 교과 '+report.grades[i].classes[0].sums.annual.subject+' → '+g.classes[0].sums.annual.subject).join(' · ')}</p><div className="ar-range-rows">{rows.map(r=><div key={r.date} className="ar-line"><span>{r.date} · {kinds[r.before.kind]} → {kinds[r.after.kind]}</span>{(r.blocked||e.override.includes(r.date))&&<label><input type="checkbox" checked={e.override.includes(r.date)} onChange={x=>check(x.target.checked?[...e.override,r.date]:e.override.filter(d=>d!==r.date))}/> 기존 설정 변경</label>}</div>)}</div></>}
    <button className="ar-primary" disabled={!e.checked||!choices.length} onClick={save}>기간 설정 적용</button>
  </section>;
}

function EventEditor({value:e,model,grades,edit,existing,close,save,busy}) {
  const slots=e.rebuild;
  const allowed=e.grades.length?e.grades:grades.map(g=>g.grade);
  const options=model.plan.classes.filter(c=>allowed.includes(Number(c.grade)));
  const [scope,setScope]=useState('g'+allowed[0]),[selection,select]=useState([]),[undo,setUndo]=useState(null);
  const dragging=useRef(false);
  const cls=options.find(c=>'c'+c.id===scope);
  const g=cls?Number(cls.grade):allowed.includes(Number(scope.slice(1)))?Number(scope.slice(1)):allowed[0];
  const dates=inYear(model.year,e.date)&&inYear(model.year,dateEnd(e))?rangeDates(e.date,dateEnd(e)):[];
  const changeValue=x=>edit({...e,...x});
  useEffect(()=>{
    const stop=()=>{dragging.current=false;};
    window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);
    return ()=>{window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);};
  },[]);
  const toggle=id=>select(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]);
  function assign(area) {
    const next=structuredClone(slots), scope=cls?(next.classes[cls.id]??={}):(next.grades[g]??={});
    for(const id of selection){
      const [d,p]=id.split('/');
      (scope[d]??={...(cls?next.grades[g]?.[d]:{})})[p]=area;
    }
    setUndo(slots);changeValue({rebuild:next});select([]);
  }
  return <section className="ar-panel ar-event"><div className="ar-line"><h3>{existing?'행사 편집':'행사 등록'}</h3><button onClick={close}>닫기</button></div>
    <div className="ar-fields"><label>행사명<input value={e.name} onChange={x=>changeValue({name:x.target.value})}/></label><label>시작일<input type="date" value={e.date} onChange={x=>{select([]);changeValue({date:x.target.value,endDate:e.endDate===e.date?x.target.value:e.endDate});}}/></label><label>종료일<input type="date" value={dateEnd(e)} onChange={x=>{select([]);changeValue({endDate:x.target.value});}}/></label></div>
    <div className="ar-tools"><button aria-pressed={!e.grades.length} onClick={()=>{select([]);changeValue({grades:[]});}}>전 학년</button>{grades.map(({grade})=><button key={grade} aria-pressed={e.grades.includes(grade)} onClick={()=>{select([]);changeValue({grades:e.grades.includes(grade)?e.grades.filter(g=>g!==grade):[...e.grades,grade]});}}>{grade}학년</button>)}</div>
    <details><summary>교시·대상 학급·비고 설정</summary><label>비고<textarea value={e.memo||''} onChange={x=>changeValue({memo:x.target.value})}/></label>
      {options.length>0&&<fieldset><legend>특정 학급 대상 지정</legend><div className="ar-tools">{options.map(c=><label key={c.id}><input type="checkbox" checked={slots.classIds.includes(c.id)} onChange={x=>{select([]);changeValue({rebuild:{...slots,classIds:x.target.checked?[...slots.classIds,c.id]:slots.classIds.filter(id=>id!==c.id)}});}}/>{scopeName(c)}</label>)}</div></fieldset>}
      <div className="ar-line"><label>편성 범위 <select value={cls?'c'+cls.id:'g'+g} onChange={x=>{setScope(x.target.value);select([]);}}>{allowed.map(n=><option key={n} value={'g'+n}>{n}학년 공통</option>)}{options.map(c=><option key={c.id} value={'c'+c.id}>{scopeName(c)} 예외</option>)}</select></label>
      <div className="ar-tools">{Object.entries(labels).filter(([area])=>area!=='creative_volunteer').map(([a,label])=><button key={a} disabled={!selection.length} onClick={()=>assign(a)}>{label}</button>)}{undo&&<button onClick={()=>{changeValue({rebuild:undo});setUndo(null);}}>직전 배정 취소</button>}</div></div>
      <div className="ar-scroll"><table className="ar-hours"><thead><tr><th>날짜</th>{Array.from({length:12},(_,i)=><th key={i}>{i+1}교시</th>)}</tr></thead><tbody>{dates.map(d=>{
        const max=capacity(model,d,g), map=cls?(slots.classes[cls.id]?.[d]??slots.grades[g]?.[d]??{}):(slots.grades[g]?.[d]||{});
        return <tr key={d}><th>{d}</th>{Array.from({length:12},(_,i)=>{
          const id=d+'/'+(i+1), a=map[i+1]||'subject', active=max==null||i<max;
          return <td key={id}>{active||Object.hasOwn(map,i+1)?<button aria-pressed={selection.includes(id)} className={active?'':'ar-outside'} aria-label={d+' '+(i+1)+'교시 '+labels[a]} onPointerDown={()=>{dragging.current=true;toggle(id);}} onPointerEnter={()=>{if(dragging.current)select(s=>s.includes(id)?s:[...s,id]);}} onClick={x=>{if(x.detail===0)toggle(id);}}>{labels[a]}</button>:'—'}</td>;
        })}</tr>;
      })}</tbody></table></div></details>
    <div className="ar-tools">{existing&&<button disabled={busy} onClick={()=>{if(window.confirm('이 행사를 삭제할까요?'))save({remove:true});}}>삭제</button>}<button className="ar-primary" disabled={busy} onClick={()=>save()}>행사 저장</button></div>
  </section>;
}

function Hours({grade}) {
  const terms=[[1,'1학기'],[2,'2학기'],['annual','연간']];
  const unique=new Set(grade.classes.map(c=>JSON.stringify(c.sums)));
  return <div className="ar-scroll"><table className="ar-hours"><thead><tr>{['학급','학기','운영 교시','자율·자치','동아리','진로','봉사','창체 합계','교과 확보','교과 필요','차이'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{(unique.size===1?[{...grade.classes[0],label:'학년 공통'}]:grade.classes).flatMap(c=>terms.map(([k,label])=>{
    const r=c.sums[k],t=grade.targets[k];
    if(!r)return <tr key={c.id+label}><th>{scopeName(c)}</th><td>{label}</td><td colSpan={9}>미확정</td></tr>;
    return <tr key={c.id+label}><th>{scopeName(c)}</th><td>{label}</td><td>{r.capacity}</td>{Object.entries(r.byArea).map(([a,n])=><td key={a}>{n}{t?' / '+t[a]:''}</td>)}<td>{r.creative}</td><td>{r.subject}</td><td>{t?.subject??'미설정'}</td><td>{need(r,t)??(r.conflicts?'검토 필요':'—')}</td></tr>;
  }))}</tbody></table></div>;
}

function Export({model,grades}) {
  const [paper,setPaper]=useState('A3'),[useFinal,setFinal]=useState(false),[grade,setGrade]=useState(0),[term,setTerm]=useState(0);
  return <section className="ar-panel"><div className="ar-fields">
    <label>출력 자료<select value={String(useFinal&&Boolean(model.snapshot))} onChange={e=>setFinal(e.target.value==='true')}><option value="false">현재 편성안</option>{model.snapshot&&<option value="true">마지막 확정본</option>}</select></label>
    <label>인쇄 용지<select value={paper} onChange={e=>setPaper(e.target.value)}><option value="A3">A3 가로 1페이지</option><option value="A4">A4 가로 2페이지</option></select></label>
    <label>행사 학년<select value={grade} onChange={e=>setGrade(Number(e.target.value))}><option value="0">전체</option>{grades.map(g=><option key={g.grade} value={g.grade}>{g.grade}학년</option>)}</select></label>
    <label>행사 학기<select value={term} onChange={e=>setTerm(Number(e.target.value))}><option value="0">전체</option><option value="1">1학기</option><option value="2">2학기</option></select></label>
    </div><button className="ar-primary" onClick={()=>downloadCalendar(model,{paper,useFinal,grade,term})}>Excel 내려받기</button></section>;
}

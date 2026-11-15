'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Plus,Check,PenLine,Trash2,Info,RotateCcw,Keyboard} from 'lucide-react';
import {EVENT_AREAS,monthGrid,dateEvents,effectiveDateRule,isInstructionDate,validateEventRow,inYear} from '../lib/calendar';
import EventImpactPreview from './EventImpactPreview';
import {QUICK_GRADES,gradesToChoice,choiceToGrades,academicMonthDate,monthIndexOf,moveAcademicMonth,moveCalendarDate,initialQuickEvent,changeQuickDate,quickEnterAction} from '../lib/quick-event';

const periods=Array.from({length:12},(_,i)=>i+1);
const eventTitle=e=>[e.name,(e.grades||[]).length?`${e.grades.join('·')}학년`:'전체',e.affectsTimetable?`${e.periodStart}~${e.periodEnd}교시`:''].filter(Boolean).join(' · ');
const dateLabel=date=>`${Number(date.slice(5,7))}월 ${Number(date.slice(8))}일`;

export default function MonthlyEventPlanner({year,plan,events,subjects,selected,onSelect,onSave,onRemove,onEditEvent,onOpenDateEditor}){
  const [index,setIndex]=useState(()=>Math.max(0,monthIndexOf(year,selected)));
  const [draft,setDraft]=useState(()=>initialQuickEvent(year,selected));
  const [gradeChoice,setGradeChoice]=useState('all');
  const [error,setError]=useState('');
  const [saveCount,setSaveCount]=useState(0);
  const nameRef=useRef(null);
  const formRef=useRef(null);
  const current=academicMonthDate(year,index);
  const {cells}=monthGrid(current.year,current.month);
  const selectedEvents=useMemo(()=>dateEvents(events,selected).slice().sort((a,b)=>Number(a.periodStart||0)-Number(b.periodStart||0)||a.name.localeCompare(b.name)),[events,selected]);
  useEffect(()=>{
    const target=monthIndexOf(year,selected);
    if(target>=0)setIndex(target);
    setDraft(old=>changeQuickDate(old,selected));
    setGradeChoice('all');setError('');
  },[year]);

  const focusName=()=>requestAnimationFrame(()=>nameRef.current?.focus());
  const pickDate=(date,focus=true)=>{
    if(!date||!inYear(year,date))return;
    onSelect(date);
    setIndex(Math.max(0,monthIndexOf(year,date)));
    setDraft(old=>changeQuickDate(old,date));
    setError('');
    if(focus)focusName();
  };
  const changeMonth=delta=>{
    const moved=moveAcademicMonth(year,selected,delta);
    if(moved)pickDate(moved,false);
  };
  const editEvent=e=>{
    if(e.endDate&&e.endDate!==e.date){onEditEvent(e);return;}
    onSelect(e.date);
    setDraft({...initialQuickEvent(year,e.date),...e,endDate:''});
    setGradeChoice(gradesToChoice(e.grades));
    setError('');focusName();
  };
  const newEvent=()=>{setDraft(old=>changeQuickDate(old,selected));setError('');focusName();};
  const submit=e=>{
    e.preventDefault();
    const item={...draft,grades:choiceToGrades(gradeChoice),date:draft.date||selected,endDate:''};
    if(Number(item.periodStart)>Number(item.periodEnd)){setError('종료 교시는 시작 교시보다 빠를 수 없습니다.');return;}
    const issue=validateEventRow(year,item,subjects);
    if(issue){setError(issue);return;}
    const success=onSave(item);
    if(success===false)return;
    setDraft(old=>({...changeQuickDate(old,item.date),curriculumArea:item.curriculumArea,subjectId:item.subjectId,periodStart:item.periodStart,periodEnd:item.periodEnd,department:item.department,volunteer:item.volunteer}));
    setError('');setSaveCount(c=>c+1);focusName();
  };
  const keyDay=(e,date)=>{
    const shifts={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
    if(!(e.key in shifts))return;
    const next=moveCalendarDate(year,date,shifts[e.key]);
    if(!next)return;
    e.preventDefault();pickDate(next,false);
    requestAnimationFrame(()=>document.querySelector(`[data-quick-day="${next}"]`)?.focus());
  };
  const update=(key,value)=>{setDraft(old=>({...old,[key]:value}));if(error)setError('');};
  const handleFormKey=e=>{
    // Korean IME uses Enter to confirm composition; never move the cursor in that case.
    if(e.key!=='Enter'||e.isComposing||e.nativeEvent?.isComposing||e.nativeEvent?.keyCode===229)return;
    const form=formRef.current;
    if(!form)return;
    if(e.altKey)return;
    const fields=Array.from(form.querySelectorAll('[data-quick-entry-field]'))
      .filter(field=>!field.disabled&&!field.hidden);
    const action=quickEnterAction(fields.indexOf(e.target),fields.length,e);
    if(action.type==='ignore'||(action.type==='focus'&&e.target.closest('button')))return;
    e.preventDefault();
    if(action.type==='save'){form.requestSubmit();return;}
    fields[action.index]?.focus();
  };
  return <section className="cal-quick-planner" aria-label="월별 학사일정 및 행사 빠른 편성">
    <div className="cal-quick-layout">
      <div className="cal-quick-left">
        <div className="cal-quick-toolbar">
          <div className="cal-quick-month-nav"><button type="button" className="cal-quick-chevron" aria-label="이전 달" disabled={index===0} onClick={()=>changeMonth(-1)}><ChevronLeft size={19}/></button><div><span>{current.year}년</span><strong>{current.month}월</strong></div><button type="button" className="cal-quick-chevron" aria-label="다음 달" disabled={index===11} onClick={()=>changeMonth(1)}><ChevronRight size={19}/></button></div>
          <div className="cal-quick-meta"><span><i className="cal-quick-legend-dot holiday"/> 공휴일</span><span><i className="cal-quick-legend-dot vacation"/> 방학</span><span><i className="cal-quick-legend-dot event"/> 행사</span><button type="button" className="cal-action secondary" onClick={()=>onOpenDateEditor(selected)}><PenLine size={14}/> 선택일 운영 구분</button></div>
        </div>
        <div className="cal-quick-calendar">
          {['일','월','화','수','목','금','토'].map((name,i)=><div key={name} className={`cal-quick-weekday ${i===0?'sun':i===6?'sat':''}`}>{name}</div>)}
          {cells.map((date,i)=>{
            if(!date)return <div key={`empty-${i}`} className="cal-quick-empty" aria-hidden="true"/>;
            const rule=effectiveDateRule(plan,date);const items=dateEvents(events,date);const active=selected===date;
            const holiday=rule?.kind==='holiday';const vacation=rule?.kind==='vacation';const closed=rule?.kind==='closed';
            const label=rule?.label||(holiday?'공휴일':vacation?'방학':closed?'휴업일':'');
            const note=(plan.dayNotes||{})[date]?.schedule||'';
            const weekday=i%7;
            return <div key={date} className={`cal-quick-day ${active?'selected':''} ${holiday?'holiday':vacation?'vacation':closed?'closed':weekday===0?'sunday':weekday===6?'saturday':''} ${!isInstructionDate(plan,date)?'off':''}`}>
              <button type="button" className="cal-quick-date-button" data-quick-day={date} aria-pressed={active} aria-label={`${date} ${label} ${items.length}건의 행사`} onClick={()=>pickDate(date)} onKeyDown={e=>keyDay(e,date)}><span className="cal-quick-day-number">{Number(date.slice(8))}</span>{label&&<span className="cal-quick-day-label" title={label}>{label}</span>}</button>
              <div className="cal-quick-day-events">{note&&!items.some(e=>note.includes(e.name))&&<span className="cal-quick-note" title={note}>{note}</span>}{items.slice(0,3).map(event=><button type="button" key={event.id} className="cal-quick-event-chip" title={eventTitle(event)} onClick={()=>editEvent(event)}>{event.name}</button>)}{items.length>3&&<button type="button" className="cal-quick-overflow" title={`${items.length}건의 행사`} onClick={()=>pickDate(date,false)}>+{items.length-3}건</button>}</div>
            </div>;
          })}
        </div>
        <p className="cal-quick-calendar-tip"><Keyboard size={14}/> 날짜를 클릭해 선택하세요. 날짜 셀에서 방향키로 이동할 수도 있어요.</p>
      </div>
      <aside className="cal-quick-side" aria-label="선택 날짜의 행사 입력 및 목록">
        <div className="cal-quick-side-heading"><span>선택한 날짜</span><strong>{selected.replaceAll('-','.')} <small>({selectedEvents.length}건)</small></strong></div>
        <section className="cal-quick-selection" aria-label="선택한 날짜의 기존 행사">
          <div className="cal-quick-selection-head"><strong>이 날짜의 기존 행사</strong><small>{selectedEvents.length}건</small></div>
          {selectedEvents.length?<div className="cal-quick-selected-events">{selectedEvents.map(e=><div key={e.id} className={`cal-quick-selected-item ${draft.id===e.id?'editing':''}`}><div><strong>{e.name}</strong><small>{(e.grades||[]).length?`${e.grades.join('·')}학년`:'전체 학년'} · {e.affectsTimetable?`${e.periodStart}~${e.periodEnd}교시`:'시수 미배정'} · {EVENT_AREAS.find(a=>a.value===e.curriculumArea)?.label||'미분류'} {e.volunteer?'· 봉사':''} · {e.department||'담당 미정'}</small></div><button type="button" onClick={()=>editEvent(e)} aria-label={`${e.name} 수정`} title="이 행사 수정"><PenLine size={15}/></button><button type="button" onClick={()=>onRemove(e)} aria-label={`${e.name} 삭제`} title="삭제"><Trash2 size={15}/></button></div>)}</div>:<p className="cal-quick-empty-message">아직 등록된 행사가 없어요.</p>}
        </section>
        <section className="cal-quick-entry" aria-label="선택 날짜 행사 입력">
          <div className="cal-quick-entry-head"><div><h3>{draft.id?<><PenLine size={17}/> 행사 수정</>:<><Plus size={17}/> 행사 빠른 등록</>}</h3><p>각 항목에서 <kbd>Enter</kbd> 다음 칸 · 마지막 칸에서 <kbd>Enter</kbd> 저장</p></div>{draft.id&&<button type="button" className="cal-quick-reset" onClick={newEvent}><RotateCcw size={14}/> 새 행사</button>}</div>
          <form ref={formRef} onSubmit={submit} onKeyDown={handleFormKey} className="cal-quick-event-form">
            <div className="cal-quick-form-grid">
              <label className="cal-quick-field date"><span>날짜</span><input data-quick-entry-field="date" type="date" aria-label="행사 날짜" value={draft.date} min={`${year}-03-01`} max={`${year+1}-02-${new Date(Date.UTC(year+1,2,0)).getUTCDate()}`} onChange={e=>{const date=e.target.value;update('date',date);if(inYear(year,date)){onSelect(date);setIndex(monthIndexOf(year,date));}}} required/></label>
              <label className="cal-quick-field name"><span>행사명</span><input data-quick-entry-field="name" ref={nameRef} value={draft.name||''} onChange={e=>update('name',e.target.value)} maxLength={90} placeholder="예: 체육대회" aria-label="행사명" required/></label>
              <label className="cal-quick-field grades"><span>대상 학년</span><select data-quick-entry-field="grades" aria-label="대상 학년" value={gradeChoice} onChange={e=>setGradeChoice(e.target.value)}>{QUICK_GRADES.map(g=><option key={g.value} value={g.value}>{g.label}</option>)}</select></label>
              <div className="cal-quick-period-group"><label className="cal-quick-field period"><span>시작 교시</span><select data-quick-entry-field="period-start" aria-label="시작 교시" value={draft.periodStart||1} onChange={e=>update('periodStart',Number(e.target.value))}>{periods.map(p=><option key={p} value={p}>{p}교시</option>)}</select></label><label className="cal-quick-field period"><span>종료 교시</span><select data-quick-entry-field="period-end" aria-label="종료 교시" value={draft.periodEnd||6} onChange={e=>update('periodEnd',Number(e.target.value))}>{periods.map(p=><option key={p} value={p}>{p}교시</option>)}</select></label></div>
              <label className="cal-quick-field area"><span>시수 영역</span><select data-quick-entry-field="area" aria-label="시수 영역" value={draft.curriculumArea||'none'} onChange={e=>update('curriculumArea',e.target.value)}>{EVENT_AREAS.map(a=><option value={a.value} key={a.value}>{a.label}</option>)}</select></label>
              <label className="cal-quick-field service"><span>봉사활동</span><span className="cal-quick-check"><input data-quick-entry-field="volunteer" aria-label="봉사활동 포함" type="checkbox" checked={!!draft.volunteer} onChange={e=>update('volunteer',e.target.checked)}/><span>포함</span></span></label>
              {draft.curriculumArea==='subject'&&<label className="cal-quick-field subject"><span>교과 선택</span><select data-quick-entry-field="subject" aria-label="교과 선택" value={draft.subjectId||''} onChange={e=>update('subjectId',e.target.value)}><option value="">과목 선택</option>{(subjects||[]).filter(s=>s.kind==='subject').map(s=><option value={s.id} key={s.id}>{s.label}</option>)}</select></label>}
              <label className="cal-quick-field dept"><span>담당 부서</span><input data-quick-entry-field="department" aria-label="담당 부서" value={draft.department||''} maxLength={50} onChange={e=>update('department',e.target.value)} placeholder="예: 학생부"/></label>
            </div>
            {(draft.name||'').trim()&&<details className="ei-details" key={draft.id||'new'} defaultOpen={!!draft.id}><summary>이 행사를 저장하면 수업·시수가 어떻게 바뀔까?</summary><EventImpactPreview plan={plan} events={events} draft={{...draft,grades:choiceToGrades(gradeChoice),endDate:''}}/></details>}
            {error&&<p className="cal-quick-error" role="alert">{error}</p>}
            <div className="cal-quick-submit-row"><button type="submit" className="cal-action main"><Check size={16}/>{draft.id?'수정 저장':'행사 추가'} <span className="cal-quick-enter-tag">Ctrl+Enter</span></button><button type="button" className="cal-action secondary" onClick={newEvent}>입력 초기화</button></div>
            <p className="cal-quick-hint"><Info size={14}/> <span>각 항목에서 <kbd>Enter</kbd>를 누르면 다음 항목으로 이동해요. 마지막 담당 부서 칸에서 <kbd>Enter</kbd>를 누르면 저장되며, 중간 저장은 <kbd>Ctrl+Enter</kbd> (Mac은 ⌘+Enter)예요. 선택 메뉴는 방향키로 고른 뒤 Enter를 누르세요. 저장 후 행사명 칸으로 돌아옵니다.</span></p>
            <span className="cal-quick-screenreader-status" role="status" aria-live="polite">{saveCount>0?`행사 저장 완료 · ${saveCount}번째 입력` : ''}</span>
          </form>
        </section>
      </aside>
    </div>
  </section>;
}

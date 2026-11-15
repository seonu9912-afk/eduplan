'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,CalendarRange,Check,FileSpreadsheet,Plus,Trash2,Download,Undo2,RefreshCw,AlertTriangle,ClipboardCheck,X,Save,ChevronLeft,ChevronRight} from 'lucide-react';
import readXlsxFile from 'read-excel-file/browser';
import {academicStart,academicEnd,rangeDates,plusDays,weekday,createAcademic} from '../lib/academic';
import {inYear,isInstructionDate,ymd,applyPublicHolidays} from '../lib/calendar';
import {v12Days,v12Day,v12Events,v12Audit,v12ActualHours,v12AnnualSummary,v12MonthCounts,V12_TYPES,V12_AREAS,V12_TO_EDUPLAN,gradeArea,v12ImpactPreview} from '../lib/v12-calendar-bridge';
import {createAcademicXlsx} from '../lib/v12-xlsx';
import {buildV12ExportSheets} from '../lib/v12-calendar-exports';
const MONTHS=[3,4,5,6,7,8,9,10,11,12,1,2],WD=['일','월','화','수','목','금','토'];
const TABS=[['annual','연간 학사력'],['events','행사 편성'],['hours','시수 확인'],['audit','편성 점검'],['output','Excel 출력']];
const typeChoices=[['instructional','수업일'],['holiday','공휴일'],['vacation','방학'],['discretionary','재량휴업일'],['weekend','주말·휴업일'],['swap','요일교체 수업일']];
const kindMap={instructional:'instruction',holiday:'holiday',vacation:'vacation',discretionary:'closed',weekend:'closed',swap:'instruction'};
const emptyEvent=(date)=>({date,name:'',department:'',memo:'',periodStart:1,periodEnd:1,affectsTimetable:true,gradeAreas:{1:'교과',2:'교과',3:'교과'}});
function localRuleFor(date,kind,label='',swapped=0){return {date,kind:kindMap[kind]||'instruction',label:label||'',weekdayOverride:kind==='swap'?swapped:0,source:'manual'};}
function dateKey(year,month,day){return `${month<=2?year+1:year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
function monthCells(year,month){const y=month<=2?year+1:year,m=String(month).padStart(2,'0'),first=weekday(`${y}-${m}-01`),days=new Date(Date.UTC(y,month,0)).getUTCDate();const length=Math.ceil((first+days)/7)*7;return Array.from({length},(_,i)=>i>=first&&i<first+days?dateKey(year,month,i-first+1):null);}
const validEvent=(year,e)=>{if(!e.name?.trim())return '행사명을 입력해 주세요.';if(!inYear(year,e.date))return '학년도 범위의 날짜를 선택해 주세요.';if(e.endDate&&(!inYear(year,e.endDate)||e.endDate<e.date))return '종료일은 시작일 이후, 학년도 범위에서 선택해 주세요.';if(e.affectsTimetable){const a=Number(e.periodStart),b=Number(e.periodEnd);if(!Number.isInteger(a)||!Number.isInteger(b)||a<1||b>12||a>b)return '1~12교시의 올바른 교시 범위를 지정해 주세요.';}return null;};
function Box({title,children,description,actions}){return <section className="v12-box"><header className="v12-box-head"><div><h3>{title}</h3>{description&&<small>{description}</small>}</div>{actions}</header><div className="v12-box-body">{children}</div></section>}
const Btn=({children,onClick,primary=false,disabled=false,className=''})=><button type="button" className={`v12-btn ${primary?'primary':''} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
function DayEditor({year,plan,date,onSave,onReset,onClose,onAddEvent,events,onDirtyChange}){
  const data=useMemo(()=>v12Day(plan,date),[plan,date]);
  const [kind,setKind]=useState(data.유형);const [label,setLabel]=useState(data.명칭);const [swap,setSwap]=useState(data.적용요일||'월');const [memo,setMemo]=useState((plan.dayNotes||{})[date]?.memo||'');
  useEffect(()=>{setKind(data.유형);setLabel(data.명칭);setSwap(data.적용요일||'월');setMemo((plan.dayNotes||{})[date]?.memo||'');onDirtyChange(false);},[date,data.유형,data.명칭,data.적용요일,plan.dayNotes,onDirtyChange]);
  const change=()=>{const next={...localRuleFor(date,kind,label,Math.max(1,WD.indexOf(swap))),memo};onSave(next);onDirtyChange(false);};
  return <Box title={`${date} (${WD[weekday(date)]})`} description="날짜의 학사일 속성을 바로 변경합니다." actions={<button className="v12-icon" onClick={onClose} aria-label="닫기"><X size={17}/></button>}>
    <div className="v12-form"><label>학사일 구분<select value={kind} onChange={e=>{setKind(e.target.value);onDirtyChange(true);}}>{typeChoices.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    <label>날짜 명칭<input value={label} onChange={e=>{setLabel(e.target.value);onDirtyChange(true);}} maxLength={60} placeholder="예: 재량휴업일, 여름방학"/></label>
    {kind==='swap'&&<label>적용 시간표 요일<select value={swap} onChange={e=>{setSwap(e.target.value);onDirtyChange(true);}}>{WD.slice(1,6).map(d=><option key={d} value={d}>{d}요일</option>)}</select></label>}
    <label>비고<textarea rows={2} value={memo} onChange={e=>{setMemo(e.target.value);onDirtyChange(true);}} placeholder="추가 메모"/></label>
    <div className="v12-actions"><Btn primary onClick={change}><Check size={15}/> 날짜 저장</Btn><Btn onClick={()=>onAddEvent(date)}><Plus size={15}/> 행사 추가</Btn><Btn onClick={()=>{if(onReset(date))onDirtyChange(false);}}><Undo2 size={14}/> 설정 해제</Btn></div>
    {events.length>0&&<div className="v12-event-foot"><b>이 날짜의 등록 행사 {events.length}건</b>{events.map(e=><div key={e.id}>{e.name} · {e.department||'부서 미정'}</div>)}</div>}
    </div></Box>;
}
export default function CalendarV12Port({space,updateSpace,notify,schoolName,focusDate=null,activeYear=null,onYearChange=null}){
  const years=Object.keys(space.academics||{}).map(Number).filter(y=>y>=2020&&y<=2100);
  const [localYear,setLocalYear]=useState(space.exampleMeta?.year||years.at(-1)||new Date().getFullYear());
  const year=activeYear??localYear;const setYear=onYearChange||setLocalYear;
  const [tab,setTab]=useState('annual');const [month,setMonth]=useState(3);const [selected,setSelected]=useState(null);
  const [range,setRange]=useState({kind:'vacation',start:`${year}-07-26`,end:`${year}-08-15`,label:'여름방학'});
  const [eventDraft,setEventDraft]=useState(null);
  const [importDraft,setImportDraft]=useState([]);const [ignored,setIgnored]=useState([]);const [busy,setBusy]=useState(false);
  const [dayDirty,setDayDirty]=useState(false);const [holidayPreview,setHolidayPreview]=useState(null);
  const [holidayStatus,setHolidayStatus]=useState({year:null,state:'idle',error:''});
  const autoHolidayAttempts=useRef(new Set());
  const drawerRef=useRef(null);
  const closeDrawerRef=useRef(()=>{});
  const plan=space.academics?.[String(year)]||createAcademic(year);
  const events=useMemo(()=>(space.events||[]).filter(e=>e.date<=academicEnd(year)&&(e.endDate||e.date)>=academicStart(year)),[space.events,year]);
  const days=useMemo(()=>v12Days(plan),[plan]);const dayMap=useMemo(()=>new Map(days.map(d=>[d.날짜,d])),[days]);
  const summary=useMemo(()=>v12AnnualSummary(plan),[plan]);const counts=useMemo(()=>v12MonthCounts(plan),[plan]);
  const actual=useMemo(()=>v12ActualHours(plan,events),[plan,events]);
  const audits=useMemo(()=>v12Audit(plan,events),[plan,events]);
  const preview=useMemo(()=>v12ImpactPreview(plan,range.start,range.end,kindMap[range.kind]),[plan,range]);
  const affectedEvents=useMemo(()=>preview.error?[]:events.filter(e=>e.date<=range.end&&(e.endDate||e.date)>=range.start),[events,range,preview]);
  useEffect(()=>{if(!focusDate?.date)return;const y=Number(focusDate.date.slice(0,4))-(Number(focusDate.date.slice(5,7))<=2?1:0);setYear(y);setMonth(Number(focusDate.date.slice(5,7)));setSelected(focusDate.date);setTab('annual');},[focusDate]);
  // 공휴일은 최초 진입 시 자동으로 반영하고, 해당 학년도에 확인한 기록이 있으면 다시 가져오지 않는다.
  // 수동 변경·방학·교체요일은 applyPublicHolidays에서 보존한다.
  useEffect(()=>{
    if(plan.holidaysLastChecked||autoHolidayAttempts.current.has(year))return;
    autoHolidayAttempts.current.add(year);
    let active=true;
    setHolidayStatus({year,state:'loading',error:''});
    (async()=>{
      const res=await fetch(`/api/holidays?year=${year}`,{cache:'no-store'});
      const result=await res.json();
      if(!res.ok||!result.ok)throw new Error(result.error||'공휴일 데이터를 불러오지 못했습니다.');
      const holidays=(result.holidays||[]).filter(h=>inYear(year,h.date));
      if(!holidays.length)throw new Error('해당 학년도 공휴일 정보가 없습니다.');
      if(!active)return;
      updateSpace(space=>{
        const existing=space.academics?.[String(year)]||createAcademic(year);
        if(existing.holidaysLastChecked)return space;
        return {...space,academics:{...(space.academics||{}),[String(year)]:applyPublicHolidays(existing,holidays)}};
      });
      setHolidayStatus({year,state:'ready',error:''});
    })().catch(e=>{if(active)setHolidayStatus({year,state:'error',error:e.message||'조회 오류'});});
    return()=>{active=false;};
  },[year,plan.holidaysLastChecked]);
  const hasUnapplied=dayDirty||!!eventDraft||importDraft.length>0;
  useEffect(()=>{if(!hasUnapplied)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[hasUnapplied]);
  const changeView=cb=>{if(hasUnapplied&&!window.confirm('작성 중인 학사일정 내용이 저장되지 않았어요. 입력을 취소하고 이동할까요?'))return;
    setEventDraft(null);setImportDraft([]);setDayDirty(false);cb();};
  const savePlan=(transform,msg)=>{updateSpace(s=>{const existing=s.academics?.[String(year)]||createAcademic(year);const next=transform(existing);return {...s,academics:{...(s.academics||{}),[String(year)]:{...next,status:'draft',confirmedAt:null}}};});if(msg)notify(msg);};
  const saveDay=value=>{const {memo,...rule}=value;savePlan(p=>{const rules=[...(p.dayRules||[]).filter(d=>d.date!==rule.date),rule].sort((a,b)=>a.date.localeCompare(b.date));const notes={...(p.dayNotes||{})};if(memo?.trim())notes[rule.date]={...(notes[rule.date]||{}),memo};else if(notes[rule.date]){const n={...notes[rule.date],memo:''};if(!n.schedule&&!n.activities)delete notes[rule.date];else notes[rule.date]=n;}return {...p,dayRules:rules,dayNotes:notes};},`${value.date} 학사일을 저장했습니다.`);};
  const resetDay=date=>{if(!window.confirm(`${date}의 개별 날짜 설정을 해제할까요? 등록된 행사는 유지돼요.`))return false;savePlan(p=>({...p,dayRules:(p.dayRules||[]).filter(r=>r.date!==date)}),'개별 날짜 규칙을 해제했습니다.');return true;};
  const saveRange=()=>{if(preview.error){notify(preview.error);return;}const statement=`${range.start} ~ ${range.end} ${preview.dates.length}일에 '${V12_TYPES[range.kind]}'을 적용할까요?\n수업일 ${preview.before}일 → ${preview.after}일, 변경 ${preview.changed}일\n관련 행사 ${affectedEvents.length}건은 삭제되지 않습니다.`;
    if(!window.confirm(statement))return;
    const changedSet=new Set(preview.dates);savePlan(p=>({...p,dayRules:[...(p.dayRules||[]).filter(d=>!changedSet.has(d.date)),...preview.dates.map(date=>localRuleFor(date,range.kind,range.label,0))].sort((a,b)=>a.date.localeCompare(b.date))}),`${preview.dates.length}일의 학사일 속성을 적용했습니다.`);
  };
  const importHolidays=async()=>{setBusy(true);setHolidayPreview(null);try{const response=await fetch(`/api/holidays?year=${year}`,{cache:'no-store'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'공휴일 API 조회 실패');const eligible=(result.holidays||[]).filter(h=>inYear(year,h.date));if(!eligible.length)throw new Error('조회된 공휴일이 없습니다.');const next=applyPublicHolidays(plan,eligible);setHolidayPreview({eligible,manual:(plan.dayRules||[]).filter(r=>r.source!=='kasi'&&eligible.some(h=>h.date===r.date)).length,before:v12AnnualSummary(plan).total,after:v12AnnualSummary(next).total});}catch(e){notify(e.message||'공휴일 조회에 실패했습니다.');}finally{setBusy(false);}};
  const confirmHolidays=()=>{if(!holidayPreview)return;savePlan(p=>applyPublicHolidays(p,holidayPreview.eligible),`${holidayPreview.eligible.length}개 공휴일을 반영했습니다.`);setHolidayPreview(null);};
  const openEvent=(date=null,e=null)=>{setSelected(null);setEventDraft(e?{...e,gradeAreas:{1:gradeArea(e,1),2:gradeArea(e,2),3:gradeArea(e,3)}}:emptyEvent(date||selected||`${year}-03-02`));setTab('events');};
  const saveEvent=()=>{const e=eventDraft;if(!e)return;const error=validEvent(year,e);if(error){notify(error);return;}
    const primary=[1,2,3].map(g=>e.gradeAreas?.[g]||'없음').find(x=>x!=='없음')||'없음';const area=V12_TO_EDUPLAN[primary]||'none';const value={...e,id:e.id||`v12-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,name:e.name.trim(),category:e.category||'학교행사',curriculumArea:area,volunteer:primary==='봉사',grades:[1,2,3].filter(g=>e.gradeAreas?.[g]!=='없음'),endDate:e.endDate||'',periodStart:Number(e.periodStart)||1,periodEnd:Number(e.periodEnd)||1,affectsTimetable:!!e.affectsTimetable&&area!=='none',gradeAreas:e.gradeAreas};
    const mixed=new Set([1,2,3].map(g=>e.gradeAreas?.[g]).filter(a=>a&&a!=='없음')).size>1;
    updateSpace(s=>({...s,events:e.id?(s.events||[]).map(item=>item.id===e.id?value:item):[...(s.events||[]),value]}));setEventDraft(null);
    notify(mixed?'행사를 저장했습니다. 학년별 시수 구분은 보존되며, 시간표 교시 대체는 추가 검증이 필요합니다.':'행사를 저장했습니다.');
  };
  const deleteEvent=e=>{if(!window.confirm(`'${e.name}' 행사를 삭제할까요?`))return;updateSpace(s=>({...s,events:(s.events||[]).filter(x=>x.id!==e.id)}));notify('행사를 삭제했습니다.');};
  const excelImport=async file=>{if(!file)return;setBusy(true);try{const rows=await readXlsxFile(file);const header=rows.shift()?.map(x=>String(x??'').trim())||[];const index=n=>header.indexOf(n);if(index('날짜')<0||index('행사명')<0)throw new Error('날짜·행사명 열이 있는 v12 행사 양식을 사용하세요.');
    const added=[];for(const row of rows){const raw=Object.fromEntries(header.map((h,i)=>[h,row[i]]));if(!raw['행사명'])continue;
      const key=raw['날짜'] instanceof Date?`${raw['날짜'].getFullYear()}-${String(raw['날짜'].getMonth()+1).padStart(2,'0')}-${String(raw['날짜'].getDate()).padStart(2,'0')}`:String(raw['날짜']||'').slice(0,10);
      if(!inYear(year,key))throw new Error(`${key}은 ${year}학년도 날짜가 아닙니다.`);
      const gradeAreas={};for(const g of [1,2,3])gradeAreas[g]=V12_AREAS.includes(raw[`${g}학년구분`])?raw[`${g}학년구분`]:'없음';
      const category=[1,2,3].map(g=>gradeAreas[g]).find(a=>a!=='없음')||'없음';
      added.push({...emptyEvent(key),date:key,name:String(raw['행사명']),department:String(raw['담당부서']||''),memo:String(raw['비고']||''),periodStart:raw['시작교시']===''||raw['시작교시']==null?1:Number(raw['시작교시']),periodEnd:raw['종료교시']===''||raw['종료교시']==null?1:Number(raw['종료교시']),affectsTimetable:raw['시작교시']!==''&&raw['시작교시']!=null,gradeAreas,curriculumArea:V12_TO_EDUPLAN[category]});
    }
    if(!added.length)throw new Error('불러올 행사가 없습니다.');setImportDraft(added);notify(`행사 ${added.length}건을 확인했습니다. 검토한 뒤 적용해 주세요.`);
  }catch(e){notify(`엑셀 읽기 실패: ${e.message}`);}finally{setBusy(false);}};
  const saveImport=()=>{if(!importDraft.length)return;const invalid=importDraft.find(e=>validEvent(year,e));if(invalid){notify(validEvent(year,invalid));return;}
    if(!window.confirm(`행사 ${importDraft.length}건을 추가할까요? 기존 행사는 유지합니다.`))return;
    const fingerprints=new Set((space.events||[]).map(e=>`${e.date}|${e.name}|${e.periodStart}|${e.periodEnd}`));let added=0;
    const unique=importDraft.filter(e=>{const key=`${e.date}|${e.name}|${e.periodStart}|${e.periodEnd}`;if(fingerprints.has(key))return false;fingerprints.add(key);return true;}).map(e=>{added++;
      const primary=[1,2,3].map(g=>e.gradeAreas[g]).find(a=>a!=='없음')||'없음';return {...e,id:`imp-${Date.now()}-${added}`,category:'학교행사',grades:[1,2,3].filter(g=>e.gradeAreas[g]!=='없음'),curriculumArea:V12_TO_EDUPLAN[primary]||'none',volunteer:primary==='봉사',endDate:''};});
    updateSpace(s=>({...s,events:[...(s.events||[]),...unique]}));setImportDraft([]);notify(`${added}건 저장했습니다. 중복 항목은 제외했습니다.`);
  };
  const exportType=type=>{try{const sheets=buildV12ExportSheets(plan,events,schoolName,type);const blob=createAcademicXlsx(sheets);const href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download=`${schoolName||'학교'}_${year}학년도_${{events:'행사편성목록',weeklyHours:'주별수업일수시수',creative:'창체운영계획',calendar:'월별학사력'}[type]}.xlsx`;link.click();URL.revokeObjectURL(href);notify('Excel 파일을 생성했습니다. 원본과 출력 서식을 비교해 주세요.');}catch(e){notify(`Excel 출력 실패: ${e.message}`);}};
  const openDate=date=>{if(!date||!inYear(year,date)||date===selected)return;changeView(()=>setSelected(date));};
  const goMonth=delta=>{const i=MONTHS.indexOf(month),idx=(i+delta+12)%12;setMonth(MONTHS[idx]);};
  const selectedEvents=events.filter(e=>selected&&e.date<=selected&&(e.endDate||e.date)>=selected);
  const renderCalendar=(m)=>{const cells=monthCells(year,m);return <div className="v12-month-grid"><div className="v12-weekheads">{WD.map(d=><strong key={d}>{d}</strong>)}</div><div className="v12-gridcells">{cells.map((d,i)=>!d?<div className="v12-day empty" key={`empty${i}`}/>:<div key={d} className={`v12-day ${dayMap.get(d)?.유형||''} ${selected===d?'active':''}`} onClick={()=>openDate(d)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')openDate(d);}}><div className="v12-day-head"><b>{Number(d.slice(8))}</b><small>{dayMap.get(d)?.명칭||''}</small></div>{events.filter(e=>e.date<=d&&(e.endDate||e.date)>=d).slice(0,4).map(e=><button key={e.id} type="button" className="v12-chip" onClick={event=>{event.stopPropagation();changeView(()=>openEvent(d,e));}}>{e.name}</button>)}</div>)}</div></div>;};
  closeDrawerRef.current=()=>changeView(()=>setSelected(null));
  useEffect(()=>{
    if(!selected)return;
    const lastFocused=document.activeElement;
    const panel=drawerRef.current;
    panel?.querySelector('button')?.focus();
    const onKey=e=>{
      if(e.key==='Escape'){e.preventDefault();closeDrawerRef.current();return;}
      if(e.key!=='Tab'||!panel)return;
      const controls=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);
      if(!controls.length)return;
      const first=controls[0],last=controls.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',onKey);
    return()=>{window.removeEventListener('keydown',onKey);lastFocused?.focus?.();};
  },[selected]);
  return <div className="v12-port">
    <div className="v12-slim-toolbar">
      <nav className="v12-nav" aria-label="학사일정 기능">{TABS.map(([id,label])=><button type="button" key={id} onClick={()=>changeView(()=>setTab(id))} className={tab===id?'active':''}>{label}</button>)}</nav>
      <div className="v12-yr"><label htmlFor="v12-year">학년도</label><select id="v12-year" value={year} onChange={e=>{const y=Number(e.target.value);changeView(()=>{setYear(y);setMonth(3);setSelected(null);setRange({kind:'vacation',start:`${y}-07-26`,end:`${y}-08-15`,label:'여름방학'});setHolidayPreview(null);});}}>{[...new Set([...years,year,2027,2028])].sort((a,b)=>a-b).map(y=><option key={y} value={y}>{y}학년도</option>)}</select></div>
    </div>
    {tab==='annual'&&<><Box title="연간 학사력" description="3월부터 다음 해 2월까지. 날짜를 선택하면 오른쪽에서 수정할 수 있습니다."><div className="v12-matrix-wrap"><div className="v12-matrix"><div className="v12-matrix-h"><b>일</b>{MONTHS.map(m=><b key={m}>{m}월</b>)}</div>{Array.from({length:31},(_,i)=>i+1).map(day=><div className="v12-matrix-r" key={day}><b>{day}</b>{MONTHS.map(m=>{const d=dateKey(year,m,day),info=dayMap.get(d);return info?<button type="button" key={m} className={`v12-matrix-cell ${info.유형} ${selected===d?'active':''}`} title={`${d} ${V12_TYPES[info.유형]||''} ${info.명칭}`} onClick={()=>openDate(d)}><small>{info.요일}</small><span>{info.명칭||' '}</span></button>:<span className="v12-matrix-empty" key={m}/>;})}</div>)}<div className="v12-matrix-h"><b>계</b>{MONTHS.map(m=><b key={m}>{counts[`${m<=2?year+1:year}-${String(m).padStart(2,'0')}`]||0}일</b>)}</div></div></div>
      <details className="v12-disclosure"><summary>수업일수·방학일수 확인 <span>학년도 운영 현황</span></summary><div className="v12-stats">{[['연간 수업일수',summary.total],['1학기 수업일',summary.first],['2학기 수업일',summary.second],['재량휴업일',summary.discretionary],['여름방학일',summary.vacations.여름방학],['겨울방학일',summary.vacations.겨울방학]].map(([a,b])=><div key={a}><span>{a}</span><strong>{b}일</strong></div>)}</div></details>
      <details className="v12-disclosure"><summary>공휴일 관리 <span>{plan.holidaysLastChecked?`자동 반영됨 · ${String(plan.holidaysLastChecked).slice(0,10)}`:holidayStatus.year===year&&holidayStatus.state==='loading'?'공휴일 자동 반영 중':holidayStatus.year===year&&holidayStatus.state==='error'?'공휴일 반영 확인 필요':'자동 반영 준비 중'}</span></summary>
        <div className="v12-api-actions"><p>공식 공휴일은 학년도 최초 진입 시 자동으로 반영하며, 수동으로 지정한 학사일은 보존합니다.</p><Btn onClick={importHolidays} disabled={busy}><RefreshCw size={15}/> {busy?'조회 중…':'공휴일 다시 조회'}</Btn></div>
        {holidayStatus.year===year&&holidayStatus.state==='error'&&<p className="v12-holiday-error" role="status">자동 반영에 실패했습니다: {holidayStatus.error}. 위 버튼으로 다시 조회할 수 있습니다.</p>}
        {holidayPreview&&<div className="v12-holiday-preview"><div className="v12-preview"><strong>조회된 공휴일 {holidayPreview.eligible.length}일</strong><span>수업일수 {holidayPreview.before} → {holidayPreview.after}일 · 기존 수동 설정 {holidayPreview.manual}건 유지</span></div><div className="v12-holidays">{holidayPreview.eligible.map(h=><span key={h.date}>{h.date} {h.name||h.title||'공휴일'}</span>)}</div><div className="v12-actions"><Btn primary onClick={confirmHolidays}>확인 후 적용</Btn><Btn onClick={()=>setHolidayPreview(null)}>취소</Btn></div></div>}
      </details>
</Box></>}
    {tab==='annual'&&<details className="v12-disclosure v12-bulk-disclosure"><summary>방학·재량휴업일 일괄 지정 <span>필요할 때 펼쳐서 사용</span></summary><Box title="방학·재량휴업일 일괄 지정" description="기존 행사와 메모는 삭제하지 않고 날짜의 운영 속성만 변경합니다."><div className="v12-range-form"><label>구분<select value={range.kind} onChange={e=>setRange(s=>({...s,kind:e.target.value,label:e.target.value==='vacation'?'여름방학':e.target.value==='discretionary'?'재량휴업일':''}))}>{typeChoices.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>시작일<input type="date" value={range.start} min={academicStart(year)} max={academicEnd(year)} onChange={e=>setRange(r=>({...r,start:e.target.value}))}/></label><label>종료일<input type="date" value={range.end} min={academicStart(year)} max={academicEnd(year)} onChange={e=>setRange(r=>({...r,end:e.target.value}))}/></label><label>표시명<input value={range.label} onChange={e=>setRange(r=>({...r,label:e.target.value}))} maxLength={60}/></label></div><div className="v12-range-preset"><span>방학 빠른 선택</span>{['여름방학','겨울방학','학년말방학','재량휴업일'].map(name=><Btn key={name} onClick={()=>setRange(r=>({...r,kind:name==='재량휴업일'?'discretionary':'vacation',label:name}))}>{name}</Btn>)}</div>
      <div className="v12-preview">{preview.error?<span>{preview.error}</span>:<><strong>변경 영향 미리보기</strong><span>{preview.dates.length}일 선택 · 수업일 {preview.before} → {preview.after}일 · 실제 변경 {preview.changed}일 · 관련 행사 {affectedEvents.length}건</span></> }<Btn primary disabled={!!preview.error} onClick={saveRange}><Check size={15}/> 기간 적용</Btn></div></Box></details>}
    {tab==='events'&&<>
      <section className="v12-events-calendar"><div className="v12-heading"><div><h3>월간 학사력 · 행사 편성</h3><p className="v12-muted">월별 학사일과 등록된 행사를 함께 확인하고 관리합니다. 날짜를 선택하면 오른쪽에서 학사일을 수정할 수 있습니다.</p></div><div className="v12-actions"><Btn onClick={()=>goMonth(-1)}><ChevronLeft size={17}/></Btn><b>{month<=2?year+1:year}년 {month}월</b><Btn onClick={()=>goMonth(1)}><ChevronRight size={17}/></Btn><Btn onClick={()=>{const m=new Date().getMonth()+1;setMonth(m);}} >이번 달</Btn></div></div>{renderCalendar(month)}</section>
      <Box title="행사 편성" description="학년별 구분·교시·부서까지 원본 v12의 입력 항목을 유지합니다." actions={<Btn primary onClick={()=>openEvent(dateKey(year,3,2))}><Plus size={15}/> 행사 추가</Btn>}>
      <div className="v12-events-tools"><label className="v12-btn">Excel 등록<input type="file" accept=".xlsx" hidden onChange={e=>{excelImport(e.target.files?.[0]);e.target.value='';}}/></label><Btn onClick={()=>exportType('events')}><Download size={15}/> Excel 다운로드</Btn>{importDraft.length>0&&<span>{importDraft.length}건 미적용 <Btn primary onClick={saveImport}>검증 후 추가</Btn><Btn onClick={()=>setImportDraft([])}>취소</Btn></span>}</div>
      <div className="v12-scroll"><table className="v12-table"><thead><tr>{['날짜','교시','행사명','담당부서','1학년','2학년','3학년','편집'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{events.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e=><tr key={e.id}><td>{e.date}</td><td>{e.affectsTimetable?`${e.periodStart}~${e.periodEnd}`:'—'}</td><td>{e.name}</td><td>{e.department}</td>{[1,2,3].map(g=><td key={g}>{gradeArea(e,g)}</td>)}<td><Btn onClick={()=>openEvent(e.date,e)}>수정</Btn><Btn onClick={()=>deleteEvent(e)}><Trash2 size={14}/></Btn></td></tr>)}</tbody></table></div>
      {eventDraft&&<div className="v12-inline"><h4>{eventDraft.id?'행사 수정':'새 행사 등록'}</h4><div className="v12-range-form"><label>날짜<input type="date" value={eventDraft.date} min={academicStart(year)} max={academicEnd(year)} onChange={e=>setEventDraft(d=>({...d,date:e.target.value}))}/></label><label>종료일 (선택)<input type="date" value={eventDraft.endDate||''} min={eventDraft.date} max={academicEnd(year)} onChange={e=>setEventDraft(d=>({...d,endDate:e.target.value}))}/></label><label>행사명<input value={eventDraft.name} onChange={e=>setEventDraft(d=>({...d,name:e.target.value}))}/></label><label>담당부서<input value={eventDraft.department||''} onChange={e=>setEventDraft(d=>({...d,department:e.target.value}))}/></label><label>시작교시<input type="number" min={1} max={12} value={eventDraft.periodStart} onChange={e=>setEventDraft(d=>({...d,periodStart:e.target.value}))}/></label><label>종료교시<input type="number" min={1} max={12} value={eventDraft.periodEnd} onChange={e=>setEventDraft(d=>({...d,periodEnd:e.target.value}))}/></label>{[1,2,3].map(g=><label key={g}>{g}학년 구분<select value={eventDraft.gradeAreas?.[g]||'없음'} onChange={e=>setEventDraft(d=>({...d,gradeAreas:{...d.gradeAreas,[g]:e.target.value}}))}>{V12_AREAS.map(a=><option key={a} value={a}>{a}</option>)}</select></label>)}<label>비고<input value={eventDraft.memo||''} onChange={e=>setEventDraft(d=>({...d,memo:e.target.value}))}/></label></div><label className="v12-check"><input type="checkbox" checked={!!eventDraft.affectsTimetable} onChange={e=>setEventDraft(d=>({...d,affectsTimetable:e.target.checked}))}/> 실제 교시 반영</label><div className="v12-actions"><Btn primary onClick={saveEvent}><Save size={14}/> 저장</Btn><Btn onClick={()=>setEventDraft(null)}>취소</Btn></div></div>}
      </Box></>}
    {tab==='hours'&&<><p className="v12-muted">실제 편성된 시수를 확인합니다. 요일별 수업 및 창의적 체험활동의 세부 배정은 시간표 메뉴에서 관리합니다.</p>{[1,2].map(sem=><Box key={sem} title={`${sem}학기 학년별 시수 현황`}><div className="v12-hours">{[1,2,3].map(g=>{const a=actual[`${sem}-${g}`]||{};return <div key={g}><h4>{g}학년</h4><div className="v12-hour-cards">{['교과','창체','자율','동아리','진로','봉사'].map(k=><span key={k}>{k}<strong>{a[k]||0}</strong></span>)}</div></div>})}</div></Box>)}</>}
    {tab==='audit'&&<Box title="편성 점검" description="행사 중복·비수업일 행사·요일 운영 교시 초과 여부를 확인합니다. 원본 v12의 경고 숨기기를 유지합니다."><div className="v12-actions"><span>점검 항목 {audits.length}건 · 표시 {audits.filter(x=>!ignored.includes(x.key)).length}건</span><Btn onClick={()=>setIgnored([])}><RefreshCw size={15}/> 숨긴 경고 다시 보기</Btn></div>{audits.filter(x=>!ignored.includes(x.key)).map(x=><div className={`v12-issue ${x.severity}`} key={x.key}><AlertTriangle size={17}/><span>{x.text}</span><Btn onClick={()=>{setIgnored(i=>[...i,x.key]);}}>숨기기</Btn></div>)}{!audits.filter(x=>!ignored.includes(x.key)).length&&<div className="v12-noissues">현재 표시할 점검 경고가 없습니다.</div>}</Box>}
    {tab==='output'&&<Box title="Excel 출력" description="각 파일을 브라우저에서 직접 생성합니다. 원본 Google Drive의 임시 출력 폴더는 사용하지 않습니다."><div className="v12-exports">{[['events','행사 편성 목록','학년별 구분·부서·교시 포함'],['weeklyHours','주별 수업일수·시수 현황','1·2학기, 학년별 교과·창체 분류'],['creative','창의적 체험활동 운영계획표','1·2학기 × 1~3학년 총 6개 시트'],['calendar','월별 학사력','3월~다음 해 2월 총 12개 시트']].map(([id,title,description])=><button type="button" key={id} onClick={()=>exportType(id)}><FileSpreadsheet size={26}/><b>{title}</b><small>{description}</small><Download size={15}/></button>)}</div></Box>}
    {selected&&<div className="v12-drawer-root"><button type="button" className="v12-drawer-backdrop" aria-label="날짜 편집 닫기" onClick={()=>closeDrawerRef.current()}/><aside className="v12-drawer-panel" role="dialog" aria-modal="true" aria-label={`${selected} 학사일 수정`} ref={drawerRef}><DayEditor year={year} date={selected} plan={plan} events={selectedEvents} onSave={saveDay} onReset={resetDay} onDirtyChange={setDayDirty} onClose={()=>closeDrawerRef.current()} onAddEvent={date=>changeView(()=>openEvent(date))}/></aside></div>}
    <p className="v12-footnote">학사일정은 시간표·교육과정·업무계획과 데이터를 공유합니다. 데모 데이터는 현재 브라우저에 저장되며, 실제 학교 운영 전에 수업일수와 출력 서식을 검토해 주세요.</p>
  </div>;
}

'use client';
import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowRight,CalendarClock,Check,CheckCircle2,ChevronDown,ClipboardList,Clock3,Copy,Download,Info,LayoutGrid,LockKeyhole,Plus,RotateCcw,Settings2,ShieldAlert,Shuffle,Trash2,Users, X} from 'lucide-react';
import {lessonsToTsv,parseLessonTsv,mergeLessonRows} from '../lib/lesson-table.js';
import TeacherHoursGrid from './TeacherHoursGrid.jsx';
import {BellAutoSetup,BellChangeCalculator} from './BellScheduleTools.jsx';
import {teacherQuality,teacherWorkloadReport} from '../lib/teacher-workload.js';
import {DEFAULT_BELL,DEFAULT_DAY_PERIODS,EMPTY_TIMETABLE_CONFIG,WDAYS,WDAY_NAMES,checkScheduledSlots,extractDemands,solveTimetable,timetableConfig,validateTimetableInput,dayPeriodRange,isOperatingPeriod} from '../lib/timetable-solver';

const genId=()=>`lesson-${Math.random().toString(36).slice(2,10)}`;
const tabNames=[['assign','수업 배정',ClipboardList],['rules','편성 조건',ShieldAlert],['bell','일과표',Clock3],['variation','일과 변동 계산',CalendarClock],['solve','자동 생성',Shuffle]];
const weekdays=WDAYS.map(day=>({day,label:`${WDAY_NAMES[day]}요일`}));
const labelFor=(arr,id)=>arr.find(x=>x.id===id)?.label||id||'미지정';
const csv=rows=>'\ufeff'+rows.map(r=>r.map(x=>{const raw=String(x??'');const safe=/^\s*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('"','""')}"`;}).join(',')).join('\r\n');
function exportCsv(filename,rows){const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
const newLesson=(plan)=>({id:genId(),scope:'class',scopeId:plan.classes?.[0]?.id||'',subjectId:plan.subjects?.[0]?.id||'',teacherId:'',room:'',hours:3,block:1,syncKey:'',fixedDay:0,fixedPeriod:0});
const labelClass=(plan,x)=>x.scope==='group'?`활동반 · ${labelFor(plan.groups||[],x.scopeId)}`:labelFor(plan.classes||[],x.scopeId);
function Report({result}){return <div className={`tt-result ${result.ok?'success':'error'}`} role="status"><div className="tt-report-title">{result.ok?<><CheckCircle2 size={18}/> 필수조건을 만족하는 편성안을 만들었어요.</>:<><ShieldAlert size={18}/> 자동편성 조건을 확인해 주세요.</>}</div>{result.errors?.map((message,i)=><p key={i}>{message}</p>)}{result.ok&&<p>{result.stats.taskCount}개 수업 묶음 · {result.stats.placedHours}개 수업 칸 · {result.stats?.modelStatus?`최적화 ${result.stats.modelStatus} · `:result.stats?.nodes!==undefined?`탐색 ${Number(result.stats.nodes).toLocaleString()}회 · `:""}{result.stats?.durationMs??0}ms</p>}{result.warnings?.length>0&&<details><summary>확인할 사항 {result.warnings.length}건</summary><ul>{result.warnings.slice(0,35).map((m,i)=><li key={i}>{m}</li>)}</ul></details>}</div>}
export default function TimetableStudio({plan,space,editPlan,notify,onOpenManual,year,onDirtyChange}) {
  const cfg=useMemo(()=>timetableConfig(plan),[plan.timetableConfig]);
  const [tab,setTab]=useState('assign');
  const [draft,setDraft]=useState(null);
  const [variant,setVariant]=useState(0);
  const [preview,setPreview]=useState(null);
  const [view,setView]=useState('class');
  const [viewId,setViewId]=useState('');
  const [teacher,setTeacher]=useState('');
  const [roomInput,setRoomInput]=useState('');
  const [showDetails,setShowDetails]=useState(false);
  const [weekScope,setWeekScope]=useState('');
  const [busy,setBusy]=useState(false);
  const [filterTeacher,setFilterTeacher]=useState('');
  const [groupLabel,setGroupLabel]=useState('');
  const [groupClassIds,setGroupClassIds]=useState([]);
  const [assignView,setAssignView]=useState('matrix');
  const [matrixDirty,setMatrixDirty]=useState(false);
  const [advancedOpen,setAdvancedOpen]=useState(false);
  const [assignTarget,setAssignTarget]=useState('');
  const [teacherSearch,setTeacherSearch]=useState('');
  const [quick,setQuick]=useState({scopeValue:'',subjectId:'',hours:3,block:1,room:''});
  const [bulkOpen,setBulkOpen]=useState(false);
  const [bulkText,setBulkText]=useState('');
  const [bulkMode,setBulkMode]=useState('update');
  useEffect(()=>{onDirtyChange?.(!!bulkText.trim()||matrixDirty);return ()=>onDirtyChange?.(false);},[bulkText,matrixDirty,onDirtyChange]);

  const unavailable=new Set((cfg.unavailable||[]).map(x=>`${x.teacherId}|${x.weekday}|${x.period}`));
  const currentSlots=preview?.ok?preview.slots:plan.weekly||[];
  const scopeOptions=[...(plan.classes||[]).map(c=>({value:`class:${c.id}`,label:c.label})),...(plan.groups||[]).map(g=>({value:`group:${g.id}`,label:`활동반 · ${g.label}`}))];
  const selectedRooms=plan.rooms||[];
  const selectorItems=view==='class'?(plan.classes||[]):view==='teacher'?(plan.teachers||[]):selectedRooms.map(id=>({id,label:id}));
  const activeId=selectorItems.some(x=>x.id===viewId)?viewId:selectorItems[0]?.id||'';
  const selectedTeacherId=(plan.teachers||[]).some(t=>t.id===assignTarget)?assignTarget:(plan.teachers||[])[0]?.id||'';
  const selectedTeacher=(plan.teachers||[]).find(t=>t.id===selectedTeacherId);
  const filteredAssignments=(cfg.lessons||[]).filter(d=>assignView==='teacher'?d.teacherId===selectedTeacherId:assignView==='class'?(!assignTarget||d.scopeId===assignTarget):true);
  const shownAssignments=assignView==='teacher'?[...filteredAssignments].sort((a,b)=>labelClass(plan,a).localeCompare(labelClass(plan,b),'ko',{numeric:true})):filteredAssignments;
  const matchingTeachers=(plan.teachers||[]).filter(t=>`${t.label} ${(space.staffMembers||[]).find(s=>s.id===t.id)?.subject||''}`.toLocaleLowerCase().includes(teacherSearch.toLocaleLowerCase()));
  const defaultSubject=(()=>{const subject=(space.staffMembers||[]).find(t=>t.id===selectedTeacherId)?.subject||'';return (plan.subjects||[]).find(s=>s.label===subject)?.id||(plan.subjects||[]).find(s=>subject.includes(s.label))?.id||(plan.subjects||[])[0]?.id||'';})();
  const quickScopeValue=scopeOptions.some(x=>x.value===quick.scopeValue)?quick.scopeValue:scopeOptions[0]?.value||'';
  const quickSubjectId=(plan.subjects||[]).some(x=>x.id===quick.subjectId)?quick.subjectId:defaultSubject;
  const addQuickLesson=()=>{
    if(!selectedTeacherId)return notify('먼저 교사를 선택하거나 교원 목록을 불러와 주세요.');
    if(!quickScopeValue||!quickSubjectId)return notify('학급과 과목을 먼저 설정해 주세요.');
    const hours=Number(quick.hours),block=Number(quick.block)||1;
    if(!Number.isInteger(hours)||hours<1||hours>30||hours%block!==0)return notify('주당 시수는 1~30시간의 정수이며 연속 교시 수의 배수여야 합니다.');
    const [scope,scopeId]=quickScopeValue.split(':');
    saveLessons([...(cfg.lessons||[]),{...newLesson(plan),scope,scopeId,teacherId:selectedTeacherId,subjectId:quickSubjectId,hours,block,room:quick.room}]);
    const index=scopeOptions.findIndex(x=>x.value===quickScopeValue);
    setQuick(q=>({...q,scopeValue:scopeOptions[(index+1)%scopeOptions.length]?.value||quickScopeValue}));
    notify(`${selectedTeacher?.label||'선택 교사'} · ${labelFor(scopeOptions.map(x=>({id:x.value,label:x.label})),quickScopeValue)} ${hours}시간 배정했습니다.`);
  };
  const clipboardPreview=useMemo(()=>bulkOpen&&bulkText.trim()?parseLessonTsv(bulkText,plan,cfg.lessons||[]):null,[bulkOpen,bulkText,plan,cfg.lessons]);
  const copyAssignments=async()=>{try{await navigator.clipboard.writeText(lessonsToTsv(plan,cfg.lessons||[]));notify('전체 수업 배정표를 복사했습니다. 스프레드시트에 붙여넣을 수 있어요.');}catch{notify('클립보드 접근이 차단되었습니다. 표 내보내기로 파일을 저장해 주세요.');}};
  const applyBulk=()=>{if(!clipboardPreview?.rows.length||clipboardPreview.errors.length)return notify('표 오류를 먼저 수정해 주세요.');const next=mergeLessonRows(cfg.lessons||[],clipboardPreview.rows,bulkMode);if(!window.confirm(`${clipboardPreview.rows.length}행을 ${bulkMode==='replace'?'전체 교체':'ID 기준 추가·수정'}할까요? 현재 기본 시간표는 그대로 유지됩니다.`))return;saveLessons(next);setBulkText('');setBulkOpen(false);notify(`수업 배정표 ${clipboardPreview.rows.length}행을 반영했습니다. 자동편성 전에 조건을 검토해 주세요.`);};
  const byTeacher=useMemo(()=>{
    const out={};for(const d of cfg.lessons||[])if(d.teacherId)out[d.teacherId]=(out[d.teacherId]||0)+Number(d.hours||0);return out;
  },[cfg.lessons]);
  const inputValidation=useMemo(()=>validateTimetableInput(plan,cfg),[plan,cfg]);
  const countLessons=cfg.lessons?.reduce((n,x)=>n+Number(x.hours||0),0)||0;
  const inputSignature=JSON.stringify({lessons:cfg.lessons,unavailable:cfg.unavailable,periods:cfg.periods,groups:plan.groups,classes:plan.classes,teachers:plan.teachers,rooms:plan.rooms});
  const appliedErrors=useMemo(()=>checkScheduledSlots(plan,plan.weekly||[],cfg).slice(0,15),[plan,cfg]);
  const quality=teacherQuality(cfg);
  const workload=useMemo(()=>teacherWorkloadReport(plan,currentSlots,cfg),[plan,currentSlots,cfg]);
  const changeQuality=(key,value)=>change('teacherQuality',{...teacherQuality(cfg),[key]:Number(value)});
  const change=(field,value)=>{editPlan(p=>({...p,timetableConfig:{...timetableConfig(p),[field]:value}}));setPreview(null);};
  const changeDayRange=(day,edge,value)=>{
    editPlan(p=>{
      const before=timetableConfig(p),current=dayPeriodRange(before,day);
      const start=edge==='start'?value:Math.min(current.start,value);
      const end=edge==='end'?value:Math.max(current.end,value);
      return {...p,timetableConfig:{
        ...before,starts:{...before.starts,[day]:start},periods:{...before.periods,[day]:end},
      }};
    });
    setPreview(null);
  };
  const saveLessons=lessons=>change('lessons',lessons);
  const saveLesson=(id,patch)=>saveLessons((cfg.lessons||[]).map(x=>x.id===id?{...x,...patch}:x));
  const addLesson=()=>{saveLessons([...(cfg.lessons||[]),{...newLesson(plan),teacherId:assignView==='teacher'?selectedTeacherId:''}]);setTab('assign');};
  const switchTab=next=>{if(matrixDirty&&!window.confirm('시수표에 적용하지 않은 변경이 있어요. 다른 단계로 이동할까요?'))return;setTab(next);};
  const switchAssignView=next=>{if(matrixDirty&&!window.confirm('시수표에 적용하지 않은 변경이 있어요. 다른 보기로 이동하면 수정 내용이 사라집니다. 이동할까요?'))return;setAssignView(next);setAssignTarget('');};
  const importWeekly=()=>{
    if((cfg.lessons||[]).length&&!window.confirm('기존 수업 배정표를 기본 시간표에서 다시 추출하여 교체할까요? 수동으로 입력한 배정표는 바뀌지만 기본 시간표는 그대로 유지됩니다.'))return;
    const rows=extractDemands(plan);if(!rows.length)return notify('먼저 기본 시간표에 수업을 배치해 주세요.');
    saveLessons(rows);notify(`${rows.length}개 수업 배정으로 가져왔어요. 교사와 연속수업 조건을 확인해 주세요.`);
  };
  const toggleUnavailable=(id,day,period)=>{
    if(!id)return;
    const exists=(cfg.unavailable||[]).some(x=>x.teacherId===id&&Number(x.weekday)===day&&Number(x.period)===period);
    change('unavailable',exists?(cfg.unavailable||[]).filter(x=>!(x.teacherId===id&&Number(x.weekday)===day&&Number(x.period)===period)):[...(cfg.unavailable||[]),{teacherId:id,weekday:day,period}]);
  };
  const updateBell=(id,field,value)=>change('bell',(cfg.bell||DEFAULT_BELL).map(r=>r.id===id?{...r,[field]:value}:r));
  const importStaff=()=>{const list=(space.staffMembers||[]).filter(x=>x.status==='재직');if(!list.length)return notify('학교 설정의 교원 관리에 재직 교원을 먼저 등록해 주세요.');editPlan(p=>{const teachers=[...(p.teachers||[])];for(const member of list){const record={id:member.id,label:member.name};const index=teachers.findIndex(t=>t.id===record.id);if(index>=0)teachers[index]=record;else teachers.push(record);}return {...p,teachers};},`${list.length}명의 재직 교원을 불러왔어요.`);};
  const addGroup=()=>{if(!groupLabel.trim()||!groupClassIds.length)return notify('활동반 이름과 참여 학급을 선택하세요.');editPlan(p=>({...p,groups:[...(p.groups||[]),{id:`group-${Math.random().toString(36).slice(2,9)}`,label:groupLabel.trim(),classIds:[...groupClassIds]}]}),'활동반을 등록했습니다.');setGroupLabel('');setGroupClassIds([]);};
  const addRoom=()=>{const value=roomInput.trim();if(!value)return;if(selectedRooms.includes(value))return notify('이미 등록한 특별실입니다.');editPlan(p=>({...p,rooms:[...(p.rooms||[]),value]}));setRoomInput('');};
  const createPreview=async()=>{
    setBusy(true);
    try{
      let result;
      if((plan.classes||[]).length>=9){
        // Only allocation IDs and constraints are sent to the workspace's solver.
        // No student records or personally identifying teacher labels are needed.
        const minimal={classes:(plan.classes||[]).map(({id,grade})=>({id,grade})),
          subjects:(plan.subjects||[]).map(({id,kind})=>({id,kind})),
          teachers:(plan.teachers||[]).map(({id})=>({id})),groups:plan.groups||[],rooms:plan.rooms||[]};
        const response=await fetch('/api/timetable-solve',{method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({workspaceId:space.workspaceId,yearId:space.academicYearId,plan:minimal,config:cfg,variant,limitSeconds:65})});
        result=await response.json();
        if(!response.ok&&!result?.errors)throw Error(`서버 자동편성 요청 실패 (${response.status})`);
      }else{
        result=solveTimetable(plan,{variant,config:cfg,maxNodes:85000,limitMs:2500});
      }
      setPreview({...result,inputSignature});
      if(result.ok)notify('자동편성 초안을 생성했습니다. 아직 기본 시간표는 변경되지 않았습니다.');
    }catch(e){setPreview({ok:false,errors:[e.message||'편성 도중 오류가 발생했습니다.'],warnings:[]});}
    finally{setBusy(false);}
  };
  const apply=()=>{
    if(!preview?.ok||!preview.slots.length)return;
    if(plan.status==='confirmed')return notify('확정 상태에서는 변경할 수 없습니다. 편성 재개 후 다시 시도하세요.');
    if(preview.inputSignature!==inputSignature)return notify('자동편성 조건이 바뀌었습니다. 시간표를 다시 생성해 주세요.');
    if(teacherWorkloadReport(plan,preview.slots,cfg).hardViolations)return notify('교사별 하루·연속수업 제한을 초과하는 초안입니다. 편성 기준을 확인하고 다시 생성해 주세요.');
    if(!window.confirm('현재 기본 시간표 전체를 생성된 시간표로 바꿀까요? 기존 시간표는 자동편성 이전 상태로 보관해 되돌릴 수 있습니다. 날짜별 변경과 학사행사는 유지됩니다.'))return;
    editPlan(p=>({...p,weekly:preview.slots.map(x=>({...x})),timetableConfigured:true,timetableConfig:{...timetableConfig(p),lastApplied:{at:new Date().toISOString(),previous:(p.weekly||[]).map(x=>({...x}))}}}));
    setPreview(null);notify('시간표를 적용했어요. 기존 편성은 이 화면의 되돌리기에서 복원할 수 있습니다.');
  };
  const undo=()=>{
    if(!cfg.lastApplied||!window.confirm('자동편성 이전의 기본 시간표로 되돌릴까요? 현재 시간표는 교체됩니다.'))return;
    editPlan(p=>({...p,weekly:(p.timetableConfig.lastApplied.previous||[]).map(x=>({...x})),timetableConfig:{...timetableConfig(p),lastApplied:null}}));
    setPreview(null);notify('자동편성 이전 시간표를 복원했어요.');
  };
  const filteredSlots=currentSlots.filter(s=>view==='class'?(s.scope==='class'&&s.scopeId===activeId||s.scope==='group'&&(plan.groups||[]).find(g=>g.id===s.scopeId)?.classIds?.includes(activeId)):view==='teacher'?s.teacherId===activeId:s.room===activeId);
  const displayed=Object.fromEntries(filteredSlots.map(s=>[`${s.weekday}-${s.period}`,s]));
  const maxPeriod=Math.max(...WDAYS.map(w=>Number(cfg.periods[w]||0)),1);
  const selectRow=(row)=>{setDraft({...row});setShowDetails(true)};
  const rowChange=(field,value)=>{setDraft(d=>({...d,[field]:value}));};
  const commitDraft=()=>{if(!draft)return;saveLesson(draft.id,draft);setDraft(null);setShowDetails(false);};
  return <div className="tt-studio">
    <div className="tt-topline"><div className="tt-steps">{tabNames.map(([id,label,Icon],i)=><button key={id} className={tab===id?'active':''} type="button" onClick={()=>switchTab(id)}><Icon size={16}/><span>{label}</span></button>)}</div><div className="tt-status"><span>{(cfg.lessons||[]).length}건 수업 배정</span><strong>{countLessons}시간/주</strong></div></div>
    {tab==='assign'&&<section className="tt-panel">
      <div className="tt-panel-head"><div><h3>교사별 수업시수 배정표</h3><p>교사 행을 따라 학급별 주당 시수를 입력합니다. 연속수업·특별실 조건은 그대로 유지돼요.</p></div><div className="tt-actions"><button className="tt-btn" onClick={importStaff}><Users size={15}/> 등록 교원 가져오기</button><button className="tt-btn" onClick={importWeekly}><Copy size={15}/> 기본 시간표에서 추출</button>{assignView!=='matrix'&&<button className="tt-btn primary" onClick={assignView==='teacher'?addQuickLesson:addLesson}><Plus size={15}/> {assignView==='teacher'?'선택 교사 수업 추가':'수업 추가'}</button>}</div></div>
      <div className="tt-assign-bar"><div role="group" className="tt-assignment-views" aria-label="수업 배정 보기"><button className={assignView==='matrix'?'active':''} onClick={()=>switchAssignView('matrix')}>교사별 시수표</button><button className={assignView==='teacher'?'active':''} onClick={()=>switchAssignView('teacher')}>개별 배정</button><button className={assignView==='class'?'active':''} onClick={()=>switchAssignView('class')}>학급별 검토</button><button className={assignView==='all'?'active':''} onClick={()=>switchAssignView('all')}>전체 표</button></div>{assignView==='class'&&<select value={assignTarget} onChange={e=>setAssignTarget(e.target.value)} aria-label="배정 학급 필터"><option value="">모든 학급</option>{scopeOptions.map(x=><option key={x.value} value={x.value.split(':').slice(1).join(':')}>{x.label}</option>)}</select>}<span className="tt-assign-count">{assignView==='matrix'?`${(plan.teachers||[]).length}명 교사 · ${(plan.classes||[]).length}학급`:`${filteredAssignments.length} / ${(cfg.lessons||[]).length}행`}</span><button className="tt-btn" onClick={copyAssignments}><Copy size={15}/> 전체 표 복사</button><button className="tt-btn" onClick={()=>exportCsv(`EduPlan_${year}_수업배정표.csv`,[['ID','대상','과목','교사','주당시수','연속교시','특별실','공통시간','고정요일','고정교시'],...(cfg.lessons||[]).map(d=>[d.id,labelClass(plan,d),labelFor(plan.subjects||[],d.subjectId),labelFor(plan.teachers||[],d.teacherId),d.hours,d.block||1,d.room||'',d.syncKey||'',d.fixedDay||'',d.fixedPeriod||''])])}><Download size={15}/> CSV</button><button className="tt-btn" onClick={()=>setBulkOpen(x=>!x)}>붙여넣기 편집</button></div>
      {assignView==='matrix'&&<TeacherHoursGrid plan={plan} lessons={cfg.lessons||[]} staff={space.staffMembers||[]} onApply={saveLessons} onDirtyChange={setMatrixDirty} notify={notify}/>}
      {assignView==='teacher'&&<div className="tt-teacher-first-layout"><aside className="tt-teacher-selector" aria-label="교사 목록"><div className="tt-teacher-selector-head"><strong>교사 선택</strong><span>{(plan.teachers||[]).length}명</span></div><input aria-label="교사 검색" placeholder="이름·교과 검색" value={teacherSearch} onChange={e=>setTeacherSearch(e.target.value)}/><div className="tt-teacher-selector-list">{matchingTeachers.map(t=>{const subject=(space.staffMembers||[]).find(x=>x.id===t.id)?.subject||'교과 미설정';return <button type="button" key={t.id} className={`tt-teacher-choice ${selectedTeacherId===t.id?'active':''}`} onClick={()=>{setAssignTarget(t.id);setQuick(q=>({...q,subjectId:''}));}} aria-pressed={selectedTeacherId===t.id}><span><b>{t.label}</b><small>{subject}</small></span><strong>{byTeacher[t.id]||0}<small>시간</small></strong></button>})}{!matchingTeachers.length&&<p className="tt-empty">검색 결과가 없습니다.</p>}</div></aside><div className="tt-teacher-assign-main"><div className="tt-selected-teacher"><span>선택 교사</span><strong>{selectedTeacher?.label||'교사 없음'}</strong><span className="tt-selected-meta">주당 {byTeacher[selectedTeacherId]||0}시간 · {filteredAssignments.length}개 수업 배정</span></div><div className="tt-quick-entry" aria-label="교사 수업 빠른 배정"><label>담당 학급·활동반<select aria-label="빠른 배정 대상 학급" value={quickScopeValue} onChange={e=>setQuick(q=>({...q,scopeValue:e.target.value}))}>{scopeOptions.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label><label>담당 과목<select aria-label="빠른 배정 과목" value={quickSubjectId} onChange={e=>setQuick(q=>({...q,subjectId:e.target.value}))}>{(plan.subjects||[]).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label><label>주당 시수<input aria-label="빠른 배정 주당 시수" type="number" min="1" max="30" value={quick.hours} onChange={e=>setQuick(q=>({...q,hours:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent?.isComposing){e.preventDefault();addQuickLesson();}}}/></label><label>연속 수업<select aria-label="빠른 배정 연속 수업" value={quick.block} onChange={e=>setQuick(q=>({...q,block:Number(e.target.value)}))}><option value="1">1교시</option><option value="2">2교시</option><option value="3">3교시</option></select></label><label>특별실<select aria-label="빠른 배정 특별실" value={quick.room} onChange={e=>setQuick(q=>({...q,room:e.target.value}))}><option value="">일반 교실</option>{selectedRooms.map(room=><option key={room} value={room}>{room}</option>)}</select></label><button type="button" className="tt-btn primary" disabled={!selectedTeacherId||!scopeOptions.length} onClick={addQuickLesson}><Plus size={15}/> 배정 추가</button></div><p className="tt-quick-tip">추가한 뒤에도 교사·과목·시수는 유지되고, 다음 학급이 선택돼요. 기존 배정은 아래 표에서 수정할 수 있습니다.</p></div></div>}
      {bulkOpen&&<div className="tt-bulk-box"><div><strong>스프레드시트에서 수업 배정표 붙여넣기</strong><p>표 복사 → 엑셀에서 수정 → 아래에 붙여넣기. ID를 보존하면 해당 행을 안전하게 수정할 수 있어요.</p></div><textarea aria-label="수업 배정표 붙여넣기" rows={7} value={bulkText} onChange={e=>setBulkText(e.target.value)} placeholder="ID↹대상↹과목↹교사↹주당시수↹연속교시↹특별실↹공통시간↹고정요일↹고정교시"/><div className="tt-bulk-controls"><label><input type="radio" name="tt-bulk-mode" value="update" checked={bulkMode==='update'} onChange={()=>setBulkMode('update')}/> ID 기준 추가·수정</label><label><input type="radio" name="tt-bulk-mode" value="replace" checked={bulkMode==='replace'} onChange={()=>setBulkMode('replace')}/> 전체 교체</label><span>{clipboardPreview?clipboardPreview.errors.length?`입력 오류 ${clipboardPreview.errors.length}건`:`유효한 입력 ${clipboardPreview.rows.length}행`:'아직 붙여넣은 자료 없음'}</span><button className="tt-btn primary" disabled={!clipboardPreview?.rows.length||!!clipboardPreview.errors.length} onClick={applyBulk}>검증 후 적용</button></div>{clipboardPreview?.errors.length>0&&<div className="tt-bulk-errors" role="alert">{clipboardPreview.errors.slice(0,12).map((x,i)=><p key={i}>{x}</p>)}{clipboardPreview.errors.length>12&&<p>그 밖에 {clipboardPreview.errors.length-12}건의 오류가 있습니다.</p>}</div>}</div>}
      {assignView==='matrix'&&<div className="tt-advanced-toggle"><button type="button" className="tt-btn" onClick={()=>setAdvancedOpen(x=>!x)}><ChevronDown size={15}/> {advancedOpen?'상세 배정표 접기':'상세 배정표 열기 · 특별실/연속수업/활동반 수정'}</button><span>하나의 학급 수업이 여러 묶음으로 분리된 경우 아래에서 수정합니다.</span></div>}
      {(assignView!=='matrix'||advancedOpen)&&<div className="tt-table-scroll"><table className="tt-table tt-assignment-table"><thead><tr><th>담당 교사</th><th>대상 학급</th><th>교과·활동</th><th>주당</th><th>연속</th><th>특별실</th><th>고정·공통</th><th></th></tr></thead><tbody>{shownAssignments.map(d=><tr key={d.id}><td><select aria-label="담당 교사" value={d.teacherId||''} onChange={e=>saveLesson(d.id,{teacherId:e.target.value})}><option value="">미지정</option>{(plan.teachers||[]).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></td><td><select aria-label="수업 대상" value={`${d.scope}:${d.scopeId}`} onChange={e=>{const [scope,scopeId]=e.target.value.split(':');saveLesson(d.id,{scope,scopeId});}}>{scopeOptions.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></td><td><select aria-label="과목" value={d.subjectId} onChange={e=>saveLesson(d.id,{subjectId:e.target.value})}>{(plan.subjects||[]).map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></td><td><input aria-label="주당 시수" type="number" min="1" max="30" value={d.hours} onChange={e=>saveLesson(d.id,{hours:Number(e.target.value)})}/></td><td><select aria-label="연속 수업 길이" value={d.block||1} onChange={e=>saveLesson(d.id,{block:Number(e.target.value)})}><option value="1">1교시</option><option value="2">2교시</option><option value="3">3교시</option></select></td><td><select aria-label="특별실" value={d.room||''} onChange={e=>saveLesson(d.id,{room:e.target.value})}><option value="">일반 교실</option>{selectedRooms.map(s=><option key={s} value={s}>{s}</option>)}</select></td><td><button className="tt-btn slim" onClick={()=>selectRow(d)}>{d.syncKey||d.fixedDay?`${d.syncKey||''} ${d.fixedDay?`${WDAY_NAMES[d.fixedDay]}${d.fixedPeriod}교시`:''}`:'설정'}</button></td><td><button className="tt-icon danger" aria-label="배정 삭제" onClick={()=>saveLessons((cfg.lessons||[]).filter(x=>x.id!==d.id))}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div>}
      {assignView!=='teacher' && assignView!=='matrix'&&!!(plan.teachers||[]).length&&<div className="tt-teacher-summary"><span>교사별 배정 시수</span><div>{(plan.teachers||[]).map(t=><span className="tt-teacher-pill" key={t.id}>{t.label} <b>{byTeacher[t.id]||0}시간</b></span>)}</div></div>}
      {!cfg.lessons?.length&&<div className="tt-empty">아직 수업 배정이 없어요. <b>기본 시간표에서 추출</b>하거나 수업을 하나씩 추가해 주세요.</div>}
      <div className="tt-foot"><span>여러 학급을 같은 시간에 묶으려면 ‘고정·공통’에서 동일한 공통시간 이름을 지정하세요.</span><button className="tt-btn primary" onClick={()=>switchTab('rules')}>다음 · 편성 조건 <ArrowRight size={15}/></button></div>
    </section>}
    {tab==='rules'&&<div className="tt-stack"><section className="tt-panel"><div className="tt-panel-head"><div><h3>요일별 운영 교시</h3><p>요일마다 시작 교시와 종료 교시를 따로 지정할 수 있어요. 예: 수요일 3~7교시. 범위 밖에는 수업을 자동 배정하지 않습니다.</p></div></div><div className="tt-days tt-day-ranges">{weekdays.map(({day,label})=>{
      const range=dayPeriodRange(cfg,day);
      return <div key={day} className="tt-day-range">
        <strong>{label}</strong>
        <div className="tt-range-inputs">
          <label><span>시작</span><select aria-label={`${label} 시작 교시`} value={range.start}
            onChange={e=>changeDayRange(day,'start',Number(e.target.value))}>
            {Array.from({length:12},(_,i)=><option value={i+1} key={i}>{i+1}교시</option>)}
          </select></label>
          <span aria-hidden="true" className="tt-range-dash">~</span>
          <label><span>종료</span><select aria-label={`${label} 종료 교시`} value={range.end}
            onChange={e=>changeDayRange(day,'end',Number(e.target.value))}>
            {Array.from({length:12},(_,i)=><option value={i+1} key={i}>{i+1}교시</option>)}
          </select></label>
        </div>
        <small>운영 {range.end-range.start+1}교시</small>
      </div>;
    })}</div></section>
      <section className="tt-panel"><div className="tt-panel-head"><div><h3>교사 수업 부담 기준</h3><p>충돌 없이 배치하는 것뿐 아니라 교사의 하루 수업 부담도 고려해요. 학교에 맞게 변경할 수 있는 운영 기준이며 법정 기준은 아닙니다.</p></div></div>
        <div className="tt-days tt-quality-settings">
          <label><span>하루 최대 수업</span><select aria-label="교사 하루 최대 수업시수" value={quality.maxDailyLessons} onChange={e=>changeQuality('maxDailyLessons',e.target.value)}>{[3,4,5,6,7].map(n=><option key={n} value={n}>{n}교시</option>)}</select></label>
          <label><span>연속 수업 최대</span><select aria-label="교사 최대 연속 수업시수" value={quality.maxConsecutiveLessons} onChange={e=>changeQuality('maxConsecutiveLessons',e.target.value)}>{[2,3,4,5].map(n=><option key={n} value={n}>{n}교시</option>)}</select></label>
          <label><span>요일별 시수 편차 권장</span><select aria-label="교사 요일별 시수 편차" value={quality.targetDailySpread} onChange={e=>changeQuality('targetDailySpread',e.target.value)}>{[0,1,2,3,4].map(n=><option key={n} value={n}>{n}교시 이내</option>)}</select></label>
        </div><p className="tt-caption">하루·연속 수업 상한은 자동편성에서 필수조건으로 적용하며, 점심시간은 연속 수업을 끊는 휴식으로 계산해요. 요일별 편차는 균형을 맞추는 최적화 목표입니다. 주당 배정시수가 상한을 초과한다면 먼저 교사별 시수를 조정해야 합니다.</p></section>
      <section className="tt-panel"><div className="tt-panel-head"><div><h3>교사별 수업 불가능 시간</h3><p>분홍색 칸을 선택하면 배정하지 않아요. 다시 누르면 해제됩니다.</p></div><select aria-label="교사 선택" value={teacher||(plan.teachers?.[0]?.id||'')} onChange={e=>setTeacher(e.target.value)}>{(plan.teachers||[]).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></div><div className="tt-table-scroll"><table className="tt-grid"><thead><tr><th>교시</th>{weekdays.map(({day,label})=><th key={day}>{label}</th>)}</tr></thead><tbody>{Array.from({length:maxPeriod},(_,i)=>i+1).map(period=><tr key={period}><th>{period}</th>{WDAYS.map(day=>{const id=teacher||(plan.teachers?.[0]?.id||'');const closed=!isOperatingPeriod(cfg,day,period);const isBlocked=unavailable.has(`${id}|${day}|${period}`);return <td key={day}><button disabled={closed||!id} className={`tt-unavailable ${closed?'closed':isBlocked?'blocked':''}`} onClick={()=>toggleUnavailable(id,day,period)} aria-label={`${WDAY_NAMES[day]} ${period}교시 ${isBlocked?'수업 가능으로':'수업 불가능으로'} 변경`}>{closed?'—':isBlocked?'불가':'가능'}</button></td>;})}</tr>)}</tbody></table></div></section>
      <section className="tt-panel"><div className="tt-panel-head"><div><h3>합반·활동반 구성</h3><p>공통 수업을 함께 듣는 학급들을 하나의 활동반으로 묶을 수 있어요. 일부 학생만 참여하는 수준별 분반은 아직 지원하지 않습니다.</p></div></div><div className="tt-chips">{(plan.groups||[]).map(g=><span key={g.id}>{g.label} · {g.classIds?.length||0}학급<button aria-label={`${g.label} 삭제`} onClick={()=>{if((cfg.lessons||[]).some(x=>x.scope==='group'&&x.scopeId===g.id))return notify('수업 배정에 사용 중인 활동반은 삭제할 수 없어요.');editPlan(p=>({...p,groups:(p.groups||[]).filter(x=>x.id!==g.id),weekly:(p.weekly||[]).filter(x=>!(x.scope==='group'&&x.scopeId===g.id))}));}}><X size={13}/></button></span>)}</div><div className="tt-class-checks">{(plan.classes||[]).map(c=><label key={c.id}><input type="checkbox" checked={groupClassIds.includes(c.id)} onChange={e=>setGroupClassIds(a=>e.target.checked?[...a,c.id]:a.filter(x=>x!==c.id))}/>{c.label}</label>)}</div><div className="tt-input-row"><input value={groupLabel} onChange={e=>setGroupLabel(e.target.value)} placeholder="활동반 이름 (예: 1학년 스포츠클럽)" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addGroup();}}}/><button className="tt-btn" onClick={addGroup}><Plus size={15}/> 활동반 추가</button></div></section>
      <section className="tt-panel"><div className="tt-panel-head"><div><h3>특별실</h3><p>같은 특별실에 같은 시간 두 수업이 배정되지 않도록 확인해요.</p></div></div><div className="tt-chips">{selectedRooms.map(s=><span key={s}>{s}<button aria-label={`${s} 삭제`} onClick={()=>{if((cfg.lessons||[]).some(x=>x.room===s))return notify('수업 배정에 사용 중인 특별실은 먼저 수업 배정에서 해제해 주세요.');editPlan(p=>({...p,rooms:(p.rooms||[]).filter(r=>r!==s)}));}}><X size={13}/></button></span>)}</div><div className="tt-input-row"><input aria-label="특별실 이름" placeholder="예: 과학실, 체육관" value={roomInput} onChange={e=>setRoomInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addRoom();}}}/><button className="tt-btn" onClick={addRoom}><Plus size={15}/> 추가</button></div></section><div className="tt-next"><button className="tt-btn primary" onClick={()=>setTab('bell')}>다음 · 일과표 <ArrowRight size={15}/></button></div></div>}
    {tab==='bell'&&<section className="tt-panel"><div className="tt-panel-head"><div><h3>일과표</h3><p>조회·수업·점심·쉬는 시간을 학교에 맞게 수정해요. 일과표 변경은 실제 시간표의 수업시각 표시에 반영됩니다.</p></div><button className="tt-btn" onClick={()=>change('bell',DEFAULT_BELL.map(x=>({...x})))}><RotateCcw size={15}/> 기본값</button></div><BellAutoSetup rows={cfg.bell||DEFAULT_BELL} onApply={rows=>change('bell',rows)}
          disabled={plan.status==='confirmed'}/>
        <div className="tt-table-scroll"><table className="tt-table tt-bell-table"><thead><tr><th>구분</th><th>종류</th><th>시작</th><th>종료</th></tr></thead><tbody>{(cfg.bell||DEFAULT_BELL).map(row=><tr key={row.id}><td><input aria-label={`${row.label} 명칭`} value={row.label} onChange={e=>updateBell(row.id,'label',e.target.value)}/></td><td><span className="tt-kind">{row.type==='lesson'?'수업':row.type==='lunch'?'점심':'일과'}</span></td><td><input aria-label={`${row.label} 시작`} type="time" value={row.start} onChange={e=>updateBell(row.id,'start',e.target.value)}/></td><td><input aria-label={`${row.label} 종료`} type="time" value={row.end} onChange={e=>updateBell(row.id,'end',e.target.value)}/></td></tr>)}</tbody></table></div><div className="tt-note"><Info size={16}/> 교시별 시작·종료 시각은 수업 배정의 충돌 계산과 별도로 관리돼요. 점심·조회는 수업시수에 합산하지 않습니다.</div><div className="tt-foot"><span>특별 운영일·요일교체는 학사일정과 날짜별 변경에서 관리합니다.</span>
      <div className="tt-actions"><button className="tt-btn" type="button" onClick={()=>setTab('variation')}>일과 변동 계산기 <CalendarClock size={15}/></button>
      <button className="tt-btn primary" onClick={()=>setTab('solve')}>다음 · 자동 생성 <ArrowRight size={15}/></button></div></div></section>}
    {tab==='variation'&&<BellChangeCalculator rows={cfg.bell||DEFAULT_BELL} config={cfg}/>}
    {tab==='solve'&&<div className="tt-stack"><section className="tt-panel"><div className="tt-panel-head"><div><h3>제약조건 기반 자동편성</h3><p>교사별 하루 수업 상한·연속수업 제한·요일별 균형과 기존 공통시간·특별실 조건을 함께 고려해 시간표 초안을 만듭니다.</p></div><div className="tt-actions"><button className="tt-btn" onClick={undo} disabled={!cfg.lastApplied}><RotateCcw size={15}/> 적용 전으로 복원</button><button className="tt-btn primary" onClick={createPreview} disabled={busy}>{busy?'편성 중…':'시간표 생성'} <Shuffle size={15}/></button></div></div><div className="tt-stats"><div><span>요청 수업시수</span><strong>{countLessons}시간</strong></div><div><span>배정표</span><strong>{(cfg.lessons||[]).length}개</strong></div><div><span>기존 배치</span><strong>{(plan.weekly||[]).length}칸</strong></div><div><span>제약 오류</span><strong className={inputValidation.errors.length?'danger':''}>{inputValidation.errors.length}건</strong></div></div><div className="tt-input-row"><label>편성안 탐색 <select value={variant} onChange={e=>setVariant(Number(e.target.value))}>{[0,1,2,3].map(i=><option key={i} value={i}>대안 {String.fromCharCode(65+i)}</option>)}</select></label><p>대안을 바꿔 다시 계산할 수 있습니다. 9학급 이상은 서버의 수학적 최적화 엔진에서 계산하며 입력 자료는 저장하지 않습니다.</p></div>{inputValidation.errors.length>0&&<div className="tt-result error"><strong>설정 점검</strong>{inputValidation.errors.slice(0,12).map((e,i)=><p key={i}>{e}</p>)}</div>}{preview&&<Report result={preview}/>}
        {!!workload.total&&<div className="tt-workload-audit"><div className="tt-panel-head"><div><h3>{preview?.ok?'자동편성안 교사 수업 부담':'기존 시간표 교사 수업 부담'}</h3><p>월~금 하루 수업시수와 점심시간 전후의 최대 연속수업을 확인해요. 기존 시간표의 문제는 새로 자동편성하기 전까지 그대로 남아 있습니다.</p></div><strong className={workload.flagged?'tt-workload-warning':'tt-workload-ok'}>{workload.flagged} / {workload.total}명 확인 필요</strong></div><div className="tt-table-scroll"><table className="tt-table tt-workload-table"><thead><tr><th>교사</th>{weekdays.map(({label})=><th key={label}>{label[0]}</th>)}<th>최대 연속</th><th>최대 편차</th><th>확인</th></tr></thead><tbody>{workload.rows.map(row=><tr key={row.id} className={row.issues.length?'tt-workload-flag':''}><th>{row.label}</th>{row.counts.map((n,i)=><td key={i} className={n>quality.maxDailyLessons?'tt-workload-hot':''}>{n}</td>)}<td className={row.maxRun>quality.maxConsecutiveLessons?'tt-workload-hot':''}>{row.maxRun}</td><td className={row.spread>quality.targetDailySpread?'tt-workload-hot':''}>{row.spread}</td><td>{row.issues.length?<span title={row.issues.join(' / ')}>점검</span>:<span>양호</span>}</td></tr>)}</tbody></table></div><p className="tt-caption">※ 담당 시수가 없는 교사는 집계에서 제외돼요. 이 수치는 수업시수만 집계한 것으로, 담임·보직·행정업무·생활지도·출장 등의 노동 부담을 모두 반영한 지표는 아닙니다.</p></div>}
        <div className="tt-actions bottom"><button className="tt-btn primary" disabled={!preview?.ok||!preview.slots.length||preview.inputSignature!==inputSignature||plan.status==='confirmed'} onClick={apply}><Check size={15}/> 이 편성안 적용</button><button className="tt-btn" disabled={!preview?.ok} onClick={()=>exportCsv(`EduPlan_${year}_자동편성_미리보기.csv`,[['요일','교시','학급·활동반','과목','교사','특별실'],...((preview?.slots||[]).map(s=>[WDAY_NAMES[s.weekday],s.period,labelClass(plan,s),labelFor(plan.subjects||[],s.subjectId),labelFor(plan.teachers||[],s.teacherId),s.room]))])}><Download size={15}/> 미리보기 CSV</button></div><p className="tt-caption">초안 생성은 기존 시간표를 변경하지 않습니다. ‘이 편성안 적용’을 눌러야 변경되며, 기존 시간표는 한 번 되돌릴 수 있도록 보관합니다.</p></section>
      <section className="tt-panel"><div className="tt-panel-head"><div><h3>{preview?.ok?'자동편성 미리보기':'현재 기본 시간표'}</h3><p>같은 수업 데이터를 학급·교사·특별실별로 전환하여 확인해요.</p></div><div className="tt-actions"><select aria-label="시간표 조회 방식" value={view} onChange={e=>{setView(e.target.value);setViewId('');}}><option value="class">학급별</option><option value="teacher">교사별</option><option value="room">특별실별</option></select><select aria-label="조회 대상" value={activeId} onChange={e=>setViewId(e.target.value)}>{selectorItems.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></div></div><div className="tt-table-scroll"><table className="tt-grid tt-schedule"><thead><tr><th>교시</th>{weekdays.map(({day,label})=><th key={day}>{label}</th>)}</tr></thead><tbody>{Array.from({length:maxPeriod},(_,i)=>i+1).map(period=><tr key={period}><th>{period}</th>{WDAYS.map(day=>{const s=displayed[`${day}-${period}`],disabled=!isOperatingPeriod(cfg,day,period);return <td key={day} className={disabled?'tt-closed':''}>{disabled?'—':s?<div className="tt-slot"><b>{labelFor(plan.subjects||[],s.subjectId)}</b><small>{view==='class'?labelFor(plan.teachers||[],s.teacherId):labelClass(plan,s)}{s.room?` · ${s.room}`:''}</small></div>:<span className="tt-free">—</span>}</td>;})}</tr>)}</tbody></table></div><div className="tt-foot"><span>세부 수동 편집·교환·보강은 기존 ‘기본 시간표’ 및 ‘날짜별 변경’ 메뉴에서 계속 사용할 수 있어요.</span><button className="tt-btn" onClick={onOpenManual}>기본 시간표 열기 <ArrowRight size={15}/></button></div></section></div>}
    {showDetails&&draft&&<div className="tt-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setShowDetails(false);setDraft(null);}}}><section className="tt-dialog" role="dialog" aria-modal="true" aria-label="고정 시간과 공통시간"><div className="tt-dialog-head"><h3>수업별 상세 조건</h3><button className="tt-icon" aria-label="닫기" onClick={()=>{setDraft(null);setShowDetails(false);}}><X size={18}/></button></div><p>{labelClass(plan,draft)} · {labelFor(plan.subjects||[],draft.subjectId)}</p><label>공통시간 이름 <input placeholder="예: 1학년 금요일 공통활동" value={draft.syncKey||''} onChange={e=>rowChange('syncKey',e.target.value)}/></label><p className="tt-caption">서로 다른 수업 배정 행에 같은 이름을 쓰면 해당 수업들이 같은 교시에 배정돼요. 각 행의 주당 시수와 연속수업 길이는 같아야 합니다.</p><div className="tt-two"><label>첫 묶음 고정 요일<select value={draft.fixedDay||0} onChange={e=>rowChange('fixedDay',Number(e.target.value))}><option value={0}>자동 선택</option>{weekdays.map(({day,label})=><option value={day} key={day}>{label}</option>)}</select></label><label>첫 묶음 시작 교시<select value={draft.fixedPeriod||0} onChange={e=>rowChange('fixedPeriod',Number(e.target.value))}><option value={0}>자동 선택</option>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{i+1}교시</option>)}</select></label></div><div className="tt-dialog-actions"><button className="tt-btn" onClick={()=>{setDraft(null);setShowDetails(false);}}>취소</button><button className="tt-btn primary" onClick={commitDraft}>설정 저장</button></div></section></div>}
  </div>;
}

'use client';
import {useMemo,useState} from 'react';
import {CalendarDays,Table2,BookOpen,GraduationCap,CheckCircle2,AlertTriangle,Plus,Trash2,ChevronLeft,ChevronRight,Download,Layers,ArrowRight,Search,Info,Settings2,Copy, X, Clock, RotateCcw} from 'lucide-react';
import TimetableStudio from './TimetableStudio';
import TimetableChanges from './TimetableChanges';
import {normalizeCurriculum,operationalPlan,COURSE_AREA_LABELS} from '../lib/curriculum';
import {createAcademic,academicStart,academicEnd,iso,parseDate,plusDays,weekday,rangeDates,schoolDay,dayRule,effectiveWeekday,planForDate,classesForSlot,summarizeAcademic,categoryOf,KIND_LABELS,validatePlan,getTerm2Start,instructionForGrade} from '../lib/academic';

const DAY_NAMES=['일','월','화','수','목','금','토'];
const WEEKDAYS=[1,2,3,4,5];
const TABS=[['automatic','자동편성',Layers],['overview','편성 개요',Layers],['calendar','학사일 편성',CalendarDays],['curriculum','교육과정·시수',BookOpen],['timetable','기본 시간표',Table2],['exceptions','날짜별 변경',Clock],['audit','편성 점검',CheckCircle2]];
const RULE_TYPES=[['instruction','수업일'],['holiday','공휴일·대체공휴일'],['vacation','방학'],['closed','재량휴업·휴업일']];
const KEYS=['subject','creative_self','creative_club','creative_career','autonomous'];
const titleOf=(x)=>x?.label||'미지정';
const newId=()=>`acad-${Math.random().toString(36).slice(2,10)}`;
const displayDate=date=>date?date.replaceAll('-','.'):'';
const dateInYear=(year,date)=>date>=academicStart(year)&&date<=academicEnd(year);
function saveFile(filename,text,type='text/csv;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
const csv=rows=> '\ufeff'+rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\r\n');
function SegTabs({value,onChange,mode}){return <div className="academic-tabs">{TABS.filter(([id])=>mode==='curriculum'?['curriculum','audit'].includes(id):mode==='timetable'?['automatic','timetable','exceptions','audit'].includes(id):true).map(([id,title,Icon])=><button key={id} type="button" onClick={()=>onChange(id)} className={value===id?'selected':''}><Icon size={16}/>{title}</button>)}</div>}
function AStat({label,value,detail,tone=''}){return <div className={`academic-stat ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>}
function Intro({eyebrow,title,desc,children}){return <div className="academic-section-intro"><div><span>{eyebrow}</span><h2>{title}</h2><p>{desc}</p></div>{children}</div>}
function Empty({children}){return <div className="academic-empty">{children}</div>}
function TextField({label,children}){return <label className="academic-field"><span>{label}</span>{children}</label>}
function classNameFor(plan,id){return plan.classes.find(x=>x.id===id)?.label||plan.groups.find(x=>x.id===id)?.label||id;}

export default function AcademicPlanner({schoolName,space,updateSpace,notify,onOpenCalendar,onOpenCurriculum,onDirtyChange,mode='curriculum'}){
  const planYears=Object.keys(space.academics||{}).map(Number).sort((a,b)=>b-a);
  const [year,setYear]=useState(()=>planYears[0]||new Date().getFullYear()-(new Date().getMonth()<2?1:0));
  const plan=useMemo(()=>space.academics?.[String(year)]||createAcademic(year),[space.academics,year]);
  const [tab,setTab]=useState(mode==='timetable'?'automatic':'curriculum');
  const [month,setMonth]=useState(`${year}-03`);
  const [selectedDate,setSelectedDate]=useState(`${year}-03-02`);
  const [newYear,setNewYear]=useState('2028');
  const [duplicateYear,setDuplicateYear]=useState(true);
  const [batch,setBatch]=useState({start:`${year}-07-26`,end:`${year}-08-15`,kind:'vacation',label:'여름방학'});
  const [dayEdit,setDayEdit]=useState(null);
  const [activityTitle,setActivityTitle]=useState('');
  const [activityKind,setActivityKind]=useState('subject');
  const [classGrade,setClassGrade]=useState('1');
  const [classLabel,setClassLabel]=useState('');
  const [scope,setScope]=useState('class');
  const [scopeId,setScopeId]=useState('g1c1');
  const [maxPeriod,setMaxPeriod]=useState(7);
  const [slotEditor,setSlotEditor]=useState(null);
  const [slotDraft,setSlotDraft]=useState(null);
  const [teacherName,setTeacherName]=useState('');
  const [groupName,setGroupName]=useState('');
  const [groupClasses,setGroupClasses]=useState([]);
  const [overrideDraft,setOverrideDraft]=useState({date:`${year}-03-02`,scope:'class',scopeId:'g1c1',period:5,action:'replace',subjectId:'creative-self',teacherId:'',room:'',note:''});
  const summary=useMemo(()=>summarizeAcademic(plan,space.events||[]),[plan,space.events]);
  const linkedCurriculum=useMemo(()=>operationalPlan(space.curricula,year),[space.curricula,year]);
  const linkedCourses=useMemo(()=>normalizeCurriculum(space.curricula).courses,[space.curricula]);
  const term2Start=getTerm2Start(plan);
  const subjectById=useMemo(()=>Object.fromEntries(plan.subjects.map(s=>[s.id,s])),[plan.subjects]);
  const teacherById=useMemo(()=>Object.fromEntries((plan.teachers||[]).map(t=>[t.id,t])),[plan.teachers]);
  const activeStaff=(space.staffMembers||[]).filter(x=>x.status==='재직');
  const dateSlots=useMemo(()=>planForDate(plan,selectedDate,space.events||[]),[plan,selectedDate,space.events]);
  const activeDateRule=dayEdit||dayRule(selectedDate,plan.dayRules)||{date:selectedDate,kind:weekday(selectedDate)===0||weekday(selectedDate)===6?'closed':'instruction',label:'',weekdayOverride:0};
  const availableScope=scope==='class'?plan.classes:plan.groups;
  const scopeOptions=[...plan.classes.map(c=>({value:`class:${c.id}`,label:c.label})),...plan.groups.map(g=>({value:`group:${g.id}`,label:`활동반 · ${g.label}`}))];
  const allYearDates=useMemo(()=>rangeDates(academicStart(plan.year),academicEnd(plan.year)),[plan.year]);
  const dateEvents=(space.events||[]).filter(e=>e.date===selectedDate);

  const editPlan=(mutator,message)=>{
    if(plan.status==='confirmed'){notify('확정된 편성안입니다. 상단에서 편성 재개를 먼저 선택하세요.');return;}
    updateSpace(s=>{const old=s.academics?.[String(year)]||createAcademic(year);const next=mutator(old);return {...s,academics:{...(s.academics||{}),[String(year)]:next}};});
    if(message)notify(message);
  };
  const setPlanStatus=status=>updateSpace(s=>{const old=s.academics?.[String(year)]||createAcademic(year);return {...s,academics:{...(s.academics||{}),[String(year)]:{...old,status,confirmedAt:status==='confirmed'?new Date().toISOString():null}}};});
  const chooseYear=y=>{setYear(y);setMonth(`${y}-03`);setSelectedDate(`${y}-03-02`);setTab(mode==='timetable'?'automatic':'curriculum');setSlotEditor(null);setDayEdit(null);setOverrideDraft(x=>({...x,date:`${y}-03-02`}));setBatch({start:`${y}-07-26`,end:`${y}-08-15`,kind:'vacation',label:'여름방학'});};
  const addYear=()=>{
    const y=Number(newYear);
    if(!Number.isInteger(y)||y<2020||y>2100){notify('2020~2100 사이의 학년도를 입력해 주세요.');return;}
    if((space.academics||{})[String(y)]||(!planYears.length&&y===2027)){notify('이미 존재하는 학년도입니다.');return;}
    const newPlan=createAcademic(y);
    if(duplicateYear){newPlan.classes=plan.classes.map(x=>({...x}));newPlan.subjects=plan.subjects.map(x=>({...x}));newPlan.teachers=(plan.teachers||[]).map(x=>({...x}));newPlan.groups=(plan.groups||[]).map(x=>({...x,classIds:[...x.classIds]}));newPlan.weekly=plan.weekly.map(x=>({...x}));newPlan.targets=(plan.targets||[]).map(x=>({...x}));newPlan.targetDays=plan.targetDays;}
    updateSpace(s=>({...s,academics:{...(s.academics||{}),[String(y)]:newPlan}}));chooseYear(y);notify(`${y}학년도 편성안을 만들었습니다.`);
  };
  const changeMonth=diff=>{let [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+diff,1,12));const next=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;if(next>=`${year}-03`&&next<=`${year+1}-02`)setMonth(next);};
  const cells=useMemo(()=>{
    const [y,m]=month.split('-').map(Number),start=iso(new Date(Date.UTC(y,m-1,1,12)));const first=weekday(start);
    return Array.from({length:42},(_,i)=>{
      const date=plusDays(start,i-first);
      return {date,active:date.slice(0,7)===month,inYear:dateInYear(year,date),rule:dayRule(date,plan.dayRules),events:space.events?.filter(e=>e.date===date)||[],school:schoolDay(date,plan.dayRules)};
    });
  },[month,year,plan.dayRules,space.events]);
  const selectedScope=availableScope.find(x=>x.id===scopeId)||availableScope[0];
  const selectedScopeId=selectedScope?.id;
  const showSlotEditor=(wd,period)=>{
    if(!selectedScopeId)return;
    const current=plan.weekly.find(s=>s.scope===scope&&s.scopeId===selectedScopeId&&s.weekday===wd&&s.period===period);
    setSlotEditor({weekday:wd,period,scope,scopeId:selectedScopeId});
    setSlotDraft(current?{...current}:{subjectId:'',teacherId:'',room:''});
  };
  const saveSlot=()=>{
    if(!slotEditor)return;
    const entry={...slotDraft,scope:slotEditor.scope,scopeId:slotEditor.scopeId,weekday:slotEditor.weekday,period:slotEditor.period,id:newId()};
    editPlan(p=>({...p,timetableConfigured:true,weekly:[...p.weekly.filter(x=>!(x.scope===entry.scope&&x.scopeId===entry.scopeId&&x.weekday===entry.weekday&&x.period===entry.period)),...(entry.subjectId?[entry]:[])]}),'기본 시간표를 변경했습니다.');
    setSlotEditor(null);
  };
  const setDayRule=()=>{
    const rule={date:selectedDate,kind:activeDateRule.kind,label:activeDateRule.label||'',weekdayOverride:Number(activeDateRule.weekdayOverride)||0};
    editPlan(p=>({...p,dayRules:[...p.dayRules.filter(r=>r.date!==selectedDate),rule]}),'학사일 설정을 저장했습니다.');setDayEdit(null);
  };
  const applyRange=()=>{
    if(!dateInYear(year,batch.start)||!dateInYear(year,batch.end)||batch.start>batch.end){notify('학년도 범위 안에서 시작일·종료일을 설정하세요.');return;}
    const dates=rangeDates(batch.start,batch.end);
    editPlan(p=>({...p,dayRules:[...p.dayRules.filter(r=>!dates.includes(r.date)),...dates.map(date=>({date,kind:batch.kind,label:batch.label||'',weekdayOverride:0}))]}),`${dates.length}일의 학사일 설정을 변경했습니다.`);
  };
  const addClass=()=>{
    const grade=Number(classGrade),label=classLabel.trim();if(!label){notify('학급명을 입력해 주세요.');return;}
    editPlan(p=>({...p,classes:[...p.classes,{id:newId(),grade,label}]}),'학급을 추가했습니다.');setClassLabel('');
  };
  const deleteClass=id=>{
    if(!window.confirm('학급을 삭제할까요? 이 학급의 시간표와 특별 운영 기록도 삭제됩니다.'))return;
    editPlan(p=>({...p,classes:p.classes.filter(c=>c.id!==id),weekly:p.weekly.filter(s=>!(s.scope==='class'&&s.scopeId===id)),overrides:p.overrides.filter(s=>!(s.scope==='class'&&s.scopeId===id)),groups:p.groups.map(g=>({...g,classIds:g.classIds.filter(x=>x!==id)}))}),'학급을 삭제했습니다.');
  };
  const importCurriculumCourses=()=>{
    const active=linkedCourses.filter(c=>linkedCurriculum.grades.some(g=>g.ready&&g.semesters.some(t=>Number(g.cohort?.terms?.[t.key]?.[c.id])>0)));
    if(!active.length){notify('먼저 교육과정 편성 메뉴에서 해당 학년도 교육과정을 입력해 주세요.');return;}
    const normalizeLabel=v=>String(v||'').replace(/\s+/g,'').replace(/[·()]/g,'');
    let added=0;
    editPlan(p=>{
      const found=new Set(p.subjects.map(s=>normalizeLabel(s.label)));
      const next=[...p.subjects];
      for(const c of active){
        if(found.has(normalizeLabel(c.name)))continue;
        const kind=c.area==='creative_club'&&c.name.includes('스포츠')?'sports':c.area;
        next.push({id:`curr-${c.id}`,label:c.name,kind});found.add(normalizeLabel(c.name));added++;
      }
      return {...p,subjects:next,timetableConfigured:p.timetableConfigured||false};
    },'교육과정의 교과·활동 목록을 시간표 항목에 연결했습니다.');
    if(added===0)notify('현재 교육과정 과목이 시간표 목록에 이미 있습니다.');
  };
  const addActivity=()=>{
    if(!activityTitle.trim())return notify('교육과정 영역 또는 과목명을 입력해 주세요.');
    editPlan(p=>({...p,subjects:[...p.subjects,{id:newId(),label:activityTitle.trim(),kind:activityKind}]}),'편성 항목을 추가했습니다.');setActivityTitle('');
  };
  const setTarget=(grade,subjectId,hours)=>editPlan(p=>({...p,targets:[...p.targets.filter(x=>!(x.grade===grade&&x.subjectId===subjectId)),{grade,subjectId,hours:Number(hours)||0}]}));
  const addTeacher=()=>{
    if(!teacherName.trim())return;editPlan(p=>({...p,teachers:[...(p.teachers||[]),{id:newId(),label:teacherName.trim()}]}),'교사를 추가했습니다.');setTeacherName('');
  };
  const importStaff=()=>{
    if(!activeStaff.length){notify('관리자 설정에서 재직 교원을 먼저 등록해 주세요.');return;}
    editPlan(p=>{const teachers=[...(p.teachers||[])];for(const member of activeStaff){const index=teachers.findIndex(t=>t.id===member.id);const record={id:member.id,label:member.name};if(index>=0)teachers[index]=record;else teachers.push(record);}return {...p,teachers};},'학교 교원 목록을 시간표 편성에 반영했습니다. 기존 시간표 배정은 유지됩니다.');
  };
  const addGroup=()=>{
    if(!groupName.trim()||!groupClasses.length){notify('활동반 이름과 참여 학급을 지정해 주세요.');return;}
    editPlan(p=>({...p,groups:[...p.groups,{id:newId(),label:groupName.trim(),classIds:[...groupClasses]}]}),'활동반을 추가했습니다.');setGroupName('');setGroupClasses([]);
  };
  const removeGroup=id=>{
    if(!window.confirm('활동반과 해당 활동반의 시간표를 삭제할까요?'))return;
    editPlan(p=>({...p,groups:p.groups.filter(g=>g.id!==id),weekly:p.weekly.filter(s=>!(s.scope==='group'&&s.scopeId===id)),overrides:p.overrides.filter(s=>!(s.scope==='group'&&s.scopeId===id))}),'활동반을 삭제했습니다.');
  };
  const saveOverride=()=>{
    if(!dateInYear(year,overrideDraft.date)||overrideDraft.period<1||overrideDraft.period>12){notify('날짜와 교시를 확인하세요.');return;}
    if(overrideDraft.action==='replace'&&!overrideDraft.subjectId){notify('대체 활동을 선택해 주세요.');return;}
    if(!overrideDraft.scopeId){notify('편성 대상을 선택하세요.');return;}
    const entry={...overrideDraft,period:Number(overrideDraft.period),id:newId()};
    editPlan(p=>({...p,overrides:[...p.overrides.filter(x=>!(x.date===entry.date&&x.scope===entry.scope&&x.scopeId===entry.scopeId&&x.period===entry.period)),entry]}),'해당 날짜의 변경 사항을 저장했습니다.');
    setSelectedDate(entry.date);setMonth(entry.date.slice(0,7));
  };
  const deleteOverride=id=>editPlan(p=>({...p,overrides:p.overrides.filter(s=>s.id!==id)}),'날짜별 변경을 삭제했습니다.');
  const saveCsv=()=>{
    const rows=[['학년도','학급','교과/영역','교육과정 분류','예상 편성시수','목표시수','차이']];
    for(const c of plan.classes){for(const a of plan.subjects){const hours=summary.totals[c.id]?.bySubject[a.id]||0;const target=plan.targets.find(t=>t.grade===c.grade&&t.subjectId===a.id)?.hours||0;if(hours||target)rows.push([year,c.label,a.label,KIND_LABELS[a.kind],hours,target,target?hours-target:'']);}}
    saveFile(`EduPlan_${year}_교육과정_예상시수.csv`,csv(rows));
  };
  const saveScheduleCsv=()=>{
    const rows=[['날짜','학기','학급','교시','운영 과목/활동','교육과정 분류','교사','장소','기본/변경']];
    for(const date of allYearDates){for(const s of planForDate(plan,date,space.events||[])){for(const cid of classesForSlot(plan,s)){rows.push([date,!term2Start?'미설정':date<term2Start?1:2,classNameFor(plan,cid),s.period,s.activityLabel||subjectById[s.subjectId]?.label||'',KIND_LABELS[subjectById[s.subjectId]?.kind]||'',teacherById[s.teacherId]?.label||'',s.room||'',s.source==='event'?'행사':s.source==='override'?'변경':'기본']);}}}
    saveFile(`EduPlan_${year}_예상운영시간표.csv`,csv(rows));
  };
  const savePlanJson=()=>saveFile(`EduPlan_${year}_학사편성안.json`,JSON.stringify({format:'eduplan-academic-v1',year,plan},null,2),'application/json');
  const calendarMonthIsFuture=month===`${year+1}-02`;

  return <div className="academic-wrap">
    <div className="academic-hero academic-hero-compact">
      <div className="academic-hero-actions"><select aria-label="학년도 선택" value={year} onChange={e=>chooseYear(Number(e.target.value))}><option value={year}>{year}학년도</option>{planYears.filter(y=>y!==year).map(y=><option value={y} key={y}>{y}학년도</option>)}</select><span className={`academic-status ${plan.status==='confirmed'?'confirmed':''}`}>{plan.status==='confirmed'?'확정 표시됨':'편성 초안'}</span></div>
    </div>
    <details className="academic-help"><summary><Info size={16}/> 시간표 데이터 및 계산 안내</summary><p>공휴일·학사일은 학사일정에서 관리합니다. 교시와 영역을 지정한 행사는 날짜별 시간표에 반영됩니다. 법정 수업시수 자동 검증은 제공하지 않으므로 실제 적용 전 확인해 주세요.</p></details>
    <SegTabs value={tab} onChange={setTab} mode={mode}/>
    {mode==='timetable'&&<div className="academic-curriculum-bridge"><div><BookOpen size={19}/><div><strong>{year}학년도 교육과정 계획 연결</strong><small>{linkedCurriculum.grades.filter(g=>g.ready).length}/3학년 편성 자료 연결 · 교육과정 시수는 입학 연도별 계획에서 자동 조회</small></div></div><div><button type="button" onClick={importCurriculumCourses}><Plus size={14}/> 교육과정 과목 가져오기</button><button type="button" onClick={onOpenCurriculum}><ArrowRight size={14}/> 교육과정 편성으로</button></div></div>}
    {tab==='overview'&& <div className="academic-content">
      <Intro eyebrow="OVERVIEW" title={`${year}학년도 편성 현황`} desc="시간표 없이 학사일부터 편성할 수 있습니다. 시수는 등록된 시간표를 기준으로 예상 계산합니다."/>
      <div className="academic-stat-row"><AStat label="현재 계산된 수업일수" value={`${summary.daysTotal}일`} detail={`설정 목표 ${plan.targetDays}일 · 학년도 휴업 설정에 따라 변동`} tone={summary.daysTotal<plan.targetDays?'red':''}/><AStat label="1학기 수업일" value={term2Start?`${summary.firstTerm}일`:'—'} detail={term2Start?`${academicStart(year)} ~ ${plusDays(term2Start,-1)}`:'여름방학 미설정'}/><AStat label="2학기 수업일" value={term2Start?`${summary.secondTerm}일`:'—'} detail={term2Start?`${term2Start} ~ ${academicEnd(year)}`:'여름방학 후 자동 계산'}/><AStat label="편성 대상 학급" value={`${plan.classes.length}개`} detail={`${plan.groups.length}개 활동반 · ${plan.weekly.length}개 기본 시간표 칸`}/></div>
      <div className="academic-card-grid">
        <section className="academic-card"><h3>편성 기본값</h3><div className="academic-form-grid"><TextField label="2학기 개학일 (자동)"><input type="text" readOnly value={term2Start||"여름방학 편성 후 자동 계산"}/></TextField><TextField label="학교 수업일수 목표"><input type="number" min="1" max="366" value={plan.targetDays} onChange={e=>editPlan(p=>({...p,targetDays:Math.min(366,Math.max(1,Number(e.target.value)||190))}))}/></TextField></div><p className="academic-muted">학교급·교육과정별 법령 기준을 자동 판정하지 않습니다. 학교가 확정한 운영 기준을 입력해 주세요.</p><div className="academic-button-row"><button className="academic-button primary" onClick={()=>onOpenCalendar?.()}><CalendarDays size={16}/> 학사일정 메뉴 열기 <ArrowRight size={15}/></button><button className="academic-button" onClick={()=>setTab('timetable')}><Table2 size={16}/> 시간표 편성</button></div></section>
        <section className="academic-card"><h3>편성안 관리</h3><p className="academic-muted">확정은 현재 작업공간 내 상태 표시만 변경합니다. 기존 학사력에 자동 게시되지는 않습니다.</p>{plan.status==='confirmed'?<button className="academic-button" onClick={()=>{setPlanStatus('draft');notify('편성을 다시 시작했습니다.');}}><RotateCcw size={16}/> 편성 재개</button>:<button className="academic-button primary" onClick={()=>{const error=validatePlan(plan);if(error)return notify(error);if(summary.daysTotal<plan.targetDays)return notify('수업일수가 목표보다 부족합니다. 점검 후 확정하세요.');if(!window.confirm('편성안을 확정 표시할까요? 확정 후에는 편성 재개해야 수정할 수 있습니다.'))return;setPlanStatus('confirmed');notify('편성안을 확정 표시했습니다.');}}><CheckCircle2 size={16}/> 편성안 확정 표시</button>}<div className="academic-separator"/><h4>다른 학년도 만들기</h4><div className="academic-form-grid"><TextField label="새 학년도"><input type="number" min="2020" max="2100" value={newYear} onChange={e=>setNewYear(e.target.value)}/></TextField><div className="academic-field"><span>설정 복사</span><label className="academic-checkbox"><input type="checkbox" checked={duplicateYear} onChange={e=>setDuplicateYear(e.target.checked)}/> 학급·시간표·시수 기준 복사</label></div></div><button className="academic-button" onClick={addYear}><Plus size={16}/> 학년도 추가</button><p className="academic-muted">새 학년도에는 기존 휴업일과 날짜별 변경 기록을 복사하지 않습니다.</p></section>
      </div>
      <section className="academic-card"><h3>편성 절차</h3><div className="academic-flow">{TABS.slice(1).map(([id,label,Icon],i)=><button key={id} onClick={()=>setTab(id)}><span>{String(i+1).padStart(2,'0')}</span><Icon size={19}/><strong>{label}</strong><ArrowRight size={15}/></button>)}</div></section>
    </div>}
    {tab==='calendar'&&<div className="academic-content">
      <Intro eyebrow="ACADEMIC CALENDAR" title="학사일 편성" desc="휴업일·방학·추가 수업일·요일교체를 설정합니다. 시간표가 없어도 수업일수를 계산합니다."/>
      <div className="academic-stat-row small"><AStat label="연간 예상 수업일수" value={`${summary.daysTotal}일`} detail={`목표 ${plan.targetDays}일`}/><AStat label="1학기" value={term2Start?`${summary.firstTerm}일`:'—'} detail="학교 전체 기준"/><AStat label="2학기" value={term2Start?`${summary.secondTerm}일`:'—'} detail="학교 전체 기준"/></div>
      <div className="academic-layout"><section className="academic-card academic-month-card"><div className="academic-month-head"><h3>{month.slice(0,4)}년 {Number(month.slice(5))}월</h3><div><button aria-label="이전 달" onClick={()=>changeMonth(-1)} disabled={month===`${year}-03`}><ChevronLeft size={18}/></button><button onClick={()=>setMonth(`${year}-03`)}>3월</button><button aria-label="다음 달" onClick={()=>changeMonth(1)} disabled={calendarMonthIsFuture}><ChevronRight size={18}/></button></div></div><div className="academic-calendar-grid">{DAY_NAMES.map(x=><span className="academic-day-name" key={x}>{x}</span>)}{cells.map((x,i)=><button key={`${x.date}-${i}`} disabled={!x.inYear} className={`academic-date ${x.active?'':'outside'} ${x.date===selectedDate?'active':''} ${x.school?'instruction':'closed'} ${x.rule?.kind==='vacation'?'vacation':''}`} onClick={()=>{setSelectedDate(x.date);setDayEdit(null);setOverrideDraft(d=>({...d,date:x.date}));}}><strong>{Number(x.date.slice(-2))}</strong>{x.rule&&<small>{x.rule.label||RULE_TYPES.find(r=>r[0]===x.rule.kind)?.[1]}</small>}{!x.rule&&x.school&&<small className="academic-default-text">수업일</small>}{x.events.length>0&&<span className="academic-event-dot">행사 {x.events.length}</span>}</button>)}</div><div className="academic-legend"><span><i className="normal"/> 수업일</span><span><i className="vacation"/> 방학</span><span><i className="closed"/> 휴업일</span></div></section>
      <section className="academic-card academic-day-panel"><h3>{displayDate(selectedDate)} <small>{DAY_NAMES[weekday(selectedDate)]}요일</small></h3><p className="academic-muted">학교 공통 학사일 기준</p><TextField label="운영 구분"><select value={activeDateRule.kind} onChange={e=>setDayEdit({...activeDateRule,kind:e.target.value})}>{RULE_TYPES.map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></TextField><TextField label="내용 및 사유"><input value={activeDateRule.label} placeholder="예: 개학식, 방학, 재량휴업" onChange={e=>setDayEdit({...activeDateRule,label:e.target.value})}/></TextField><TextField label="적용할 기본 시간표 요일 (요일교체)"><select value={activeDateRule.weekdayOverride||0} onChange={e=>setDayEdit({...activeDateRule,weekdayOverride:Number(e.target.value)})}><option value={0}>실제 요일 그대로</option>{WEEKDAYS.map(d=><option key={d} value={d}>{DAY_NAMES[d]}요일 시간표</option>)}</select></TextField><div className="academic-button-row"><button className="academic-button primary" onClick={setDayRule}>선택 날짜 저장</button><button className="academic-button" disabled={!dayRule(selectedDate,plan.dayRules)} onClick={()=>{editPlan(p=>({...p,dayRules:p.dayRules.filter(r=>r.date!==selectedDate)}),'기본 운영일 규칙으로 되돌렸습니다.');setDayEdit(null);}}>기본값 복원</button></div><div className="academic-side-events"><strong>같은 날짜에 등록된 학사행사</strong>{dateEvents.length?dateEvents.map(x=><span key={x.id}>{x.name} · {x.department}</span>):<span>등록된 행사가 없습니다.</span>}<button className="academic-text-button" onClick={()=>onOpenCalendar(selectedDate)}>학사력에서 행사 관리 <ArrowRight size={14}/></button></div></section></div>
      <section className="academic-card"><h3>기간 일괄 설정</h3><p className="academic-muted">방학, 재량휴업, 여러 날짜의 수업일 지정 등에 사용합니다. 기존 해당 날짜 설정을 대체하므로 적용 범위를 확인하세요.</p><div className="academic-form-grid cols-five"><TextField label="시작일"><input type="date" value={batch.start} min={academicStart(year)} max={academicEnd(year)} onChange={e=>setBatch(b=>({...b,start:e.target.value}))}/></TextField><TextField label="종료일"><input type="date" value={batch.end} min={academicStart(year)} max={academicEnd(year)} onChange={e=>setBatch(b=>({...b,end:e.target.value}))}/></TextField><TextField label="운영 구분"><select value={batch.kind} onChange={e=>setBatch(b=>({...b,kind:e.target.value}))}>{RULE_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></TextField><TextField label="일괄 표시명"><input value={batch.label} onChange={e=>setBatch(b=>({...b,label:e.target.value}))}/></TextField><button className="academic-button primary" onClick={applyRange}>일괄 반영</button></div></section>
    </div>}
    {tab==='curriculum'&&<div className="academic-content">
      <Intro eyebrow="CURRICULUM" title="교육과정·시수 설정" desc="교과·창체·학교자율시간의 종류와 학년별 목표시수를 정합니다. 스포츠클럽은 창체 동아리의 세부 집계로 처리합니다."/>
      <section className="academic-card"><div className="academic-card-header"><h3>학년·학급 구성</h3><span>{plan.classes.length}학급</span></div><div className="academic-class-chips">{plan.classes.map(c=><span key={c.id}>{c.label}<button aria-label={`${c.label} 삭제`} onClick={()=>deleteClass(c.id)}><X size={13}/></button></span>)}</div><div className="academic-inline-form"><select value={classGrade} onChange={e=>setClassGrade(e.target.value)}><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select><input placeholder="예: 1학년 3반" value={classLabel} onChange={e=>setClassLabel(e.target.value)}/><button className="academic-button" onClick={addClass}><Plus size={16}/> 학급 추가</button></div></section>
      <section className="academic-card"><div className="academic-card-header"><h3>교육과정 영역과 목표시수</h3><span>빈칸 또는 0은 검증 기준 미설정</span></div><div className="academic-scroll"><table className="academic-table"><thead><tr><th>과목·활동</th><th>분류</th><th>1학년 목표</th><th>2학년 목표</th><th>3학년 목표</th><th>작업</th></tr></thead><tbody>{plan.subjects.map(a=><tr key={a.id}><td><strong>{a.label}</strong>{a.kind==='sports'&&<small>동아리 활동에 포함</small>}</td><td><select aria-label={`${a.label} 시수 분류`} value={a.kind} onChange={e=>editPlan(p=>({...p,subjects:p.subjects.map(s=>s.id===a.id?{...s,kind:e.target.value}:s)}))}>{Object.entries(KIND_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></td>{[1,2,3].map(g=><td key={g}><input type="number" min="0" max="1400" aria-label={`${g}학년 ${a.label} 목표시수`} value={plan.targets.find(t=>t.grade===g&&t.subjectId===a.id)?.hours??''} placeholder="—" onChange={e=>setTarget(g,a.id,e.target.value)}/></td>)}<td><button className="academic-icon-action" aria-label={`${a.label} 삭제`} onClick={()=>{if(plan.weekly.some(w=>w.subjectId===a.id)||plan.overrides.some(w=>w.subjectId===a.id)){notify('시간표에 편성된 항목은 먼저 시간표에서 지워 주세요.');return;}editPlan(p=>({...p,subjects:p.subjects.filter(s=>s.id!==a.id),targets:p.targets.filter(t=>t.subjectId!==a.id)}),'교육과정 항목을 삭제했습니다.');}}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div><div className="academic-inline-form"><input value={activityTitle} onChange={e=>setActivityTitle(e.target.value)} placeholder="새 교과·활동명"/><select value={activityKind} onChange={e=>setActivityKind(e.target.value)}>{Object.entries(KIND_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><button className="academic-button primary" onClick={addActivity}><Plus size={16}/> 항목 추가</button></div><p className="academic-muted">연간 최소 법정 시수의 자동 판정이 아니라 사용자가 입력한 목표 대비 예상 편성을 비교합니다. 교과군별 인정 기준과 실제 운영 기준은 학교에서 별도로 확인해야 합니다.</p></section>
    </div>}
    {tab==='automatic'&&mode==='timetable'&&<TimetableStudio plan={plan} space={space} editPlan={editPlan} notify={notify} year={year} onOpenManual={()=>setTab('timetable')} onDirtyChange={onDirtyChange}/>}
    {tab==='timetable'&&<div className="academic-content">
      <Intro eyebrow="RECURRING TIMETABLE" title="기본 시간표 편성" desc="시간표 자체가 매주 반복되는 창체·스포츠클럽 운영 계획입니다. 별도의 반복 창체 메뉴는 필요하지 않습니다."/>
      <div className="academic-layout timetable-layout"><section className="academic-card"><div className="academic-card-header"><h3>반복 시간표</h3><select value={`${scope}:${selectedScopeId||''}`} onChange={e=>{const [type,...parts]=e.target.value.split(':');setScope(type);setScopeId(parts.join(':'));}}>{plan.classes.map(c=><option value={`class:${c.id}`} key={c.id}>{c.label}</option>)}{plan.groups.map(g=><option value={`group:${g.id}`} key={g.id}>활동반 · {g.label}</option>)}</select></div><div className="academic-card-tools"><label>표시 교시 <select value={maxPeriod} onChange={e=>setMaxPeriod(Number(e.target.value))}>{[5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>{n}교시까지</option>)}</select></label><small>칸을 눌러 과목·활동·지도교사·장소를 설정하세요.</small></div><div className="academic-scroll"><table className="academic-table academic-schedule"><thead><tr><th>교시</th>{WEEKDAYS.map(d=><th key={d}>{DAY_NAMES[d]}</th>)}</tr></thead><tbody>{Array.from({length:maxPeriod},(_,i)=>i+1).map(period=><tr key={period}><th>{period}교시</th>{WEEKDAYS.map(d=>{const slot=plan.weekly.find(s=>s.weekday===d&&s.period===period&&s.scope===scope&&s.scopeId===selectedScopeId);const subject=subjectById[slot?.subjectId];return <td key={d}><button className={`academic-schedule-slot ${slot?'filled':''} ${subject?.kind==='sports'?'sport':''} ${subject?.kind?.startsWith('creative')?'creative':''}`} onClick={()=>showSlotEditor(d,period)} disabled={!selectedScopeId}>{slot?<><strong>{subject?.label||'삭제된 항목'}</strong><small>{teacherById[slot.teacherId]?.label||slot.room||'과목 설정'}</small></>:<><Plus size={14}/><small>배정</small></>}</button></td>;})}</tr>)}</tbody></table></div><div className="academic-notice soft"><Info size={16}/><span>활동반 시간표와 학급 시간표가 같은 교시에 겹치면 편성 점검에서 중복 경고를 표시합니다. 활동반 수업은 참여 학급 각각에 한 번씩 집계됩니다.</span></div></section>
      <section className="academic-side-stack"><div className="academic-card"><h3>지도교사 목록</h3><div className="academic-staff-sync"><button className="academic-button" type="button" onClick={importStaff}>교원 관리에서 재직 교원 가져오기 ({activeStaff.length}명)</button><small>기존 시간표 배정은 보존하며, 동일 교원의 표시명만 동기화합니다.</small></div><div className="academic-class-chips">{(plan.teachers||[]).map(t=><span key={t.id}>{t.label}<button aria-label={`${t.label} 삭제`} onClick={()=>{if(plan.weekly.some(w=>w.teacherId===t.id)||plan.overrides.some(w=>w.teacherId===t.id)){notify('시간표에 배정된 교사는 삭제할 수 없습니다.');return;}editPlan(p=>({...p,teachers:p.teachers.filter(x=>x.id!==t.id)}));}}><X size={12}/></button></span>)}</div><div className="academic-inline-form"><input placeholder="교사 표시명" value={teacherName} onChange={e=>setTeacherName(e.target.value)}/><button className="academic-button" onClick={addTeacher}><Plus size={16}/></button></div></div>
      <div className="academic-card"><h3>학급 혼합 활동반</h3><p className="academic-muted">스포츠클럽 분산 운영처럼 여러 학급이 참여하는 활동반을 별도로 만들 수 있습니다.</p><div className="academic-group-list">{plan.groups.map(g=><div key={g.id} className="academic-group"><strong>{g.label}</strong><small>{g.classIds.map(id=>classNameFor(plan,id)).join(' · ')}</small><button onClick={()=>removeGroup(g.id)} aria-label={`${g.label} 삭제`}><Trash2 size={14}/></button></div>)}</div><TextField label="새 활동반 이름"><input placeholder="예: 금요 스포츠 A반" value={groupName} onChange={e=>setGroupName(e.target.value)}/></TextField><strong className="academic-form-label">참여 학급</strong><div className="academic-class-checkboxes">{plan.classes.map(c=><label key={c.id}><input type="checkbox" checked={groupClasses.includes(c.id)} onChange={e=>setGroupClasses(old=>e.target.checked?[...old,c.id]:old.filter(id=>id!==c.id))}/>{c.label}</label>)}</div><button className="academic-button primary" onClick={addGroup}><Plus size={16}/> 활동반 추가</button></div></section></div>
      {slotEditor&&<div className="academic-backdrop" onClick={()=>setSlotEditor(null)}><div className="academic-dialog" role="dialog" aria-modal="true" aria-label="시간표 칸 편집" onClick={e=>e.stopPropagation()}><div className="academic-dialog-head"><h3>{classNameFor(plan,slotEditor.scopeId)} · {DAY_NAMES[slotEditor.weekday]}요일 {slotEditor.period}교시</h3><button onClick={()=>setSlotEditor(null)} aria-label="닫기"><X size={19}/></button></div><TextField label="교과·활동"><select value={slotDraft.subjectId} onChange={e=>setSlotDraft(d=>({...d,subjectId:e.target.value}))}><option value="">— 비우기 —</option>{plan.subjects.map(a=><option key={a.id} value={a.id}>{a.label} · {KIND_LABELS[a.kind]}</option>)}</select></TextField><TextField label="지도교사 (선택)"><select value={slotDraft.teacherId||''} onChange={e=>setSlotDraft(d=>({...d,teacherId:e.target.value}))}><option value="">지정 안 함</option>{(plan.teachers||[]).map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></TextField><TextField label="장소·특별실 (선택)"><input value={slotDraft.room||''} onChange={e=>setSlotDraft(d=>({...d,room:e.target.value}))} placeholder="예: 강당, 컴퓨터실"/></TextField><div className="academic-button-row"><button className="academic-button primary" onClick={saveSlot}>시간표 저장</button><button className="academic-button" onClick={()=>setSlotEditor(null)}>취소</button></div></div></div>}
    </div>}
    {tab==='exceptions'&&<div className="academic-content">
      <Intro eyebrow="DAILY OVERRIDES" title="날짜별 특별 운영·변경" desc="체험학습·대체수업·결강 등은 기본 시간표를 수정하지 않고 특정 날짜에만 적용합니다."/>
      <TimetableChanges plan={plan} events={space.events||[]} editPlan={editPlan} notify={notify}/>
      <div className="academic-layout"><section className="academic-card"><h3>특정 날짜의 시간표 변경</h3><div className="academic-form-grid"><TextField label="날짜"><input type="date" min={academicStart(year)} max={academicEnd(year)} value={overrideDraft.date} onChange={e=>{setOverrideDraft(d=>({...d,date:e.target.value}));setSelectedDate(e.target.value);}}/></TextField><TextField label="대상"><select value={`${overrideDraft.scope}:${overrideDraft.scopeId}`} onChange={e=>{const [type,...id]=e.target.value.split(':');setOverrideDraft(d=>({...d,scope:type,scopeId:id.join(':')}));}}>{scopeOptions.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></TextField><TextField label="교시"><select value={overrideDraft.period} onChange={e=>setOverrideDraft(d=>({...d,period:Number(e.target.value)}))}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{i+1}교시</option>)}</select></TextField><TextField label="변경 방식"><select value={overrideDraft.action} onChange={e=>setOverrideDraft(d=>({...d,action:e.target.value}))}><option value="replace">다른 교육활동으로 대체</option><option value="cancel">해당 교시 운영 제외</option></select></TextField></div>{overrideDraft.action==='replace'&&<div className="academic-form-grid"><TextField label="대체 교육활동"><select value={overrideDraft.subjectId} onChange={e=>setOverrideDraft(d=>({...d,subjectId:e.target.value}))}>{plan.subjects.map(s=><option key={s.id} value={s.id}>{s.label} · {KIND_LABELS[s.kind]}</option>)}</select></TextField><TextField label="지도교사"><select value={overrideDraft.teacherId||''} onChange={e=>setOverrideDraft(d=>({...d,teacherId:e.target.value}))}><option value="">지정 안 함</option>{plan.teachers.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></TextField></div>}<div className="academic-form-grid"><TextField label="장소"><input value={overrideDraft.room||''} onChange={e=>setOverrideDraft(d=>({...d,room:e.target.value}))} placeholder="선택"/></TextField><TextField label="변경 사유"><input value={overrideDraft.note||''} onChange={e=>setOverrideDraft(d=>({...d,note:e.target.value}))} placeholder="예: 진로체험일"/></TextField></div><button className="academic-button primary" onClick={saveOverride}>해당 날짜에만 적용</button>{!plan.classes.some(c=>instructionForGrade(plan,overrideDraft.date,c.grade))&&<p className="academic-warning">현재 날짜가 휴업일로 지정되어 있어 시간표를 집계하지 않습니다. 먼저 학사일 편성에서 수업일로 설정하세요.</p>}</section>
        <section className="academic-card"><h3>선택 날짜의 변경 이력</h3><div className="academic-override-list">{(plan.overrides||[]).filter(x=>x.date===overrideDraft.date).map(x=><div key={x.id} className="academic-override"><div><strong>{classNameFor(plan,x.scopeId)} · {x.period}교시</strong><small>{x.action==='cancel'?'운영 제외':`→ ${subjectById[x.subjectId]?.label||'미지정'}`} · {x.note||'사유 미기록'}</small></div><button onClick={()=>deleteOverride(x.id)} aria-label="변경 사항 삭제"><Trash2 size={16}/></button></div>)}{!plan.overrides.some(x=>x.date===overrideDraft.date)&&<Empty>해당 날짜의 변경 사항이 없습니다.</Empty>}</div><div className="academic-notice soft"><Info size={15}/><span>기본 시간표를 덮어쓰지 않고 날짜별 예외만 저장합니다. 행사 목록 자체는 기존 학사력 메뉴에서 관리합니다.</span></div></section></div>
      <section className="academic-card"><div className="academic-card-header"><h3>{displayDate(selectedDate)} 실제 예상 편성</h3><span>{schoolDay(selectedDate,plan.dayRules)?'학교 수업일':plan.classes.some(c=>instructionForGrade(plan,selectedDate,c.grade))?'학년별 수업일':'휴업일'}</span></div><div className="academic-scroll"><table className="academic-table"><thead><tr><th>교시</th><th>대상</th><th>교과·활동</th><th>시수 분류</th><th>변경 여부</th></tr></thead><tbody>{dateSlots.slice().sort((a,b)=>a.period-b.period).map(s=><tr key={`${s.id}-${s.scopeId}`}><td>{s.period}교시</td><td>{classNameFor(plan,s.scopeId)}</td><td>{s.source==='event'?`${s.activityLabel} · `:''}{subjectById[s.subjectId]?.label||'미지정'}{s.volunteer?' (봉사 포함)':''}</td><td>{KIND_LABELS[subjectById[s.subjectId]?.kind]||''}</td><td>{s.source==='event'?<strong className="academic-blue">학사행사 대체</strong>:s.source==='override'?<strong className="academic-blue">날짜별 변경</strong>:'기본 시간표'}</td></tr>)}</tbody></table>{!dateSlots.length&&<Empty>선택 날짜에 편성된 시간표가 없습니다.</Empty>}</div></section>
    </div>}
    {tab==='audit'&&<div className="academic-content">
      <Intro eyebrow="VALIDATION & EXPORT" title="편성 시수 점검" desc="기본 시간표, 수업일, 요일교체, 날짜별 변경을 합산하여 예상 편성시수를 계산합니다."/>
      <div className="academic-stat-row"><AStat label="학교 공통 수업일" value={`${summary.daysTotal}일`} detail={`목표 ${plan.targetDays}일`}/><AStat label="학급 시간표 충돌" value={`${summary.conflicts.length}종`} detail="교시 중복 · 교사 · 특별실" tone={summary.conflicts.length?'red':''}/><AStat label="시수 부족 경고" value={`${summary.warnings.length}건`} detail="학교가 직접 입력한 목표 기준" tone={summary.warnings.length?'red':''}/></div>
      <section className="academic-card"><div className="academic-card-header"><h3>주의 및 충돌 확인</h3><span>반복되는 동일 문제는 묶어서 표시</span></div>{summary.conflicts.slice(0,12).map((c,i)=><div className="academic-alert-row" key={`c${i}`}><AlertTriangle size={17}/><div><strong>{c.message}</strong><small>{c.count}회 감지 · 기본 시간표와 예외 설정 확인 필요</small></div><button onClick={()=>{setSelectedDate(c.date);setTab('exceptions');setOverrideDraft(d=>({...d,date:c.date}));}}>날짜 보기</button></div>)}{summary.warnings.slice(0,12).map((w,i)=><div className="academic-alert-row" key={`w${i}`}><AlertTriangle size={17}/><div><strong>{w.message}</strong></div><button onClick={()=>setTab(w.message.includes('수업일수')?'calendar':'curriculum')}>설정 보기</button></div>)}{!summary.conflicts.length&&!summary.warnings.length&&<div className="academic-clear"><CheckCircle2 size={20}/><span>현재 입력된 목표와 시간표를 기준으로 발견된 오류가 없습니다. 법령 충족을 인증하는 검사는 아닙니다.</span></div>}</section>
      <section className="academic-card"><h3>학급별·활동별 예상 시수</h3><div className="academic-scroll"><table className="academic-table"><thead><tr><th>학급</th><th>교과</th><th>창체 자율·자치</th><th>창체 동아리(스포츠 포함)</th><th>창체 진로</th><th>학교자율시간</th><th>총 편성</th></tr></thead><tbody>{plan.classes.map(c=>{const t=summary.totals[c.id]||{total:0,byCategory:{}};return <tr key={c.id}><td><strong>{c.label}</strong></td>{KEYS.map(k=><td key={k}>{t.byCategory[k]||0}</td>)}<td><strong>{t.total||0}</strong></td></tr>})}</tbody></table></div><p className="academic-muted">스포츠클럽은 동아리 활동 집계에 포함되며 합계에서 중복 계산하지 않습니다. 실제 이수시수가 아닌 등록된 시간표의 예상 편성시수입니다.</p><div className="academic-button-row"><button className="academic-button primary" onClick={saveCsv}><Download size={16}/> 예상 시수 CSV</button><button className="academic-button" onClick={saveScheduleCsv}><Download size={16}/> 날짜별 시간표 CSV</button><button className="academic-button" onClick={savePlanJson}><Download size={16}/> 편성안 JSON</button></div></section>
      <section className="academic-card"><h3>검증 전 유의할 점</h3><p className="academic-muted">미등록 공휴일·방학, 교시 길이 차이, 교과 대체 인정 범위, 학년별 운영일 차이, 선택 교육과정에 따른 시수 인정 여부는 아직 자동 검증하지 않습니다. 본 집계는 학급 단위 주간 배정과 날짜별 예외를 기준으로 산출된 시연 결과입니다.</p></section>
    </div>}
  </div>;
}

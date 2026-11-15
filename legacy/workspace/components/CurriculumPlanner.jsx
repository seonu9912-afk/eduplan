'use client';
import {useMemo,useRef,useState} from 'react';
import {BookOpen,GraduationCap,Layers3,Upload,Download,Plus,Minus,Search,CheckCircle2,AlertTriangle,Info,ChevronLeft,ChevronRight,ArrowRight,Copy,UsersRound,Settings2, X, PencilLine,Table2,SlidersHorizontal,FileSpreadsheet} from 'lucide-react';
import {TERM_KEYS,TERM_LABELS,COURSE_AREAS,COURSE_AREA_LABELS,CURRICULUM_GROUPS,normalizeCurriculum,makeCohort,operationalPlan,sumTerm,sumCohort,parseCurriculumSheet,mergeCurriculumImport,addCohort,setTermHour,courseId,cohortCsv,operationalCsv,termHours} from '../lib/curriculum';

const YEAR_START=2024,YEAR_END=2038;
const fmt=n=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(n||0);
const download=(filename,content)=>{
  const href=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=href;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
};
const isFiniteYear=n=>Number.isInteger(Number(n))&&Number(n)>=YEAR_START&&Number(n)<=YEAR_END;
const mapAreas=type=>type==='subject'?['subject']:type==='creative'?['creative_self','creative_club','creative_career','creative_volunteer']:type==='free'?['free_topic','free_career','free_other']:COURSE_AREAS.map(x=>x.id);
const categoryTitle=area=>COURSE_AREA_LABELS[area]||area;
const copy=JSON.stringify;

function Metric({title,value,detail,accent}){return <div className={`cp-metric ${accent||''}`}><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>}
function Notice({children,type='info'}){return <div className={`cp-notice ${type}`}><Info size={16}/><span>{children}</span></div>}
function Btn({children,onClick,primary=false,disabled=false}){return <button type="button" disabled={disabled} className={`cp-btn ${primary?'main':''}`} onClick={onClick}>{children}</button>}

export default function CurriculumPlanner({space,updateSpace,notify,onOpenTimetable,onOpenStaff}){
  const data=useMemo(()=>normalizeCurriculum(space.curricula),[space.curricula]);
  const availableYears=useMemo(()=>Object.keys(data.cohorts).map(Number).sort((a,b)=>a-b),[data.cohorts]);
  const [mode,setMode]=useState('cohort');
  const [cohortYear,setCohortYear]=useState(2026);
  const [operationYear,setOperationYear]=useState(2026);
  const [grade,setGrade]=useState(1);
  const [term,setTerm]=useState(1);
  const [areaFilter,setAreaFilter]=useState('all');
  const [query,setQuery]=useState('');
  const [newYear,setNewYear]=useState('2027');
  const [copySource,setCopySource]=useState('blank');
  const [newCourse,setNewCourse]=useState({name:'',area:'subject',group:'선택'});
  const [showAddCourse,setShowAddCourse]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [uploadKind,setUploadKind]=useState('cohort');
  const [uploadYear,setUploadYear]=useState('2026');
  const [pendingImport,setPendingImport]=useState(null);
  const [processing,setProcessing]=useState(false);
  const [importError,setImportError]=useState('');
  const uploader=useRef(null);
  const selectedCohort=data.cohorts[String(cohortYear)]||null;
  const selectedTerm=`${grade}-${term}`;
  const stats=sumCohort(selectedCohort,data.courses);
  const termStat=stats.terms[selectedTerm];
  const reference=selectedCohort?.targets?.[selectedTerm];
  const currentOperation=useMemo(()=>operationalPlan(data,operationYear),[data,operationYear]);
  const visibleCourses=data.courses.filter(c=>mapAreas(areaFilter).includes(c.area)&&(c.name.includes(query.trim())||c.group.includes(query.trim())));
  const commit=fn=>updateSpace(s=>({...s,curricula:fn(normalizeCurriculum(s.curricula))}));
  const setHour=(id,value)=>commit(s=>setTermHour(s,cohortYear,selectedTerm,id,value));
  const selectCohort=(year)=>{setCohortYear(year);setGrade(1);setTerm(1);};
  const addNewCohort=()=>{
    const year=Number(newYear);if(!isFiniteYear(year)){notify('입학 연도는 2024~2038년으로 입력해 주세요.');return;}
    try{const updated=addCohort(data,year,copySource==='blank'?null:Number(copySource));updateSpace(s=>({...s,curricula:updated}));selectCohort(year);setMode('cohort');notify(`${year}년 입학생의 3개년 편성안을 생성했어요.`);}catch(e){notify(e.message);}
  };
  const addCourse=()=>{
    const name=newCourse.name.trim().slice(0,80),area=newCourse.area,group=area==='subject'?newCourse.group:'창의적 체험활동';
    if(!name){notify('과목·활동명을 입력해 주세요.');return;}
    const normalizedGroup=area.startsWith('free')?'자유학기 활동':group;
    const id=courseId(name,area,normalizedGroup);
    if(data.courses.some(c=>c.id===id)){notify('이미 같은 과목이 등록되어 있습니다.');return;}
    commit(d=>({...d,courses:[...d.courses,{id,name,group:normalizedGroup,area}]}));
    setNewCourse({name:'',area:'subject',group:'선택'});setShowAddCourse(false);notify('과목·활동을 추가했어요.');
  };
  const editTarget=(value)=>commit(d=>{
    const old=d.cohorts[String(cohortYear)]||makeCohort(cohortYear);
    const n=value===''?null:Math.max(0,Math.round(Number(value)||0));
    return {...d,cohorts:{...d.cohorts,[String(cohortYear)]:{...old,targets:{...old.targets,[selectedTerm]:n}}}};
  });
  const editWeeks=value=>commit(d=>{
    const old=d.cohorts[String(cohortYear)]||makeCohort(cohortYear);
    return {...d,cohorts:{...d.cohorts,[String(cohortYear)]:{...old,weeks:Math.max(1,Math.min(26,Number(value)||16))}}};
  });
  const receiveWorkbook=async event=>{
    const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;
    if(!isFiniteYear(uploadYear)){notify('먼저 적용할 연도를 선택해 주세요.');return;}
    if(file.size>7*1024*1024){notify('7MB 이하 엑셀 파일만 가져올 수 있어요.');return;}
    setProcessing(true);setImportError('');
    try{
      const {readSheet}=await import('read-excel-file/browser');
      const rows=await readSheet(file,{sheet:1});
      const parsed=parseCurriculumSheet(rows,uploadKind,Number(uploadYear));
      setPendingImport({...parsed,filename:file.name});
    }catch(e){setImportError(e?.message||'파일을 읽는 중 문제가 발생했습니다.');}
    finally{setProcessing(false);}
  };
  const confirmImport=()=>{
    if(!pendingImport)return;
    commit(d=>mergeCurriculumImport(d,pendingImport));
    const year=pendingImport.year;
    if(pendingImport.kind==='cohort'){selectCohort(year);setMode('cohort');}
    else {setOperationYear(year);setMode('annual');}
    notify(`교육과정 편성표를 읽어 ${pendingImport.courses.length}개 과목·활동을 반영했어요.`);
    setPendingImport(null);
  };
  const showAnnual=(y)=>{setOperationYear(y);setMode('annual');};
  const changeIntoCohort=(year,g,sem)=>{selectCohort(year);setGrade(g);setTerm(sem);setMode('cohort');};
  const exportCurrent=()=>{
    try{
      const filename=mode==='cohort'?`EduPlan_${cohortYear}년_신입생_3개년교육과정.csv`:`EduPlan_${operationYear}학년도_당해연도_교육과정.csv`;
      download(filename,mode==='cohort'?cohortCsv(data,cohortYear):operationalCsv(data,operationYear));
    }catch(e){notify(e.message);}
  };
  const changeMode=(next)=>{setMode(next);setQuery('');};

  return <div className="cp-page">
    <nav className="cp-mode-tabs" aria-label="교육과정 보기">
      <button className={mode==='cohort'?'active':''} onClick={()=>changeMode('cohort')}><GraduationCap size={18}/> 입학생 3개년</button>
      <button className={mode==='annual'?'active':''} onClick={()=>changeMode('annual')}><Layers3 size={18}/> 당해연도</button>
      <div className="cp-mode-actions"><Btn onClick={exportCurrent} disabled={mode==='cohort'&&!selectedCohort}><Download size={16}/> CSV 출력</Btn><Btn onClick={()=>setShowImport(v=>!v)}><Upload size={16}/> 엑셀 가져오기</Btn><Btn onClick={onOpenStaff}><UsersRound size={16}/> 교원 관리</Btn></div>
    </nav>
    {showImport&&(
    <section className="cp-upload-strip">
      <div className="cp-upload-title"><FileSpreadsheet size={19}/><div><strong>기존 교육과정 엑셀을 그대로 불러올 수 있어요</strong><small>지원 서식: 업로드한 학교의 신입생 3개년 / 당해연도 편성표 구조 · 첫 번째 시트</small></div></div>
      <div className="cp-upload-fields"><label>자료 유형<select value={uploadKind} onChange={e=>setUploadKind(e.target.value)}><option value="cohort">신입생 3개년 편성</option><option value="annual">당해연도 편성</option></select></label><label>{uploadKind==='cohort'?'입학 연도':'운영 학년도'}<input type="number" min={YEAR_START} max={YEAR_END} value={uploadYear} onChange={e=>setUploadYear(e.target.value)}/></label><Btn disabled={processing} onClick={()=>uploader.current?.click()}><Upload size={15}/>{processing?'읽는 중…':'파일 선택'}</Btn></div>
      <input ref={uploader} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={receiveWorkbook}/>
      {importError&&<p className="cp-import-error"><AlertTriangle size={15}/>{importError}</p>}
    </section>
    )}
    {mode==='cohort'&&<>
      <div className="cp-context-bar"><div className="cp-context-left"><label>입학 연도<select aria-label="입학 연도 선택" value={cohortYear} onChange={e=>selectCohort(Number(e.target.value))}><option value={cohortYear}>{cohortYear}년 입학생{selectedCohort?'':' · 미생성'}</option>{availableYears.filter(y=>y!==cohortYear).map(y=><option value={y} key={y}>{y}년 입학생</option>)}</select></label><span className="cp-context-text">3개년 6개 학기를 하나의 편성안으로 관리</span></div><button className="cp-link" onClick={()=>showAnnual(cohortYear)}><ArrowRight size={15}/> {cohortYear}학년도 운영표 보기</button></div>
      {!selectedCohort?<div className="cp-empty-start"><GraduationCap size={34}/><h2>{cohortYear}년 입학생의 편성안이 아직 없어요</h2><p>빈 편성안을 만들거나 기존 신입생 3개년 엑셀을 가져오세요. 자료를 등록해도 다른 학년과 연도의 교육과정은 변경되지 않습니다.</p><div className="cp-new-cohort"><label>새 입학 연도<input type="number" min={YEAR_START} max={YEAR_END} value={newYear} onChange={e=>setNewYear(e.target.value)}/></label><label>만들기 방식<select value={copySource} onChange={e=>setCopySource(e.target.value)}><option value="blank">빈 편성안</option>{availableYears.map(y=><option key={y} value={y}>{y}년 편성안 복제</option>)}</select></label><Btn primary onClick={addNewCohort}><Plus size={16}/> 새 편성안 생성</Btn></div></div>:
      <>
        <div className="cp-metrics"><Metric title="3개년 총 편성시수" value={`${fmt(stats.total)}시간`} detail="입학생의 6개 학기 합계"/><Metric title="선택 학기 편성" value={`${fmt(termStat.total)}시간`} detail={TERM_LABELS[selectedTerm]}/><Metric title="교과" value={`${fmt(termStat.byArea.subject)}시간`} detail="선택 학기"/><Metric title="창체·자유학기" value={`${fmt(termStat.total-(termStat.byArea.subject||0))}시간`} detail="중복 집계 없이 영역별 합산"/></div>
        <div className="cp-three-grades">{[1,2,3].map(g=><button key={g} className={grade===g?'selected':''} onClick={()=>{setGrade(g);setTerm(1);}}><div className="cp-grade-card-title"><strong>{g}학년</strong><span>{selectedCohort.completeGrades?.includes(g)?'자료 있음':'미편성'}</span></div><div className="cp-grade-terms"><div><b>{fmt(stats.terms[`${g}-1`].total)}h</b><small>1학기</small></div><div><b>{fmt(stats.terms[`${g}-2`].total)}h</b><small>2학기</small></div></div><div className="cp-progress"><i style={{width:`${Math.min(100,(stats.terms[`${g}-1`].total+stats.terms[`${g}-2`].total)/1056*100)}%`}}/></div></button>)}</div>
        <div className="cp-workspace-grid"><main className="cp-main-panel"><div className="cp-panel-head"><div><h2>{grade}학년 교육과정 <span>· {term}학기</span></h2><p>각 교과·활동의 학기별 시수를 수정하면 총계와 운영 학년도 자료가 즉시 바뀝니다.</p></div><div className="cp-term-switch"><button disabled={term===1} onClick={()=>setTerm(1)} aria-label="1학기"><ChevronLeft size={16}/></button><span>{term}학기</span><button disabled={term===2} onClick={()=>setTerm(2)} aria-label="2학기"><ChevronRight size={16}/></button></div></div>
        <div className="cp-filters"><div className="cp-filter-tabs">{[['all','전체'],['subject','교과'],['creative','창체'],['free','자유학기']].map(([v,l])=><button key={v} className={areaFilter===v?'active':''} onClick={()=>setAreaFilter(v)}>{l}</button>)}</div><label className="cp-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="과목·교과군 검색" aria-label="과목 검색"/></label></div>
        <div className="cp-course-list">{visibleCourses.map(c=>{
          const n=termHours(selectedCohort,selectedTerm,c.id);
          return <div key={c.id} className="cp-course-row"><div className={`cp-course-mark ${c.area==='subject'?'subject':c.area.startsWith('free')?'free':'creative'}`}/><div className="cp-course-info"><strong>{c.name}{c.autonomous&&<span className="cp-mini-pill">학교자율시간 교과</span>}</strong><small>{c.group} · {categoryTitle(c.area)}</small></div><div className="cp-hours-editor"><button title="1시간 감소" aria-label={`${c.name} 1시간 감소`} disabled={n===0} onClick={()=>setHour(c.id,Math.max(0,n-1))}><Minus size={15}/></button><input aria-label={`${c.name} 학기 편성시수`} type="number" min="0" max="2000" step="1" value={n} onChange={e=>setHour(c.id,e.target.value)} onFocus={e=>e.target.select()}/><span>시간</span><button title="1시간 증가" aria-label={`${c.name} 1시간 증가`} onClick={()=>setHour(c.id,n+1)}><Plus size={15}/></button></div></div>;
        })}{!visibleCourses.length&&<div className="cp-no-results">검색된 과목이 없습니다. 검색어를 지우거나 새 과목을 추가해 주세요.</div>}</div>
        <div className="cp-row-actions"><button className="cp-link" onClick={()=>setShowAddCourse(!showAddCourse)}><Plus size={16}/> 과목·교육활동 추가</button><button className="cp-link" onClick={()=>{setAreaFilter('all');setQuery('');}}>필터 초기화</button></div>
        {showAddCourse&&<div className="cp-new-course"><label>과목·활동명<input value={newCourse.name} onChange={e=>setNewCourse(d=>({...d,name:e.target.value}))} placeholder="예: 노작원예" maxLength={80}/></label><label>교육과정 영역<select value={newCourse.area} onChange={e=>setNewCourse(d=>({...d,area:e.target.value}))}>{COURSE_AREAS.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>{newCourse.area==='subject'&&<label>교과군<select value={newCourse.group} onChange={e=>setNewCourse(d=>({...d,group:e.target.value}))}>{CURRICULUM_GROUPS.map(x=><option key={x}>{x}</option>)}</select></label>}<Btn primary onClick={addCourse}><Plus size={15}/> 추가</Btn></div>}
        </main><aside className="cp-aside"><div className="cp-side-card"><h3>선택 학기 시수 분석</h3><p className="cp-caption">{grade}학년 {term}학기 · 실제 변경값 기준</p><div className="cp-progress-list">{[...COURSE_AREAS].filter(a=>(termStat.byArea[a.id]||0)>0).map(a=><div key={a.id}><div><span>{a.label}</span><b>{fmt(termStat.byArea[a.id])}h</b></div><div className="cp-bar"><i className={a.tone} style={{width:`${termStat.total?100*(termStat.byArea[a.id]||0)/termStat.total:0}%`}}/></div></div>)}</div><div className="cp-total-line"><span>합계</span><strong>{fmt(termStat.total)}시간</strong></div><label className="cp-side-input">학교 계획 목표시수 (선택)<input type="number" placeholder="미설정" value={reference??''} min="0" onChange={e=>editTarget(e.target.value)}/></label>{reference!==undefined&&reference!==null&&<p className={`cp-difference ${termStat.total<reference?'negative':''}`}>목표 대비 {termStat.total-reference>=0?'+':''}{fmt(termStat.total-reference)}시간 · 초과 편성 가능</p>}<label className="cp-side-input">학기당 계산 기준 주수<input type="number" min="1" max="26" value={selectedCohort.weeks||16} onChange={e=>editWeeks(e.target.value)}/></label><p className="cp-caption">주당 시수는 전체 시수를 지정한 주수로 나눈 참고값이며 실제 수업일·시간표를 대체하지 않습니다.</p></div>
          {Object.keys(data.standards||{}).length>0&&<div className="cp-side-card"><h3>3개년 교과군 편성 참고</h3><p className="cp-caption">가져온 엑셀의 기준시수와 현재 입학생 3개년 계획을 비교합니다. 적용 규정과 증감 허용 범위는 별도 확인이 필요합니다.</p><div className="cp-reference-list">{Object.entries(data.standards).map(([group,ref])=>{const total=stats.byGroup[group]||0;return <div key={group}><span>{group}</span><div><b>{fmt(total)} / {fmt(ref)}h</b><em className={total<ref?'below':''}>{total-ref>0?'+':''}{fmt(total-ref)}h</em></div></div>})}</div></div>}
          <div className="cp-side-card"><h3>자유학기 시수 조정</h3>{selectedCohort.baseTerms?.[selectedTerm]&&Object.keys(selectedCohort.baseTerms[selectedTerm]).length>0?<><p className="cp-caption">원본 편성표의 학기제 계획과 자유학기 조정 이후 시수를 비교합니다.</p><div className="cp-subtotals"><div><span>조정 이전 교과·창체</span><b>{fmt(Object.values(selectedCohort.baseTerms[selectedTerm]).reduce((s,n)=>s+Number(n||0),0))}h</b></div><div><span>조정 이후 전체 편성</span><b>{fmt(termStat.total)}h</b></div><div><span>자유학기 활동</span><b>{fmt((termStat.byArea.free_topic||0)+(termStat.byArea.free_career||0)+(termStat.byArea.free_other||0))}h</b></div></div></>:<p className="cp-caption">자유학기 조정 전·후를 비교하려면 기존 3개년 편성표를 가져오세요. 자유학기 활동 시수 자체는 왼쪽 과목 목록에서 편성할 수 있습니다.</p>}</div>
          <div className="cp-side-card compact"><h3>새 입학 연도 편성안</h3><div className="cp-new-cohort vertical"><label>입학 연도<input type="number" value={newYear} onChange={e=>setNewYear(e.target.value)} min={YEAR_START} max={YEAR_END}/></label><label>기존 계획 활용<select value={copySource} onChange={e=>setCopySource(e.target.value)}><option value="blank">빈 계획부터 시작</option>{availableYears.map(y=><option key={y} value={y}>{y}년 계획 복제</option>)}</select></label><Btn onClick={addNewCohort}><Copy size={15}/> 새 계획 생성</Btn></div></div>
        </aside></div>
      </>}
    </>}

    {mode==='annual'&&<><div className="cp-context-bar"><div className="cp-context-left"><label>운영 학년도<input aria-label="운영 학년도" type="number" min={YEAR_START} max={YEAR_END} value={operationYear} onChange={e=>setOperationYear(Number(e.target.value))}/></label><span className="cp-context-text">각 학년의 입학 연도별 계획을 자동 결합합니다.</span></div><Btn onClick={exportCurrent}><Download size={16}/> 운영표 CSV</Btn></div>
      <div className="cp-metrics"><Metric title="당해연도 1~3학년 총계" value={currentOperation.complete?`${fmt(currentOperation.total)}시간`:'일부 미편성'} detail="학년별 계획시수의 합"/><Metric title="편성 자료 연결" value={`${currentOperation.grades.filter(g=>g.ready).length} / 3학년`} detail="입학 연도별 불러온 계획"/><Metric title="1학기 합계" value={`${fmt(currentOperation.grades.filter(g=>g.ready).reduce((a,g)=>a+g.semesters[0].totals.total,0))}시간`} detail="등록된 학년만 합산"/><Metric title="2학기 합계" value={`${fmt(currentOperation.grades.filter(g=>g.ready).reduce((a,g)=>a+g.semesters[1].totals.total,0))}시간`} detail="등록된 학년만 합산"/></div>
      <div className="cp-annual-cards">{currentOperation.grades.map(g=><article className={`cp-annual-card ${g.ready?'':'missing'}`} key={g.grade}><div className="cp-annual-card-top"><div><span>{g.grade}학년</span><h2>{g.cohortYear}년 입학생</h2></div><span className="cp-card-status">{g.ready?'연결됨':'미편성'}</span></div><div className="cp-annual-numbers"><div><small>1학기</small><strong>{g.ready?`${fmt(g.semesters[0].totals.total)}h`:'—'}</strong></div><div><small>2학기</small><strong>{g.ready?`${fmt(g.semesters[1].totals.total)}h`:'—'}</strong></div></div><div className="cp-annual-detail">{g.ready?<>{Object.entries(g.semesters[0].totals.byArea).filter(([,n])=>n>0).map(([a,n])=><span key={a}>{categoryTitle(a)} {fmt(n)}h</span>)}</>:<p>해당 입학 연도의 {g.grade}학년 편성안이 없습니다.</p>}</div><button className="cp-card-link" onClick={()=>changeIntoCohort(g.cohortYear,g.grade,1)}>{g.ready?'세부 편성 수정':'계획 만들기'} <ArrowRight size={16}/></button></article>)}</div>
      <Notice>이 화면은 같은 시수표를 다시 입력하지 않습니다. 예를 들어 {operationYear}학년도 2학년은 {operationYear-1}년 입학생의 2학년 계획을 사용합니다. 한 학년의 교육과정이 바뀌면 이 운영표에 즉시 반영됩니다.</Notice>
      <section className="cp-panel cp-operation-detail"><div className="cp-panel-head"><div><h2>{operationYear}학년도 전체 교과·활동 비교</h2><p>한눈에 비교할 때만 표 형태로 보여줍니다. 편집은 입학생별 상세 화면에서 진행합니다.</p></div></div><div className="cp-table-scroll"><table className="cp-table"><thead><tr><th>영역</th><th>과목·활동</th>{[1,2,3].flatMap(g=>[1,2].map(t=><th key={`${g}${t}`}>{g}학년 {t}학기</th>))}</tr></thead><tbody>{data.courses.filter(c=>currentOperation.grades.some(g=>g.ready&&g.semesters.some(s=>termHours(g.cohort,s.key,c.id)>0))).map(c=><tr key={c.id}><td>{categoryTitle(c.area)}</td><td><strong>{c.name}</strong><small>{c.group}</small></td>{currentOperation.grades.flatMap(g=>g.semesters.map(s=><td key={`${g.grade}-${s.term}`}>{g.ready?fmt(termHours(g.cohort,s.key,c.id)):'—'}</td>))}</tr>)}</tbody><tfoot><tr><td colSpan={2}>합계</td>{currentOperation.grades.flatMap(g=>g.semesters.map(s=><td key={`${g.grade}-${s.term}`}><strong>{g.ready?fmt(s.totals.total):'—'}</strong></td>))}</tr></tfoot></table></div></section>
    </>}

    {pendingImport&&<div className="cp-dialog-backdrop" onMouseDown={()=>setPendingImport(null)}><section className="cp-dialog" role="dialog" aria-modal="true" aria-label="교육과정 엑셀 가져오기 미리보기" onMouseDown={e=>e.stopPropagation()}><div className="cp-dialog-head"><div><span className="cp-eyebrow">IMPORT PREVIEW</span><h2>교육과정 엑셀 확인</h2></div><button aria-label="닫기" onClick={()=>setPendingImport(null)}><X size={20}/></button></div><p><strong>{pendingImport.filename}</strong></p><p className="cp-caption">{pendingImport.kind==='cohort'?'신입생 3개년':'당해연도'} · {pendingImport.year}년 · 과목·활동 {pendingImport.courses.length}개</p><div className="cp-preview-grades">{pendingImport.preview.totals.map(g=><div key={g.grade}><strong>{g.grade}학년</strong><small>{g.cohortYear}년 입학생</small><span>1학기 {fmt(g.first)}h / 2학기 {fmt(g.second)}h</span></div>)}</div><Notice type="warning">가져오기 확정 시 해당 입학 연도·학년의 기존 편성시수만 교체됩니다. 다른 입학 연도와 학년 계획은 보존됩니다. 가져오기 전 관리자 설정에서 백업을 권장합니다.</Notice><div className="cp-dialog-actions"><Btn onClick={()=>setPendingImport(null)}>취소</Btn><Btn primary onClick={confirmImport}><CheckCircle2 size={16}/> 이 편성안 가져오기</Btn></div></section></div>}
  </div>;
}

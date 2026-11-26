"use client";
import { Disclosure } from "@/components/ui/disclosure";
import {canPlan} from "@/lib/planning-completion";

import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {
  ArrowLeft,ArrowRight,BookOpen,Check,ChevronRight,
  CircleAlert,ClipboardCheck,Layers3,Plus,Save,TableProperties,
} from "lucide-react";
import type {Context} from "@/lib/models";
import {addGroup,addSubject,createPlan,importMiddleCurriculumDefaults} from "@/app/actions";
import {isCreativeGroup,middleRevisionForCohort} from "@/lib/middle-curriculum";
import {orderedCurriculumGroups,orderedCurriculumSubjects} from "@/lib/curriculum-group-order";
import {CurriculumEnhanced,type CurriculumDesignActions,type CurriculumSelectionControls} from "./curriculum-enhanced";
import {canExcludeSubject} from "@/lib/curriculum-design";
import {CurriculumRowSubjectV4} from "./curriculum-subject-row-v4";
import "./curriculum-simple-v5.css";

type Step=1|2|3;
export const curriculumCatalogActions={addSubject,addGroup,createPlan,importDefaults:importMiddleCurriculumDefaults};
export type CurriculumCatalogActions=typeof curriculumCatalogActions;
const steps=[
  {id:1 as const,title:"과목 선택",caption:"편성할 과목 선택·추가",icon:Layers3},
  {id:2 as const,title:"시수 배당",caption:"학기별 주당시수 입력",icon:TableProperties},
  {id:3 as const,title:"교육과정표",caption:"계산된 표 확인·출력",icon:ClipboardCheck},
];
const namesFrom=(input:string):string[]=>[...new Set(input
  .split(/[\n\r,;，]+/).map(s=>s.trim()).filter(Boolean))];

function GroupEditor({context:c,groupId,selection,onUpdated,actions,renameEnabled,onDraftChange}:{
  context:Context;groupId:string;selection:CurriculumSelectionControls;onUpdated:()=>void;
  actions:CurriculumCatalogActions;renameEnabled:boolean;
  onDraftChange:(id:string,dirty:boolean)=>void;
}){
  const group=c.groups.find(g=>g.id===groupId)!;
  const subjects=orderedCurriculumSubjects(c.subjects,c.groups).filter(s=>s.group_id===groupId);
  const [adding,setAdding]=useState(false);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const enabled=selection.editable;
  const selected=new Set(c.subjects.filter(subject=>!selection.document.excludedSubjectIds?.includes(subject.id)).map(subject=>subject.id));
  useEffect(()=>{onDraftChange(groupId,!!input.trim()||busy);},[input,busy,groupId,onDraftChange]);
  useEffect(()=>()=>onDraftChange(groupId,false),[groupId,onDraftChange]);
  async function createSubjects(){
    const names=namesFrom(input);
    if(!names.length){setError("추가할 과목명을 입력해 주세요.");return;}
    if(names.some(n=>n.length>60)){setError("과목명은 60자 이내로 입력해 주세요.");return;}
    if(names.length>30){setError("한 번에 30개 과목까지 등록할 수 있어요.");return;}
    const existing=new Set(subjects.map(s=>s.name.trim()));
    const additions=names.filter(n=>!existing.has(n));
    if(!additions.length){setError("이미 등록된 과목입니다.");return;}
    setBusy(true);setError("");
    let created=0;
    for(const name of additions){
      try{
        const response=await actions.addSubject({workspace_id:c.workspace.id,group_id:groupId,name});
        if(!response.ok){setError(name+" 등록 실패: "+response.error);break;}
        created++;
      }catch{setError(name+" 등록 중 연결이 끊어졌습니다.");break;}
    }
    setBusy(false);
    if(created){
      setInput(additions.slice(created).join("\n"));
      if(created===additions.length)setAdding(false);
      onUpdated();
    }
  }
  return <section className="c5-group" aria-label={group.name+" 교과군"}>
    <header className="c5-group-header">
      <div><strong>{group.name}</strong><span>{subjects.filter(subject=>selected.has(subject.id)).length}/{subjects.length}개 선택</span></div>
      {enabled&&!adding&&<button type="button" className="c5-subtle-btn"
        onClick={()=>setAdding(true)}><Plus size={14}/>과목 추가</button>}
    </header>
    {subjects.length?
      <div className="c5-subject-list">
        {subjects.map(subject=><div className={"c5-subject"+(selected.has(subject.id)?" selected":"")} key={subject.id}>
          <input type="checkbox" aria-label={subject.name+" 편성 과목 선택"}
            checked={selected.has(subject.id)}
            disabled={!enabled||busy||(selected.has(subject.id)&&!canExcludeSubject(selection.document,subject.id))}
            title={canExcludeSubject(selection.document,subject.id)?"이번 입학년도 편성에 포함":"시수 또는 선택과목군이 연결된 과목입니다. 편성을 정리한 뒤 선택 해제할 수 있습니다."}
            onChange={event=>selection.select(subject.id,event.target.checked)}/>
          <CurriculumRowSubjectV4 context={c} subjectId={subject.id}
            disabled={!enabled||busy||!renameEnabled} onSaved={onUpdated}/>
          {!canExcludeSubject(selection.document,subject.id)&&<small className="c5-in-use">편성 중</small>}
        </div>)}
      </div>:
      <p className="c5-group-empty">등록된 과목이 없습니다. 오른쪽의 ‘과목 추가’를 눌러 주세요.</p>}
    {adding&&enabled&&<div className="c5-inline-add">
      <label htmlFor={"c5-add-"+groupId}>새 과목명</label>
      <textarea id={"c5-add-"+groupId} rows={2} value={input} autoFocus
        onChange={e=>setInput(e.target.value)}
        placeholder={"과목명을 적어 주세요.\n여러 과목은 줄바꿈으로 한꺼번에 입력할 수 있어요."}/>
      <div>
        <button type="button" className="c5-primary c5-small"
          disabled={busy||!input.trim()} onClick={()=>void createSubjects()}>
          <Plus size={13}/>{busy?"등록 중…":"과목 등록"}
        </button>
        <button type="button" className="c5-text-btn" disabled={busy}
          onClick={()=>{setAdding(false);setError("");setInput("");}}>취소</button>
      </div>
    </div>}
    {error&&<p className="c5-error" role="alert">{error}</p>}

  </section>;
}

export function CurriculumSimpleV5({context:c,initialCohort,onDirtyChange,
  actions,catalogActions=curriculumCatalogActions,catalogEditable=true,onRefresh}:{
  context:Context;initialCohort?:string;onDirtyChange:(dirty:boolean)=>void;
  actions?:CurriculumDesignActions;catalogActions?:CurriculumCatalogActions;
  catalogEditable?:boolean;onRefresh?:()=>void;
}){
  const router=useRouter();
  const [step,setStep]=useState<Step>(1);
  const seeded=useRef(false);
  const [cohort,setCohort]=useState(Number(initialCohort)||c.year?.year||c.plans[0]?.cohort_year||2026);
  const [createYear,setCreateYear]=useState(false);
  const [draftYear,setDraftYear]=useState(String(cohort+1));
  const [newGroup,setNewGroup]=useState("");
  const [showGroupInput,setShowGroupInput]=useState(false);
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [catalogDrafts,setCatalogDrafts]=useState<Record<string,boolean>>({});
  const [selectedCount,setSelectedCount]=useState(0);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const plan=c.plans.find(p=>p.cohort_year===cohort);
  const credits=plan?.unit==="credits";
  const duration=c.grades.length+"개년";
  const groups=orderedCurriculumGroups(c.groups);
  const editable=canPlan(c,"curriculum");
  const pending=dirty||busy||!!newGroup.trim()||Object.values(catalogDrafts).some(Boolean);
  const cohortYears=Array.from(new Set([cohort,...c.plans.map(p=>p.cohort_year)])).sort((a,b)=>b-a);
  const markCatalogDraft=useCallback((id:string,value:boolean)=>setCatalogDrafts(old=>
    !!old[id]===value?old:{...old,[id]:value}),[]);
  useEffect(()=>{onDirtyChange(pending);},[pending,onDirtyChange]);
  useEffect(()=>{
    const guard=(event:BeforeUnloadEvent)=>{if(pending){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",guard);
    return()=>window.removeEventListener("beforeunload",guard);
  },[pending]);
  function refresh(){if(onRefresh)onRefresh();else router.refresh();}
  useEffect(()=>{
    if(seeded.current||c.schoolType!=="중학교"||!editable||c.subjects.length||c.groups.length)return;
    seeded.current=true;
    void catalogActions.importDefaults({workspaceId:c.workspace.id,revision:middleRevisionForCohort(cohort)})
      .then(result=>{if(result.ok)refresh();else setError(result.error);})
      .catch(()=>setError("기본 과목을 불러오지 못했습니다. 다시 불러오기를 이용해 주세요."));
    // Initialize only an empty editable school catalog, without touching hours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[c.workspace.id,c.schoolType,c.subjects.length,editable]);
  function canMove(){
    if(!pending)return true;
    setError("저장 중이거나 입력 중인 내용이 있습니다. 저장을 마치거나 입력을 취소한 뒤 이동해 주세요.");return false;
  }
  function chooseYear(year:number){
    if(!canMove())return;
    if(!Number.isInteger(year)||year<2000||year>2100){setError("입학년도는 2000~2100년 사이로 지정해 주세요.");return;}
    setCohort(year);setSelectedCount(0);setStep(1);setError("");setNotice("");setCreateYear(false);
  }
  async function startPlan(){
    if(!editable||busy)return;
    setBusy(true);setError("");
    try{
      const result=await catalogActions.createPlan(c.workspace.id,cohort);
      if(!result.ok){setError(result.error);return;}
      refresh();setNotice("편성표를 준비했습니다. 사용할 과목을 선택해 주세요.");
    }catch{setError("편성표를 만들지 못했습니다. 다시 시도해 주세요.");}
    finally{setBusy(false);}
  }
  async function importDefaults(revision:"2015"|"2022"){
    if(!editable||pending)return;
    setBusy(true);setError("");
    try{
      const result=await catalogActions.importDefaults({workspaceId:c.workspace.id,revision});
      if(!result.ok){setError(result.error);return;}
      setNotice("기본 과목 목록을 보완했습니다. 이번 편성에 사용할 과목을 확인해 주세요.");refresh();
    }catch{setError("기본 과목을 불러오지 못했습니다.");}
    finally{setBusy(false);}
  }
  async function addNewGroup(){
    if(!editable||busy||!newGroup.trim())return;
    setBusy(true);setError("");
    try{
      const result=await catalogActions.addGroup(c.workspace.id,newGroup.trim());
      if(!result.ok){setError(result.error);return;}
      setNewGroup("");setShowGroupInput(false);refresh();
    }catch{setError("교과군을 추가하지 못했습니다.");}
    finally{setBusy(false);}
  }
  function advance(target:Step){
    if(target===step||!canMove())return;
    if(target>1&&(!plan||!selectedCount)){setError("먼저 편성할 과목을 한 개 이상 선택해 주세요.");return;}
    setStep(target);setError("");setNotice("");
  }
  const renderSubjects=(selection:CurriculumSelectionControls)=><>
    <p className="c5-selection-help">체크한 과목만 다음 단계와 교육과정표에 표시됩니다.
      시수나 선택과목군이 연결된 과목은 기존 입력을 보호하기 위해 선택 해제가 제한됩니다.</p>
    {c.schoolType==="중학교"&&editable&&<Disclosure className="c5-catalog-import no-print" compact label="기본 과목 목록 보완">
      <div><button type="button" disabled={pending} onClick={()=>void importDefaults("2015")}>2015 개정 불러오기</button>
        <button type="button" disabled={pending} onClick={()=>void importDefaults("2022")}>2022 개정 불러오기</button></div>
    </Disclosure>}
    {[false,true].map(creative=><section key={String(creative)} aria-label={creative?"창의적 체험활동 선택":"교과 과목 선택"}>
      <h3 className="c5-selection-heading">{creative?"창의적 체험활동":"교과·과목"}</h3>
      <div className="c5-group-grid">
        {groups.filter(group=>isCreativeGroup(group.name)===creative).map(group=><GroupEditor key={group.id}
          context={c} groupId={group.id} selection={selection} actions={catalogActions}
          renameEnabled={catalogEditable} onUpdated={refresh} onDraftChange={markCatalogDraft}/>)}
      </div>
    </section>)}
    {editable&&<div className="c5-add-group no-print">
      {!showGroupInput?<button type="button" onClick={()=>setShowGroupInput(true)}><Plus size={16}/>교과군 추가</button>:
        <form onSubmit={event=>{event.preventDefault();void addNewGroup();}}>
          <label htmlFor="c5-group-name">새 교과군 이름</label>
          <input id="c5-group-name" value={newGroup} maxLength={60} onChange={event=>setNewGroup(event.target.value)}/>
          <div><button type="submit" className="c5-primary" disabled={busy||!newGroup.trim()}>교과군 등록</button>
            <button type="button" className="c5-text-btn" onClick={()=>{setShowGroupInput(false);setNewGroup("");}}>취소</button></div>
        </form>}
    </div>}
  </>;
  return <div className="c5-page">
    <header className="c5-hero">
      <div className="c5-hero-text"><span className="c5-kicker">EDUPLAN · CURRICULUM</span>
        <h1>교육과정 편성</h1><p>과목을 선택하고 {credits?"학점을":"주당 시수를"} 입력하면 교육과정표가 만들어집니다.</p></div>
      <div className="c5-year-control no-print"><label htmlFor="c5-year-select">입학년도</label>
        <div className="c5-year-row"><select id="c5-year-select" value={cohort} onChange={event=>chooseYear(Number(event.target.value))}>
          {cohortYears.map(year=><option key={year} value={year}>{year}학년도 입학생</option>)}</select>
          {editable&&<button type="button" className="c5-icon-button" title="새 입학년도 선택" onClick={()=>setCreateYear(value=>!value)}><Plus size={16}/></button>}
        </div>
        {createYear&&<div className="c5-year-new"><input aria-label="새 입학년도" type="number" min="2000" max="2100" value={draftYear} onChange={event=>setDraftYear(event.target.value)}/>
          <button type="button" onClick={()=>chooseYear(Number(draftYear))}>선택</button></div>}
      </div>
    </header>
    <nav className="c5-steps no-print" aria-label="교육과정 편성 단계">
      {steps.map((item,index)=>{const Icon=item.icon;return <button type="button" key={item.id}
        className={"c5-step"+(step===item.id?" active":"")} aria-current={step===item.id?"step":undefined}
        onClick={()=>advance(item.id)} disabled={busy}>
        <span className="c5-step-symbol"><Icon size={16}/></span><span className="c5-step-copy"><strong>{item.id}. {item.title}</strong>
          <small>{credits&&item.id===2?"학기별 학점 입력":item.caption}</small></span>
        {index<2&&<ChevronRight size={16} className="c5-step-arrow"/>}</button>;})}
    </nav>
    {error&&<div className="c5-banner c5-banner-error" role="alert"><CircleAlert size={16}/>{error}<button type="button" aria-label="오류 닫기" onClick={()=>setError("")}>×</button></div>}
    {notice&&<div className="c5-banner" role="status"><Check size={15}/>{notice}</div>}
    <section className="c5-stage">
      <div className="c5-stage-heading"><div><span className="c5-eyebrow">STEP 0{step}</span>
        <h2>{step===1?"이번에 편성할 과목을 선택하세요":step===2?credits?"선택한 과목의 학점을 입력하세요":"선택한 과목의 주당 시수를 입력하세요":"자동 계산된 교육과정표를 확인하세요"}</h2>
        <p>{step===1?"목록에 없는 과목은 해당 교과군에 추가할 수 있습니다.":step===2?"학기별 입력을 바탕으로 합계를 자동 계산합니다.":"학기별 시수와 합계를 확인하고 Excel로 내려받거나 인쇄하세요."}</p></div>
        <span className="c5-count">{cohort}학년도 입학생 · {duration} · {selectedCount}개 선택</span>
      </div>
      {plan?<div className="c5-editor-holder"><CurriculumEnhanced key={plan.id} context={c} view="cohort" cohort={cohort}
        simpleStep={step===1?"subjects":step===2?"hours":"review"} actions={actions} catalogEditable={catalogEditable}
        renderSubjects={renderSubjects} onSelectionCount={setSelectedCount} onDirtyChange={setDirty}/></div>:
        <div className="c5-wait"><BookOpen size={24}/><strong>{cohort}학년도 입학생 편성 시작</strong>
          <p>편성표를 준비한 뒤 과목 목록에서 사용할 과목을 선택합니다.</p>
          {editable&&<button type="button" className="c5-primary" disabled={busy} onClick={()=>void startPlan()}>편성 시작</button>}</div>}
      <div className="c5-stage-footer no-print">
        {step>1&&<button type="button" className="c5-secondary" onClick={()=>advance(step===3?2:1)}><ArrowLeft size={15}/>이전 단계</button>}
        <span>{pending?<><Save size={14}/>입력 중이거나 저장되지 않은 변경사항이 있습니다.</>:step===1?"과목 선택은 이 입학년도에만 적용됩니다.":"입력 내용이 저장되어 있습니다."}</span>
        {step<3&&<button type="button" className="c5-primary" disabled={pending||!plan||!selectedCount} onClick={()=>advance(step===1?2:3)}>
          {step===1?"선택한 과목의 시수 입력":"교육과정표 보기"}<ArrowRight size={16}/></button>}
      </div>
    </section>
  </div>;
}

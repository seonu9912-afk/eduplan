"use client";

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
import {basisForCohort} from "@/lib/curriculum-workbench";
import {CurriculumEnhanced} from "./curriculum-enhanced";
import {CurriculumRowSubjectV4} from "./curriculum-subject-row-v4";
import "./curriculum-simple-v5.css";

type Step=1|2|3;
const steps=[
  {id:1 as const,title:"과목 구성",caption:"교과군과 과목 정리",icon:Layers3},
  {id:2 as const,title:"시수 배당",caption:"학기별 주당시수 입력",icon:TableProperties},
  {id:3 as const,title:"검토·확정",caption:"결과 확인과 편성안 확정",icon:ClipboardCheck},
];
const namesFrom=(input:string):string[]=>[...new Set(input
  .split(/[\n\r,;，]+/).map(s=>s.trim()).filter(Boolean))];

function GroupEditor({context:c,groupId,enabled,onUpdated}:{
  context:Context;groupId:string;enabled:boolean;onUpdated:()=>void;
}){
  const group=c.groups.find(g=>g.id===groupId)!;
  const subjects=orderedCurriculumSubjects(c.subjects,c.groups).filter(s=>s.group_id===groupId);
  const [adding,setAdding]=useState(false);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
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
        const response=await addSubject({workspace_id:c.workspace.id,group_id:groupId,name});
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
      <div><strong>{group.name}</strong><span>{subjects.length}개 과목</span></div>
      {enabled&&!adding&&<button type="button" className="c5-subtle-btn"
        onClick={()=>setAdding(true)}><Plus size={14}/>과목 추가</button>}
    </header>
    {subjects.length?
      <div className="c5-subject-list">
        {subjects.map((subject,i)=><div className="c5-subject" key={subject.id}>
          <span className="c5-subject-index">{i+1}</span>
          <CurriculumRowSubjectV4 context={c} subjectId={subject.id}
            disabled={!enabled||busy} onSaved={onUpdated}/>

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

export function CurriculumSimpleV5({context:c,initialCohort,onDirtyChange}:{
  context:Context;initialCohort?:string;onDirtyChange:(dirty:boolean)=>void;
}){
  const router=useRouter();
  const [step,setStep]=useState<Step>(1);
  const seeded=useRef(false);
  const [cohort,setCohort]=useState(Number(initialCohort)||c.year?.year||
    c.plans[0]?.cohort_year||2026);
  const [createYear,setCreateYear]=useState(false);
  const [draftYear,setDraftYear]=useState(String(cohort+1));
  const [newGroup,setNewGroup]=useState("");
  const [showGroupInput,setShowGroupInput]=useState(false);
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const plan=c.plans.find(p=>p.cohort_year===cohort);
  const groups=orderedCurriculumGroups(c.groups);
  const schoolSubjects=c.subjects.length;
  const subjectGroups=groups.filter(group=>!isCreativeGroup(group.name));
  const creativeGroups=groups.filter(group=>isCreativeGroup(group.name));
  const editable=c.role==="admin"||c.role==="editor";
  const cohortYears=Array.from(new Set([cohort,...c.plans.map(p=>p.cohort_year)]))
    .sort((a,b)=>b-a);
  const stableDirty=useCallback((next:boolean)=>{setDirty(next);onDirtyChange(next);},[onDirtyChange]);
  useEffect(()=>{
    if(seeded.current||c.schoolType!=="중학교"||!editable||c.subjects.length||c.groups.length)return;
    seeded.current=true;
    let live=true;
    void importMiddleCurriculumDefaults({
      workspaceId:c.workspace.id,revision:middleRevisionForCohort(cohort),
    }).then(result=>{
      if(!live)return;
      if(result.ok){setNotice("중학교 기본 교과목과 창의적 체험활동 영역을 준비했어요.");router.refresh();}
      else setError("기본 교과목을 자동 등록하지 못했습니다: "+result.error);
    }).catch(()=>{if(live)setError("기본 교과목을 불러오지 못했습니다. 직접 불러오기를 이용해 주세요.");});
    return()=>{live=false;};
    // Initialization runs once for an empty editable workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[c.workspace.id,c.schoolType,c.subjects.length,editable]);
  function refresh(){router.refresh();}
  function canMove(){
    if(!dirty)return true;
    setError("편성 시수를 저장하는 중이에요. 상단의 ‘저장 대기’ 표시가 사라지면 이동해 주세요.");
    return false;
  }
  function chooseYear(year:number){
    if(!canMove())return;
    if(!Number.isInteger(year)||year<2000||year>2100){setError("입학년도는 2000~2100년 사이로 지정해 주세요.");return;}
    setCohort(year);setError("");setNotice("");setCreateYear(false);setStep(1);
  }
  async function importDefaults(revision:"2015"|"2022"){
    if(!editable||busy||dirty)return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await importMiddleCurriculumDefaults({workspaceId:c.workspace.id,revision});
      if(!result.ok){setError(result.error);return;}
      setNotice(revision+" 개정 기본 항목 확인 완료 · 교과군 "+result.data.addedGroups+
        "개, 교과목·창체 영역 "+result.data.addedSubjects+"개 추가");
      refresh();
    }catch{setError("기본 항목 불러오기에 실패했습니다.");}
    finally{setBusy(false);}
  }
  async function addNewGroup(){
    if(!editable||!newGroup.trim()||busy)return;
    if(newGroup.trim().length>60){setError("교과군 이름은 60자 이내로 적어 주세요.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const r=await addGroup(c.workspace.id,newGroup.trim());
      if(!r.ok){setError(r.error);return;}
      setNewGroup("");setShowGroupInput(false);
      setNotice("교과군이 추가됐어요.");refresh();
    }catch{setError("교과군을 추가하지 못했습니다.");}
    finally{setBusy(false);}
  }
  async function advance(target:Step){
    if(target===step)return;
    if(!canMove())return;
    if(target===1||target===3&&plan){
      setStep(target);setError("");setNotice("");return;
    }
    if(!schoolSubjects){setError("먼저 한 과목 이상 등록해 주세요.");setStep(1);return;}
    if(!plan&&editable&&target>=2){
      setBusy(true);setError("");
      try{
        const result=await createPlan(c.workspace.id,cohort);
        if(!result.ok){setError(result.error);return;}
        setNotice(cohort+"학년도 3개년 편성표를 준비했어요.");refresh();
        setStep(target);
      }catch{setError("편성표를 만들지 못했습니다.");}
      finally{setBusy(false);}
      return;
    }
    if(!plan&&target>=2){setError("편성표가 생성되지 않았습니다. 학교 편집 권한을 확인해 주세요.");return;}
    setError("");setNotice("");setStep(target);
  }
  const basis=c.schoolType==="중학교"?basisForCohort(cohort):null;
  return <div className="c5-page">
    <header className="c5-hero">
      <div className="c5-hero-text">
        <span className="c5-kicker">EDUPLAN · CURRICULUM</span>
        <h1>교육과정 편성</h1>
        <p>과목을 정하고, 주당시수를 입력하면 나머지는 자동으로 계산됩니다.</p>
      </div>
      <div className="c5-year-control no-print">
        <label htmlFor="c5-year-select">입학년도</label>
        <div className="c5-year-row">
          <select id="c5-year-select" value={cohort} onChange={e=>chooseYear(Number(e.target.value))}>
            {cohortYears.map(year=><option key={year} value={year}>{year}학년도 입학생</option>)}
          </select>
          <button type="button" className="c5-icon-button" title="새 입학년도 선택"
            onClick={()=>setCreateYear(v=>!v)}><Plus size={16}/></button>
        </div>
        {createYear&&<div className="c5-year-new">
          <input aria-label="새 입학년도" type="number" min="2000" max="2100"
            value={draftYear} onChange={e=>setDraftYear(e.target.value)}/>
          <button type="button" onClick={()=>chooseYear(Number(draftYear))}>선택</button>
        </div>}
      </div>
    </header>

    <nav className="c5-steps no-print" aria-label="교육과정 편성 단계">
      {steps.map((item,index)=>{
        const Icon=item.icon;
        return <button type="button" key={item.id}
          className={"c5-step"+(step===item.id?" active":"")}
          aria-current={step===item.id?"step":undefined}
          onClick={()=>void advance(item.id)} disabled={busy}>
          <span className="c5-step-symbol"><Icon size={16}/></span>
          <span className="c5-step-copy">
            <strong>{item.id}. {item.title}</strong>
            <small>{item.caption}</small>
          </span>
          {index<steps.length-1&&<ChevronRight size={16} className="c5-step-arrow"/>}
        </button>;
      })}
    </nav>
    {error&&<div className="c5-banner c5-banner-error" role="alert">
      <CircleAlert size={16}/>{error}<button type="button" onClick={()=>setError("")} aria-label="오류 닫기">×</button>
    </div>}
    {notice&&<div className="c5-banner" role="status"><Check size={15}/>{notice}</div>}

    {step===1&&<section className="c5-stage">
      <div className="c5-stage-heading">
        <div><span className="c5-eyebrow">STEP 01</span>
          <h2>우리 학교에서 운영할 과목을 구성해 주세요</h2>
          <p>국가 교육과정의 교과군 순서를 유지하면서 학교 특색 과목을 추가할 수 있어요. 특정 입학년도에서 운영하지 않을 과목은 2단계 시수표에서 ‘운영 제외’를 선택해 주세요.</p>
        </div>
        <span className="c5-count">{groups.length}개 교과군 · {schoolSubjects}개 과목</span>
      </div>
      {basis&&<div className="c5-hint">
        <BookOpen size={15}/>{basis.label} 기준으로 편성합니다. 기준 시수는 마지막 단계에서 비교해 드려요.
      </div>}
      {c.schoolType==="중학교"&&editable&&<div className="c5-catalog-import no-print">
        <div><strong>국가 교육과정 기본 과목</strong>
          <p>이미 있는 과목과 시수는 그대로 둡니다. 과목 자체를 삭제하지 않고 입학년도별로 운영 여부를 정할 수 있어요.</p>
        </div>
        <div>
          <button type="button" disabled={busy||dirty} onClick={()=>void importDefaults("2015")}>2015 개정 불러오기</button>
          <button type="button" disabled={busy||dirty} onClick={()=>void importDefaults("2022")}>2022 개정 불러오기</button>
        </div>
      </div>}
      <div className="c5-group-grid">
        {subjectGroups.map(group=><GroupEditor key={group.id} context={c}
          groupId={group.id} enabled={editable} onUpdated={refresh}/> )}
        {editable&&<section className="c5-add-group">
          {!showGroupInput?<button type="button" onClick={()=>setShowGroupInput(true)}>
            <Plus size={18}/><strong>교과군 추가</strong>
            <small>학교 특색 교육과정 등</small>
          </button>:<form onSubmit={e=>{e.preventDefault();void addNewGroup();}}>
            <label htmlFor="c5-group-name">새 교과군 이름</label>
            <input id="c5-group-name" autoFocus maxLength={60}
              value={newGroup} onChange={e=>setNewGroup(e.target.value)}
              placeholder="예: 학교 특색 교육과정"/>
            <div><button type="submit" className="c5-primary c5-small"
              disabled={busy||!newGroup.trim()}>추가하기</button>
              <button type="button" className="c5-text-btn"
                onClick={()=>setShowGroupInput(false)}>취소</button>
            </div>
          </form>}
        </section>}
      </div>
      {c.schoolType==="중학교"&&<section className="c5-creative-section" aria-label="창의적 체험활동 영역 관리">
        <div className="c5-creative-heading">
          <div><span>별도 편성</span><h3>창의적 체험활동</h3>
            <p>{middleRevisionForCohort(cohort)} 개정 교육과정의 창체 영역입니다.
              교과 시수와 별도로 입력하고 최종 합계에서 합산합니다.</p>
          </div>
        </div>
        <div className="c5-group-grid">
          {creativeGroups.map(group=><GroupEditor key={group.id} context={c}
            groupId={group.id} enabled={editable} onUpdated={refresh}/>)}
        </div>
      </section>}
      <div className="c5-stage-footer no-print">
        <span>과목 구성은 다른 입학년도 편성표에서도 공통으로 사용돼요.</span>
        <button type="button" className="c5-primary" disabled={busy||!schoolSubjects}
          onClick={()=>void advance(2)}>과목 구성 완료 <ArrowRight size={16}/></button>
      </div>
    </section>}

    {step>=2&&<section className="c5-stage">
      <div className="c5-stage-heading">
        <div>
          <span className="c5-eyebrow">STEP 0{step}</span>
          <h2>{step===2?"각 학기의 주당시수를 입력하세요":"편성 결과를 확인하고 확정하세요"}</h2>
          <p>{step===2
            ?"1학년부터 3학년까지 주당 몇 시간 운영할지 입력하면 학기·3개년 합계가 자동 계산됩니다."
            :"교과군별 국가 기준과 편성 시수를 비교하고, 저장이 끝난 편성안의 확정본을 만들 수 있어요."}</p>
        </div>
        <span className="c5-count">{cohort}년 입학생 · {cohort+2}년 졸업 예정</span>
      </div>
      {!plan?<div className="c5-wait">
        <BookOpen size={24}/>
        <strong>{cohort}학년도 편성표를 준비 중입니다.</strong>
        <p>새 편성표가 나타나지 않으면 화면을 새로고침해 주세요. 기존 자료는 변경되지 않습니다.</p>
        <button type="button" className="c5-secondary" onClick={refresh}>최신 자료 불러오기</button>
      </div>:<div className="c5-editor-holder">
        <CurriculumEnhanced context={c} view="cohort" cohort={cohort}
          key={plan.id+":"+c.subjects.map(s=>s.id).sort().join("|")}
          simpleStep={step===2?"hours":"review"} onDirtyChange={stableDirty}/>
      </div>}
      <div className="c5-stage-footer no-print">
        <button type="button" className="c5-secondary"
          onClick={()=>void advance(step===2?1:2)}><ArrowLeft size={15}/>이전 단계</button>
        <span>{dirty?<><Save size={14}/>저장 중인 변경사항이 있습니다.</>:
          "시수는 기존 EduPlan 편성 문서에 저장되며 다른 자료는 초기화되지 않아요."}</span>
        {step===2&&<button type="button" className="c5-primary"
          disabled={busy||dirty} onClick={()=>void advance(3)}>
          편성 결과 검토 <ArrowRight size={16}/>
        </button>}
      </div>
    </section>}
    <p className="c5-bottom-note">
      기존 2026학년도 엑셀 원본, 이전 편성표, 학년도 운영편제 및 시간표 연계 데이터는 삭제하지 않았습니다.
      이 화면에서는 새 편성에 필요한 세 단계만 보여줍니다.
    </p>
  </div>;
}

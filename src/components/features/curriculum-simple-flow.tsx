"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {
  ArrowLeft,ArrowRight,BookOpen,Check,CheckCircle2,ChevronDown,
  ClipboardCheck,Download,Layers3,Plus,Settings2,ShieldCheck,TriangleAlert
} from "lucide-react";
import type {Context,Row} from "@/lib/models";
import {addGroup,createPlan} from "@/app/actions";
import {
  addCurriculumGroupsInBulk,addCurriculumSubjectsInBulk,
} from "@/app/curriculum-simple-actions";
import {orderedCurriculumGroups,orderedCurriculumSubjects} from "@/lib/curriculum-group-order";
import {CurriculumRowSubjectV4} from "./curriculum-subject-row-v4";
import {CurriculumEnhanced} from "./curriculum-enhanced";
import {CurriculumOperatingV4} from "./curriculum-operating-v4";
import {CurriculumTimetableBridgeV4} from "./curriculum-timetable-bridge-v4";
import {
  initializeDesign,validateDocument,
  type CurriculumDocument,
} from "@/lib/curriculum-design";
import {reviewCohort} from "@/lib/curriculum-workbench";
import {missingStandardGroups,parseSubjectLines} from "@/lib/curriculum-quickstart";
import {
  claimCurriculumDesign,confirmCurriculumDesign,loadCurriculumDesign,
} from "@/app/curriculum-design-actions";
import "./curriculum-simple-flow.css";

type Step="subjects"|"hours"|"review";
const STEPS:{id:Step;label:string;subtitle:string}[]=[
  {id:"subjects",label:"과목 구성",subtitle:"무엇을 가르칠까요?"},
  {id:"hours",label:"시수 배당",subtitle:"주당 몇 시간일까요?"},
  {id:"review",label:"검토·확정",subtitle:"기준에 맞게 편성됐나요?"},
];
const errorText=(e:unknown)=>e instanceof Error?e.message:"요청을 처리하지 못했습니다.";
const format=(n:number)=>Number.isInteger(n)?n.toLocaleString():n.toLocaleString("ko-KR",{maximumFractionDigits:2});

export function CurriculumSimpleFlow({context:c,initialCohort,onDirtyChange}:{
  context:Context;initialCohort?:number;
  onDirtyChange:(dirty:boolean)=>void;
}){
  const router=useRouter();
  const [step,setStep]=useState<Step>("subjects");
  const [cohort,setCohort]=useState(initialCohort??c.year?.year??c.plans[0]?.cohort_year??2026);
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [groupToAdd,setGroupToAdd]=useState<string|null>(null);
  const [groupName,setGroupName]=useState("");
  const [subjectNames,setSubjectNames]=useState("");
  const [showExtra,setShowExtra]=useState(false);
  const onEditorDirty=useCallback((next:boolean)=>{
    setDirty(next);onDirtyChange(next);
  },[onDirtyChange]);
  const plan=c.plans.find(item=>item.cohort_year===cohort);
  const groups=useMemo(()=>orderedCurriculumGroups(c.groups),[c.groups]);
  const subjects=useMemo(()=>orderedCurriculumSubjects(c.subjects,c.groups),[c.subjects,c.groups]);
  const editable=c.role==="admin"||c.role==="editor";
  const subjectCount=subjects.length;
  const academicVersion=cohort>=2025?"2022 개정":"2015 개정";
  function navigate(next:Step){
    if(next===step)return;
    if(dirty){setError("변경된 시수가 자동 저장될 때까지 기다린 다음 이동해 주세요.");return;}
    if(next!=="subjects"&&!plan){setError("먼저 과목 구성 단계에서 ‘시수 배당 시작’을 눌러 편성표를 생성해 주세요.");return;}
    setError("");setNotice("");setStep(next);setShowExtra(false);
  }
  function changeCohort(year:number){
    if(dirty){setError("저장 중인 시수가 있습니다. 저장이 끝난 뒤 입학년도를 바꿔 주세요.");return;}
    setCohort(year);setError("");setNotice("");setShowExtra(false);
  }
  async function continueFromSubjects(){
    if(busy)return;
    if(!subjectCount){setError("시수를 배당할 과목을 하나 이상 구성해 주세요.");return;}
    if(!plan&&!editable){setError("입학년도 편성표가 아직 없어 편집 권한이 필요합니다.");return;}
    if(!plan){
      setBusy(true);setError("");setNotice("");
      try{
        const result=await createPlan(c.workspace.id,cohort);
        if(!result.ok){setError(result.error);return;}
        router.refresh();
      }catch(e){setError(errorText(e));return;}
      finally{setBusy(false);}
    }
    setStep("hours");
  }
  async function prepareGroups(){
    if(!editable||busy)return;
    const missing=missingStandardGroups(c.groups);
    if(!missing.length){setNotice("기본 교과군은 이미 준비되어 있습니다.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const result=await addCurriculumGroupsInBulk({
        workspaceId:c.workspace.id,names:missing,
      });
      if(!result.ok){setError(result.error);return;}
      setNotice("기본 교과군 "+result.data.count+"개를 추가했어요. 기존 과목은 그대로 유지했어요.");
      router.refresh();
    }catch(e){setError(errorText(e));}
    finally{setBusy(false);}
  }
  async function addNewGroup(){
    if(!editable||busy||!groupName.trim())return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await addGroup(c.workspace.id,groupName.trim());
      if(!result.ok){setError(result.error);return;}
      setGroupName("");setNotice("교과군을 추가했어요.");router.refresh();
    }catch(e){setError(errorText(e));}
    finally{setBusy(false);}
  }
  async function appendSubjects(groupId:string){
    if(!editable||busy)return;
    const names=parseSubjectLines(subjectNames);
    if(!names.length){setError("과목명을 입력해 주세요. 여러 개라면 한 줄에 하나씩 적으면 돼요.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const result=await addCurriculumSubjectsInBulk({workspaceId:c.workspace.id,groupId,names});
      if(!result.ok){setError(result.error);return;}
      setGroupToAdd(null);setSubjectNames("");
      setNotice("과목 "+result.data.count+"개를 추가했어요. 시수는 아직 배당되지 않았어요.");
      router.refresh();
    }catch(e){setError(errorText(e));}
    finally{setBusy(false);}
  }
  return <div className="cs-flow">
    <header className="cs-heading">
      <div>
        <span className="cs-eyebrow">EDUPLAN · CURRICULUM</span>
        <h1>교육과정 편성</h1>
        <p>과목을 구성하고, 주당시수를 입력하고, 편성 결과를 확인하세요.</p>
      </div>
      <label className="cs-cohort">입학년도
        <select value={cohort} disabled={busy} onChange={e=>changeCohort(Number(e.target.value))}>
          {Array.from(new Set([cohort,c.year?.year??cohort,...c.plans.map(p=>p.cohort_year)]))
            .sort((a,b)=>b-a).map(year=><option key={year} value={year}>{year}학년도</option>)}
        </select>
      </label>
    </header>
    <nav className="cs-steps" aria-label="교육과정 편성 단계">
      {STEPS.map((item,index)=>{
        const active=step===item.id;
        const previous=STEPS.findIndex(x=>x.id===step)>index;
        return <button type="button" key={item.id} className={active?"cs-step active":previous?"cs-step done":"cs-step"}
          aria-current={active?"step":undefined}
          onClick={()=>navigate(item.id)}>
          <span className="cs-step-number">{previous?<Check size={15}/>:index+1}</span>
          <span className="cs-step-caption"><strong>{item.label}</strong><small>{item.subtitle}</small></span>
        </button>;
      })}
    </nav>
    {error&&<p className="cs-message error" role="alert"><TriangleAlert size={15}/>{error}
      <button type="button" aria-label="오류 닫기" onClick={()=>setError("")}>×</button></p>}
    {notice&&<p className="cs-message" role="status"><CheckCircle2 size={15}/>{notice}</p>}

    {step==="subjects"&&<section className="cs-content" aria-label="1단계 교과군과 과목 구성">
      <div className="cs-section-intro">
        <div><span className="cs-kicker">STEP 01</span><h2>교과군과 과목부터 구성하세요</h2>
          <p>이미 등록한 과목은 그대로 있어요. 같은 교과군에 새 과목을 여러 개 한꺼번에 추가할 수 있어요.</p></div>
        <span className="cs-count">{groups.length}개 교과군 · {subjectCount}개 과목</span>
      </div>
      {!groups.length&&<div className="cs-empty">
        <BookOpen size={23}/>
        <strong>아직 교과군이 없습니다.</strong>
        <span>국가 교육과정의 기본 교과군을 먼저 준비하거나 아래에서 직접 추가하세요.</span>
      </div>}
      {editable&&c.schoolType==="중학교"&&<div className="cs-basics">
        <div><strong>중학교 기본 교과군</strong>
          <p>국어·사회·수학·과학·체육·예술·영어·선택·창체 등 빠진 교과군만 추가해요.</p></div>
        <button type="button" disabled={busy} onClick={()=>void prepareGroups()}>
          <Layers3 size={15}/>기본 교과군 준비
        </button>
      </div>}
      <div className="cs-group-list">
        {groups.map(group=>{
          const owned=subjects.filter(subject=>subject.group_id===group.id);
          const adding=groupToAdd===group.id;
          return <article className="cs-group" key={group.id}>
            <div className="cs-group-top">
              <div className="cs-group-name"><span className="cs-group-mark"/>
                <strong>{group.name}</strong><small>{owned.length}과목</small></div>
              {editable&&<button type="button" className="cs-add-trigger" disabled={busy}
                onClick={()=>{
                  setGroupToAdd(adding?null:group.id);setSubjectNames("");setError("");
                }}><Plus size={14}/>과목 추가</button>}
            </div>
            {owned.length>0?<div className="cs-subject-list">
              {owned.map(subject=><div className="cs-subject" key={subject.id}>
                <CurriculumRowSubjectV4 context={c} subjectId={subject.id} disabled={!editable||busy}
                  onSaved={()=>router.refresh()}/>
              </div>)}
            </div>:<p className="cs-empty-group">과목을 추가하면 여기에 표시돼요.</p>}
            {adding&&editable&&<div className="cs-bulk-add">
              <label htmlFor={"cs-add-"+group.id}>새 과목명 <small>한 줄에 과목 하나씩 입력</small></label>
              <textarea id={"cs-add-"+group.id} autoFocus rows={3} value={subjectNames}
                placeholder={"예: 환경 프로젝트\n디지털 리터러시\n지역 탐구"}
                onChange={e=>setSubjectNames(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();void appendSubjects(group.id);}}}/>
              <div className="cs-inline-actions">
                <button type="button" className="cs-primary cs-sm" disabled={busy||!subjectNames.trim()}
                  onClick={()=>void appendSubjects(group.id)}>
                  {busy?"등록 중…":"과목 등록"}<Check size={13}/>
                </button>
                <button type="button" className="cs-text-button" onClick={()=>{setGroupToAdd(null);setSubjectNames("");}}>취소</button>
              </div>
            </div>}
          </article>;
        })}
      </div>
      {editable&&<form className="cs-new-group" onSubmit={e=>{e.preventDefault();void addNewGroup();}}>
        <div><strong><Plus size={16}/>새 교과군 만들기</strong>
          <p>학교 특색 교육과정 등 별도의 교과군이 필요할 때만 추가하세요.</p></div>
        <input aria-label="새 교과군 이름" placeholder="교과군 이름" maxLength={60}
          value={groupName} disabled={busy} onChange={e=>setGroupName(e.target.value)}/>
        <button type="submit" disabled={busy||!groupName.trim()}>추가</button>
      </form>}
      <footer className="cs-step-footer">
        <p>교과군·과목 목록은 학교에서 함께 사용합니다. 이름을 바꾸거나 순서를 옮겨도 기존 시수 자료는 유지돼요.</p>
        <button type="button" className="cs-primary" disabled={busy||!subjectCount||(!plan&&!editable)}
          onClick={()=>void continueFromSubjects()}>
          다음 · 시수 배당<ArrowRight size={17}/>
        </button>
      </footer>
    </section>}

    {step==="hours"&&<section className="cs-content" aria-label="2단계 주당시수 배당">
      <div className="cs-section-intro">
        <div><span className="cs-kicker">STEP 02</span><h2>학기별 주당시수를 입력하세요</h2>
          <p>각 숫자는 해당 과목의 주당시수예요. 학기시수와 3개년 합계는 자동으로 계산돼요.</p></div>
        <span className="cs-count">{academicVersion} 교육과정</span>
      </div>
      <div className="cs-howto">
        <span><CheckCircle2 size={15}/>셀을 눌러 바로 숫자 입력</span>
        <span><CheckCircle2 size={15}/>엑셀 범위 붙여넣기 가능</span>
        <span><CheckCircle2 size={15}/>변경 사항 자동 저장</span>
      </div>
      <div className="cs-hours-tools">
        <span>기본 화면은 주당시수만 보여줘요.</span>
        <button type="button" onClick={()=>setShowExtra(x=>!x)}>
          <Settings2 size={14}/>{showExtra?"세부 설정 접기":"학기별 주수·선택과목 설정"}
          <ChevronDown className={showExtra?"cs-rotate":""} size={14}/>
        </button>
      </div>
      {plan?<div className={"cs-hour-editor"+(showExtra?" cs-show-advanced":"")}>
        <CurriculumEnhanced key={plan.id} context={c} cohort={cohort}
          view="cohort" simple onDirtyChange={onEditorDirty}/>
      </div>:<div className="cs-empty">
        <BookOpen size={22}/>
        <strong>입학년도 편성표를 준비하고 있어요.</strong>
        <span>자료를 불러온 후 시수표를 표시합니다. 생성되지 않았다면 과목 구성 단계에서 다시 시작해 주세요.</span>
      </div>}
      <footer className="cs-step-footer">
        <button type="button" className="cs-secondary" onClick={()=>navigate("subjects")}>
          <ArrowLeft size={15}/>과목 구성
        </button>
        <span className="cs-footer-helper">{dirty?"시수를 저장하고 있어요. 저장된 뒤 다음 단계로 이동하세요.":"편성 내용이 저장됐으면 검토 단계로 넘어가세요."}</span>
        <button type="button" className="cs-primary" disabled={dirty||!plan}
          onClick={()=>navigate("review")}>다음 · 검토 및 확정<ArrowRight size={17}/></button>
      </footer>
    </section>}

    {step==="review"&&plan&&<CurriculumSimpleReview key={plan.id} context={c}
      plan={plan} cohort={cohort} onBack={()=>navigate("hours")} onDirtyChange={onEditorDirty}/>}
  </div>;
}

function CurriculumSimpleReview({context:c,plan,cohort,onBack,onDirtyChange}:{
  context:Context;plan:Row<"curriculum_plans">;cohort:number;
  onBack:()=>void;onDirtyChange:(dirty:boolean)=>void;
}){
  const [data,setData]=useState<{
    document:CurriculumDocument|null;
    snapshots:{id:string;version:number;confirmed_at:string}[];
  }|null>(null);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [reloadKey,setReloadKey]=useState(0);
  const [advanced,setAdvanced]=useState<"operating"|"timetable"|null>(null);
  const [operatingYear,setOperatingYear]=useState(c.year?.year??cohort);
  const editable=c.role==="admin"||c.role==="editor";
  useEffect(()=>{
    let active=true;
    void loadCurriculumDesign({planId:plan.id}).then(result=>{
      if(!active)return;
      if(!result.ok){setError(result.error);setLoading(false);return;}
      setData({document:result.data.document,snapshots:result.snapshots});
      setLoading(false);
    });
    return()=>{active=false;};
  },[plan.id,reloadKey]);
  const snapshots=data?.snapshots??[];
  const doc=data?.document?initializeDesign(c,plan,data.document):null;
  const review=doc?reviewCohort(c,doc):null;
  const errors=doc?validateDocument(c,doc):[];
  async function confirm(){
    if(!doc||!editable||working||errors.length)return;
    if(!window.confirm("현재 저장된 3개년 편성안의 확정본을 생성할까요? 기존 자료는 보존됩니다."))return;
    setWorking(true);setError("");setMessage("");
    try{
      const lease=await claimCurriculumDesign({planId:plan.id});
      if(!lease.ok||!lease.data.acquired)throw Error(lease.ok?"다른 교사가 편집 중입니다.":lease.error);
      const result=await confirmCurriculumDesign({planId:plan.id});
      if(!result.ok)throw Error(result.error);
      setMessage("확정본 v"+result.data.version+"을 생성했어요.");
      setReloadKey(x=>x+1);
    }catch(e){setError(errorText(e));}
    finally{setWorking(false);}
  }
  async function exportSheet(){
    if(!doc||working)return;
    setWorking(true);setError("");
    try{
      const {downloadCurriculumWorkbook}=await import("@/lib/curriculum-export");
      await downloadCurriculumWorkbook({
        context:c,view:"cohort",cohort,layout:"modern",documents:{[plan.id]:doc},
      });
    }catch(e){setError(errorText(e));}
    finally{setWorking(false);}
  }
  return <section className="cs-content cs-review" aria-label="3단계 교육과정 검토와 확정">
    <div className="cs-section-intro">
      <div><span className="cs-kicker">STEP 03</span><h2>편성 결과를 확인하세요</h2>
        <p>입력한 주당시수로 계산한 3개년 편성과 국가 기준을 비교합니다.</p></div>
      <button type="button" className="cs-secondary" onClick={onBack}>
        <ArrowLeft size={15}/>시수표로 돌아가기
      </button>
    </div>
    {loading?<div className="cs-empty" role="status">편성 결과를 계산하고 있어요.</div>:
      !doc||!review?<div className="cs-empty">
        <TriangleAlert size={23}/><strong>저장된 시수 자료가 아직 없어요.</strong>
        <span>시수 배당 단계에서 편성표를 저장한 다음 검토해 주세요.</span>
      </div>:<>
        <div className="cs-review-stats">
          <div><small>국가 기준</small><strong>{format(review.minimum)}시간</strong></div>
          <div><small>학교 3개년 편성</small><strong>{review.effectiveTotal===null?"경로 확인 필요":format(review.effectiveTotal)+"시간"}</strong></div>
          <div><small>기준 대비 차이</small><strong>{review.effectiveTotal===null?"검토 필요":(review.difference>0?"+":"")+format(review.difference)+"시간"}</strong></div>
          <div><small>확정본</small><strong>{snapshots.length?snapshots.length+"개 보존":"아직 없음"}</strong></div>
        </div>
        <div className="cs-review-grid">
          <div className="cs-review-table">
            <div className="cs-block-head">
              <h3>교과군별 기준 시수</h3><span>{cohort>=2025?"2022 개정":"2015 개정"} 기준 · 3개년</span>
            </div>
            <table><thead><tr><th>교과군</th><th>기준</th><th>편성</th><th>증감</th></tr></thead>
              <tbody>{review.groups.map(group=><tr key={group.key}>
                <th>{group.name}</th>
                <td>{format(group.standard)}</td>
                <td>{format(group.planned)}</td>
                <td className={group.status==="정상 범위"?"":"cs-review-warning"}>
                  {group.diff>0?"+":""}{format(group.diff)}
                </td>
              </tr>)}</tbody>
            </table>
          </div>
          <aside className="cs-review-aside">
            <h3><ClipboardCheck size={18}/>검토 결과</h3>
            {errors.length>0&&<div className="cs-review-alert"><TriangleAlert size={16}/>
              <span>입력 오류 {errors.length}건 · 확정 전에 수정해야 해요.</span></div>}
            {errors.slice(0,4).map((item,i)=><p className="cs-review-item" key={"e"+i}>{item}</p>)}
            {review.warnings.length?review.warnings.slice(0,7).map((item,i)=>
              <p className="cs-review-item" key={"w"+i}><TriangleAlert size={13}/>{item}</p>):
              <p className="cs-review-good"><CheckCircle2 size={16}/>추가 검토 경고가 없어요.</p>}
            <p className="cs-review-tip">학교 특례 및 교육청 승인 여부는 자동 확정하지 않습니다.
              여러 선택과목의 실제 이수 경로도 함께 확인해 주세요.</p>
          </aside>
        </div>
        <div className="cs-review-actions">
          <div><strong>검토를 마쳤나요?</strong>
            <small>확정하면 새로운 확정본을 생성하고 기존 버전은 보존해요.</small></div>
          <button type="button" className="cs-secondary" disabled={working} onClick={()=>void exportSheet()}>
            <Download size={15}/>편성 결과 엑셀
          </button>
          <button type="button" className="cs-primary" disabled={!editable||working||!!errors.length}
            onClick={()=>void confirm()}><ShieldCheck size={16}/>
            {working?"처리 중…":"편성안 확정"}</button>
        </div>
        {snapshots.length>0&&<p className="cs-snapshots">
          가장 최근 확정본 v{snapshots[0].version} · {new Date(snapshots[0].confirmed_at).toLocaleDateString("ko-KR")}
        </p>}
      </>}
    {error&&<p className="cs-message error" role="alert">{error}</p>}
    {message&&<p className="cs-message" role="status"><CheckCircle2 size={15}/>{message}</p>}
    <div className="cs-followup">
      <div><h3>이후 운영 업무와 연결하기</h3>
        <p>실제 학년도 운영편제·과목개설·시간표 대조는 필요할 때만 열어볼 수 있어요.</p></div>
      <div className="cs-inline-actions">
        <label>운영학년도 <select value={operatingYear}
          onChange={e=>setOperatingYear(Number(e.target.value))}>
          {Array.from(new Set([operatingYear,c.year?.year??operatingYear,...c.years.map(y=>y.year)]))
            .sort((a,b)=>b-a).map(year=><option key={year} value={year}>{year}년</option>)}
        </select></label>
        <button type="button" className="cs-secondary" onClick={()=>setAdvanced(x=>x==="operating"?null:"operating")}>
          <BookOpen size={14}/>운영편제 {advanced==="operating"?"접기":"열기"}
        </button>
        <button type="button" className="cs-secondary" onClick={()=>setAdvanced(x=>x==="timetable"?null:"timetable")}>
          <Settings2 size={14}/>시간표 대조
        </button>
      </div>
      {advanced==="operating"&&<CurriculumOperatingV4 key={"operating:"+operatingYear}
        context={c} year={operatingYear} onDirtyChange={onDirtyChange}/>}
      {advanced==="timetable"&&<CurriculumTimetableBridgeV4
        key={"timetable:"+operatingYear} context={c} year={operatingYear}/>}
    </div>
  </section>;
}

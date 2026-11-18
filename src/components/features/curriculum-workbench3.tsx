"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {BookOpen,Info,Plus,Table2} from "lucide-react";
import type {Context} from "@/lib/models";
import {createPlan} from "@/app/actions";
import {basisForCohort,EDUPLAN_CURRICULUM_VERSION} from "@/lib/curriculum-workbench";
import {CurriculumEnhanced} from "./curriculum-enhanced";
import "./curriculum-workbench.css";

export function CurriculumWorkbench3({context:c,initialCohort,onDirtyChange,onOpenSubjects}:{
  context:Context;initialCohort?:number;
  onDirtyChange:(dirty:boolean)=>void;onOpenSubjects:()=>void;
}){
  const router=useRouter();
  const [view,setView]=useState<"cohort"|"operating">("cohort");
  const [cohort,setCohort]=useState(initialCohort??c.year?.year??c.plans[0]?.cohort_year??2026);
  const [dirty,setDirty]=useState(false);
  const [creating,setCreating]=useState<number|null>(null);
  const [error,setError]=useState("");
  const schoolYear=c.year?.year??cohort;
  const plan=c.plans.find(row=>row.cohort_year===cohort);
  const subjectKey=c.subjects.map(row=>row.id).sort().join("|");
  const relevant=view==="cohort"?plan?[plan]:[]:
    c.grades.map(grade=>c.plans.find(row=>row.cohort_year===schoolYear-grade+1)).filter(p=>!!p);
  const missing=view==="cohort"?plan?[]:[cohort]:
    c.grades.map(g=>schoolYear-g+1).filter(y=>!c.plans.some(p=>p.cohort_year===y));
  const editable=c.role==="admin"||c.role==="editor";
  const handleDirty=(next:boolean)=>{setDirty(next);onDirtyChange(next);};
  function switchView(next:"cohort"|"operating"){
    if(next===view)return;
    if(dirty&&!window.confirm("저장 중인 변경이 있을 수 있습니다. 이동하기 전에 저장 상태를 확인해 주세요. 계속할까요?"))return;
    setError("");handleDirty(false);setView(next);
  }
  function selectCohort(next:number){
    if(next===cohort)return;
    if(dirty&&!window.confirm("저장되지 않은 변경을 확인한 뒤 이동하는 것을 권장합니다. 계속할까요?"))return;
    setError("");handleDirty(false);setCohort(next);
  }
  async function create(year:number){
    if(creating!==null||!editable)return;
    setError("");setCreating(year);
    try{
      const result=await createPlan(c.workspace.id,year);
      if(!result.ok){setError(result.error);return;}
      setCohort(year);setView("cohort");
      router.refresh();
    }catch{setError("입학년도 편성표를 생성하지 못했습니다.");}
    finally{setCreating(null);}
  }
  return <div className="cw3-workbench">
    <div className="cw3-head no-print">
      <div className="cw3-head-copy">
        <h2>교육과정 편성기 {EDUPLAN_CURRICULUM_VERSION}</h2>
        <p>국가 기준부터 편성 → 시수 계산 → 검증 → 엑셀 출력까지 하나의 원본 데이터로 처리</p>
      </div>
      <div className="cw3-view-actions">
        <div className="cw3-switch" role="group" aria-label="교육과정 편성 보기">
          <button type="button" className={view==="cohort"?"active":""}
            onClick={()=>switchView("cohort")}>입학년도별 3개년</button>
          <button type="button" className={view==="operating"?"active":""}
            onClick={()=>switchView("operating")}>당해연도 운영</button>
        </div>
        {view==="cohort"&&<label className="cw3-cohort">입학년도
          <select value={cohort} onChange={e=>selectCohort(Number(e.target.value))}>
            {Array.from(new Set([cohort,...c.plans.map(p=>p.cohort_year)]))
              .sort((a,b)=>b-a).map(year=>
                <option key={year} value={year}>{year}학년도</option>)}
          </select>
        </label>}
      </div>
    </div>
    {view==="cohort"&&c.schoolType==="중학교"&&
      <p className="cw3-note">
        <Info size={13} style={{display:"inline",verticalAlign:"middle",marginRight:5}}/>
        적용 기준: <strong>{basisForCohort(cohort).label}</strong> ·
        국가 기준 시수는 편성 판단의 출발점이고, 학교 편성 시수는 직접 조정할 수 있습니다.
        교과군별 증감 경고는 특례·승인 여부를 자동 확정하지 않습니다.
      </p>}
    {view==="operating"&&<p className="cw3-note">
      <Table2 size={13} style={{display:"inline",verticalAlign:"middle",marginRight:5}}/>
      {schoolYear}학년도 운영표는 1학년 {schoolYear}년, 2학년 {schoolYear-1}년,
      3학년 {schoolYear-2}년 입학생 문서를 조합합니다.
      편성값은 아래 표에서 수정하면 해당 입학년도 문서에 저장됩니다.
    </p>}
    {error&&<p className="cw3-note" role="alert">{error}</p>}
    {missing.length>0&&<div className="cw3-missing">
      <BookOpen size={17}/>
      <strong>{missing.join(", ")}학년도 입학생 편성표가 없습니다.</strong>
      <span>기존 자료를 덮어쓰지 않고 새로운 편성표를 생성할 수 있습니다.</span>
      {editable&&missing.map(year=><button type="button" key={year} disabled={creating!==null}
        onClick={()=>void create(year)}>
        <Plus size={13} style={{display:"inline",verticalAlign:"middle"}}/>
        {creating===year?"생성 중…":year+" 편성표 만들기"}
      </button>)}
    </div>}
    {!c.subjects.length&&<div className="cw3-missing">
      <strong>편성할 교과목이 아직 등록되지 않았습니다.</strong>
      <span>기본 교과군 아래에 과목을 등록하면 엑셀처럼 바로 입력할 수 있어요.</span>
      <button type="button" onClick={onOpenSubjects}>교과군·과목 관리</button>
    </div>}
    {relevant.length>0&&c.subjects.length>0&&
      <CurriculumEnhanced
        key={view+":"+(view==="cohort"?cohort:schoolYear)+":"+subjectKey}
        context={c} cohort={view==="cohort"?cohort:schoolYear}
        view={view} onDirtyChange={handleDirty}/>}
    <p className="cw3-note">2026학년도 원본 26열 표는 별도로 보관됩니다. 새 편성기는
      입학년도별 시수 문서가 단일 원본이며, 기존 엑셀·나이스는 검토·공식 등록을 위한 별도 단계입니다.</p>
  </div>;
}

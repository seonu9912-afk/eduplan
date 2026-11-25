"use client";
import {canPlan} from "@/lib/planning-completion";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {BookOpen,Info,Plus} from "lucide-react";
import type {Context} from "@/lib/models";
import {createPlan} from "@/app/actions";
import {basisForCohort,EDUPLAN_CURRICULUM_VERSION} from "@/lib/curriculum-workbench";
import {CurriculumEnhanced} from "./curriculum-enhanced";
import {CurriculumOperatingV4} from "./curriculum-operating-v4";
import {CurriculumTimetableBridgeV4} from "./curriculum-timetable-bridge-v4";
import "./curriculum-workbench.css";

export function CurriculumWorkbench3({context:c,initialCohort,onDirtyChange,onOpenSubjects}:{
  context:Context;initialCohort?:number;
  onDirtyChange:(dirty:boolean)=>void;onOpenSubjects:()=>void;
}){
  const router=useRouter();
  const [view,setView]=useState<"cohort"|"operating"|"courses"|"timetable">("cohort");
  const [operatingYear,setOperatingYear]=useState(c.year?.year??initialCohort??2026);
  const [cohort,setCohort]=useState(initialCohort??c.year?.year??c.plans[0]?.cohort_year??2026);
  const [dirty,setDirty]=useState(false);
  const [creating,setCreating]=useState<number|null>(null);
  const [error,setError]=useState("");
  const plan=c.plans.find(row=>row.cohort_year===cohort);
  const subjectKey=c.subjects.map(row=>row.id).sort().join("|");
  const relevant=view==="cohort"&&plan?[plan]:[];
  const missing=view==="cohort"&&!plan?[cohort]:[];
  const editable=canPlan(c,"curriculum");
  const handleDirty=(next:boolean)=>{setDirty(next);onDirtyChange(next);};
  function switchView(next:"cohort"|"operating"|"courses"|"timetable"){
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
        <p>입학생 3개년 설계 → 연도별 독립 운영편제 → 과목개설 → 시간표 검증</p>
      </div>
      <div className="cw3-view-actions">
        <div className="cw3-switch" role="group" aria-label="교육과정 편성 보기">
          <button type="button" className={view==="cohort"?"active":""}
            onClick={()=>switchView("cohort")}>① 3개년 교육과정</button>
          <button type="button" className={view==="operating"?"active":""}
            onClick={()=>switchView("operating")}>② 학년도 운영편제</button>
          <button type="button" className={view==="courses"?"active":""}
            onClick={()=>switchView("courses")}>③ 과목개설</button>
          <button type="button" className={view==="timetable"?"active":""}
            onClick={()=>switchView("timetable")}>④ 시간표 연계</button>
        </div>
        <label className="cw3-cohort">{view==="cohort"?"입학년도":"운영학년도"}
          {view==="cohort"?<select value={cohort} onChange={e=>selectCohort(Number(e.target.value))}>
            {Array.from(new Set([cohort,...c.plans.map(p=>p.cohort_year)]))
              .sort((a,b)=>b-a).map(year=>
                <option key={year} value={year}>{year}학년도</option>)}
          </select>:<select value={operatingYear} onChange={e=>setOperatingYear(Number(e.target.value))}>
            {Array.from(new Set([operatingYear,...c.years.map(y=>y.year)]))
              .sort((a,b)=>b-a).map(year=>
                <option key={year} value={year}>{year}학년도</option>)}
          </select>}
        </label>
      </div>
    </div>
    {view==="cohort"&&c.schoolType==="중학교"&&
      <p className="cw3-note">
        <Info size={13} style={{display:"inline",verticalAlign:"middle",marginRight:5}}/>
        적용 기준: <strong>{basisForCohort(cohort).label}</strong> ·
        국가 기준 시수는 편성 판단의 출발점이고, 학교 편성 시수는 직접 조정할 수 있습니다.
        교과군별 증감 경고는 특례·승인 여부를 자동 확정하지 않습니다.
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
    {view==="cohort"&&relevant.length>0&&c.subjects.length>0&&
      <CurriculumEnhanced
        key={"cohort:"+cohort+":"+subjectKey}
        context={c} cohort={cohort}
        view="cohort" onDirtyChange={handleDirty}/>}
    {view==="operating"&&<CurriculumOperatingV4
      key={"operating:"+operatingYear+":"+subjectKey}
      context={c} year={operatingYear}
      onDirtyChange={handleDirty} onNavigate={()=>switchView("timetable")}/>}
    {view==="courses"&&<CurriculumOperatingV4
      key={"courses:"+operatingYear+":"+subjectKey}
      context={c} year={operatingYear} focus="courses"
      onDirtyChange={handleDirty}/>}
    {view==="timetable"&&<CurriculumTimetableBridgeV4
      key={"timetable:"+operatingYear} context={c} year={operatingYear}/>}
    <p className="cw3-note">3개년 설계와 학년도 운영편제는 서로 독립된 버전으로 저장됩니다.
      운영편제의 수정은 원본 3개년 교육과정을 덮어쓰지 않습니다.
      기존 2026 엑셀표는 별도의 보관 메뉴에서 열 수 있습니다.</p>
  </div>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Save, ShieldCheck, ChevronDown, ChevronRight, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Context, Row } from "@/lib/models";
import { orderedCurriculumGroups, orderedCurriculumSubjects } from "@/lib/curriculum-group-order";
import { addSubject } from "@/app/actions";
import { CurriculumInsights, CurriculumScenario } from "./curriculum-workbench";
import { CohortChoiceManager } from "./curriculum-choice-manager-v4";
import { CurriculumRowSubjectV4 } from "./curriculum-subject-row-v4";
import { operatingWeekReview } from "@/lib/curriculum-workbench";
import {
  type CurriculumDocument, type WeekRule, initializeDesign,
  getCell, evaluateCell, withCell, withFinalHours, withWeeklyHours, withWeeks,
  withTermWeeks,weekRule,
  validateDocument, curriculumVersion, nationalGroupTotals, sportsHoursByGrade,
  MIDDLE_2022_MINIMUM,
} from "@/lib/curriculum-design";
import {
  loadCurriculumDesign, claimCurriculumDesign,
  saveCurriculumDesign, confirmCurriculumDesign,
} from "@/app/curriculum-design-actions";

type Plan = Row<"curriculum_plans">;
type View = "cohort" | "operating";
type EditorState = {
  doc: CurriculumDocument; planVersion: number; docVersion: number;
  locked: boolean; loading: boolean; dirty: boolean; saving: boolean;
  revision: number; status: string; history: CurriculumDocument[]; future: CurriculumDocument[];
  snapshots: {id:string;version:number;confirmed_at:string}[];
};
type Column = { grade: number; semester: number; plan: Plan | undefined; field: "weekly" | "total" | "year" };
const format = (n:number) => Number.isInteger(n) ? String(n) : String(Number(n.toFixed(5)));
function HourInput({value,disabled,ariaLabel,cellKey,onChange,onPaste}:{
  value:number;disabled:boolean;ariaLabel:string;cellKey:string;
  onChange:(number:number)=>void;
  onPaste?:(text:string)=>boolean;
}){
  const [draft,setDraft]=useState(format(value));
  const ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(ref.current!==document.activeElement)setDraft(format(value));},[value]);
  const accept=()=>{
    if(!draft.trim()) {setDraft(format(value));return;}
    const next=Number(draft);
    if(Number.isFinite(next)&&next>=0&&next<=2000) onChange(next);
    else setDraft(format(value));
  };
  return <input ref={ref} data-design-cell={cellKey} value={draft}
    type="text" inputMode="decimal" disabled={disabled} aria-label={ariaLabel}
    onFocus={(e)=>e.target.select()} onChange={(e)=>setDraft(e.target.value)}
    onBlur={accept} onKeyDown={(e)=>{
      if(e.key==="Enter") {
        e.preventDefault();
        accept();
        const match=/^(\d+)-(\d+)$/.exec(cellKey);
        const next=match?document.querySelector<HTMLInputElement>(
          '[data-design-cell="'+(Number(match[1])+1)+'-'+Number(match[2])+'"]'):null;
        if(next&&!next.disabled){next.focus();next.select();}
        else ref.current?.blur();
        return;
      }
      if(e.key==="Escape"){setDraft(format(value));ref.current?.blur();return;}
      const offset:Record<string,[number,number]>={ArrowUp:[-1,0],ArrowDown:[1,0],
        ArrowLeft:[0,-1],ArrowRight:[0,1]};
      const delta=offset[e.key];
      if(!delta||e.shiftKey||e.altKey||e.metaKey||e.ctrlKey) return;
      const match=/^(\d+)-(\d+)$/.exec(cellKey);
      if(!match)return;
      const found=document.querySelector<HTMLInputElement>(
        '[data-design-cell="'+(Number(match[1])+delta[0])+'-'+(Number(match[2])+delta[1])+'"]');
      if(found) {e.preventDefault();accept();found.focus();found.select();}
    }}
    onPaste={(e)=>{
      const text=e.clipboardData.getData("text");
      if(/[\t\n]/.test(text)&&onPaste?.(text))e.preventDefault();
    }}
  />;
}
function QuickAddSubject({workspaceId,groupId,disabled,onCreated}:{
  workspaceId:string;groupId:string;disabled:boolean;onCreated:()=>void;
}){
  const [open,setOpen]=useState(false),[name,setName]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function create(){
    const proposed=name.trim();
    if(!proposed){setError("과목 이름을 입력해 주세요.");return;}
    setBusy(true);setError("");
    try{
      const result=await addSubject({workspace_id:workspaceId,group_id:groupId,name:proposed});
      if(!result.ok){setError(result.error);return;}
      setName("");setOpen(false);onCreated();
    }catch{setError("교과목을 추가하지 못했습니다. 다시 확인해 주세요.");}
    finally{setBusy(false);}
  }
  return <div className="cw3-inline-add no-print">
    {open&&<>
      <input aria-label="새 교과목 이름" placeholder="새 과목명" maxLength={60}
        autoFocus value={name} disabled={busy}
        onChange={e=>setName(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void create();}
          if(e.key==="Escape"){setOpen(false);setError("");}}}/>
      <button type="button" disabled={busy||!name.trim()} onClick={()=>void create()}>{busy?"추가 중…":"등록"}</button>
      <button type="button" disabled={busy} onClick={()=>{setOpen(false);setError("");}}>취소</button>
    </>}
    {!open&&<button type="button" disabled={disabled} onClick={()=>setOpen(true)}>
      <Plus size={12}/>이 교과군에 과목 추가
    </button>}
    {error&&<small role="alert">{error}</small>}
  </div>;
}
export function CurriculumEnhanced({context:c,view,cohort,onDirtyChange,simple=false}:{
  context:Context;view:View;cohort:number;onDirtyChange:(dirty:boolean)=>void;
  simple?:boolean;
}){
  const router=useRouter();
  const currentYear=c.year?.year??cohort;
  const plans=view==="cohort"
    ? c.plans.filter((p)=>p.cohort_year===cohort)
    : c.grades.map((grade)=>c.plans.find((p)=>p.cohort_year===currentYear-grade+1)).filter((p):p is Plan=>!!p);
  const planKey=plans.map((p)=>p.id).sort().join("|");
  const [states,setStates]=useState<Record<string,EditorState>>({});
  const [errors,setErrors]=useState<string[]>([]);
  const [collapsed,setCollapsed]=useState<string[]>([]);
  const [showNational,setShowNational]=useState(false);
  const [viewMode,setViewMode]=useState<"weekly"|"semester"|"yearly"|"national">("weekly");
  const [exporting,setExporting]=useState<"classic"|"modern"|null>(null);
  const [adjustFor,setAdjustFor]=useState<{planId:string;subjectId:string;grade:number;semester:number}|null>(null);
  const statesRef=useRef(states);
  const timers=useRef<Record<string,ReturnType<typeof setTimeout>>>({});
  const active=useRef(true);
  const editable=c.role==="admin"||c.role==="editor";
  const plansRef=useRef(plans);
  useEffect(()=>{statesRef.current=states;},[states]);
  useEffect(()=>{plansRef.current=plans;},[planKey]);
  useEffect(()=>{onDirtyChange(Object.values(states).some((item)=>item.dirty));},[states,onDirtyChange]);
  useEffect(()=>{
    let inScope=true;
    active.current=true;
    void Promise.all(plans.map(async(plan)=>{
      const loaded=await loadCurriculumDesign({planId:plan.id});
      if(!inScope)return;
      if(!loaded.ok){setErrors((prev)=>[...prev,loaded.error]);return;}
      const doc=initializeDesign(c,plan,loaded.data.document);
      const lock=editable?await claimCurriculumDesign({planId:plan.id}):null;
      if(!inScope)return;
      if(lock&&!lock.ok)setErrors((prev)=>[...prev,lock.error]);
      setStates((prev)=>({...prev,[plan.id]:{
        doc,planVersion:loaded.data.planVersion,docVersion:loaded.data.documentVersion,
        locked:!editable||!!lock?.ok&&lock.data.acquired,loading:false,
        dirty:false,saving:false,revision:0,status:lock?.ok&&!lock.data.acquired?"다른 교사가 편집 중 · 조회 전용":"",
        history:[],future:[],snapshots:loaded.data.snapshots,
      }}));
    }));
    return()=>{
      inScope=false;active.current=false;
      for(const timer of Object.values(timers.current))clearTimeout(timer);
      timers.current={};
      // Lease expiry is a safe fallback when the browser closes unexpectedly.
    };
    // Documents are identified by plan ID. Refreshes do not discard in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[planKey]);
  useEffect(()=>{
    if(!editable)return;
    const interval=setInterval(()=>{
      for(const plan of plansRef.current){
        if(statesRef.current[plan.id]?.locked)void claimCurriculumDesign({planId:plan.id}).then((result)=>{
          if(!result.ok||!result.data.acquired)setStates((old)=>old[plan.id]?{
            ...old,[plan.id]:{...old[plan.id],locked:false,status:"편집권이 만료되었습니다. 다시 편집권을 요청해 주세요."}
          }:old);
        });
      }
    },60000);
    return()=>clearInterval(interval);
  },[editable,planKey]);

  async function saveOne(planId:string){
    const start=statesRef.current[planId];
    if(!start||!start.dirty||start.saving||!start.locked)return;
    const problems=validateDocument(c,start.doc);
    if(problems.length){
      setErrors(problems.slice(0,15));
      setStates((old)=>({...old,[planId]:{...old[planId],status:"입력값 확인 필요 · 저장하지 않음"}}));
      return;
    }
    setStates((old)=>({...old,[planId]:{...old[planId],saving:true,status:"저장 중…"}}));
    const result=await saveCurriculumDesign({
      planId,expectedPlanVersion:start.planVersion,expectedDocVersion:start.docVersion,document:start.doc,
    });
    if(!active.current)return;
    setStates((old)=>{
      if(!old[planId])return old;
      const latest=old[planId];
      const same=latest.revision===start.revision;
      return {...old,[planId]:{
        ...latest,saving:false,
        ...(result.ok?{planVersion:result.data.planVersion,docVersion:result.data.documentVersion}:{}),
        dirty:!same||!result.ok,
        status:result.ok?(same?"자동 저장 완료":"추가 변경사항 저장 대기"):"저장 실패 · "+result.error,
      }};
    });
    if(result.ok) {
      if(statesRef.current[planId]?.revision!==start.revision)
        timers.current[planId]=setTimeout(()=>void saveOne(planId),1100);
      else router.refresh();
    } else setErrors((before)=>[...before.slice(-9),result.error]);
  }
  function schedule(planId:string){
    if(timers.current[planId])clearTimeout(timers.current[planId]);
    timers.current[planId]=setTimeout(()=>void saveOne(planId),1000);
  }
  function mutate(planId:string,fn:(doc:CurriculumDocument)=>CurriculumDocument){
    const before=statesRef.current[planId];
    if(!editable||!before?.locked||before.saving)return;
    setStates((old)=>{
      const state=old[planId];if(!state)return old;
      const changed=fn(state.doc);
      return {...old,[planId]:{...state,doc:changed,dirty:true,revision:state.revision+1,
        status:"변경사항 자동 저장 예정",
        history:[...state.history.slice(-19),state.doc],future:[]}};
    });
    schedule(planId);
  }
  async function reacquire(plan:Plan,force=false){
    const result=await claimCurriculumDesign({planId:plan.id,force});
    if(result.ok&&result.data.acquired){
      setStates((old)=>old[plan.id]?{...old,[plan.id]:{...old[plan.id],locked:true,status:"편집권을 획득했습니다."}}:old);
    }else setErrors((old)=>[...old.slice(-7),result.ok?"다른 교사가 편집 중입니다.":result.error]);
  }
  async function confirm(plan:Plan){
    const state=statesRef.current[plan.id];
    if(!state||state.dirty||state.saving||!state.locked){setErrors(["저장을 완료한 뒤 확정본을 생성해 주세요."]);return;}
    const result=await confirmCurriculumDesign({planId:plan.id});
    if(result.ok){
      setStates((prev)=>({...prev,[plan.id]:{...prev[plan.id],
        status:"확정본 생성 완료 · 버전 "+result.data.version,
        snapshots:[{id:result.data.id,version:result.data.version,confirmed_at:new Date().toISOString()},...prev[plan.id].snapshots]}}));
    }else setErrors([result.error]);
  }
  function historyMove(planId:string,undo:boolean){
    const state=statesRef.current[planId];
    if(!state||!state.locked)return;
    const stack=undo?state.history:state.future;
    const previous=stack.at(-1);if(!previous)return;
    setStates((old)=>{
      const item=old[planId];
      return {...old,[planId]:{...item,doc:previous,revision:item.revision+1,
        dirty:true,status:"실행 취소/재실행 자동 저장 대기",
        history:undo?item.history.slice(0,-1):[...item.history,item.doc],
        future:undo?[...item.future,item.doc]:item.future.slice(0,-1)}};
    });schedule(planId);
  }
  const columns:Column[]=c.grades.flatMap<Column>((grade):Column[]=>{
    const target=plans.find(p=>p.cohort_year===(view==="cohort"?cohort:currentYear-grade+1));
    if(viewMode==="yearly")return [{grade,semester:0,plan:target,field:"year" as const}];
    const field=viewMode==="weekly"?"weekly" as const:"total" as const;
    return [1,2].map(semester=>({grade,semester,plan:target,field}));
  });
  // Show even empty national-order groups so teachers can add a first subject.
  const groupList=orderedCurriculumGroups(c.groups).map(group=>group.id);
  const visibleSubjects=orderedCurriculumSubjects(c.subjects,c.groups)
    .filter(subject=>!collapsed.includes(subject.group_id));
  const pendingEdit=Object.values(states).some(item=>item.dirty||item.saving);
  const allLoaded=plans.every((p)=>!!states[p.id]);
  async function exportSheet(layout:"classic"|"modern"){
    if(!allLoaded||!plans.length||exporting)return;
    setExporting(layout);
    try{
      const {downloadCurriculumWorkbook}=await import("@/lib/curriculum-export");
      await downloadCurriculumWorkbook({context:c,view,cohort,layout,
        documents:Object.fromEntries(plans.map((plan)=>[plan.id,states[plan.id].doc]))});
    }catch(error){
      setErrors((old)=>[...old.slice(-7),error instanceof Error?error.message:"엑셀 파일을 생성하지 못했습니다."]);
    }finally{setExporting(null);}
  }
  const totalOf=(subjectId:string,column:Column)=>{
    const doc=column.plan?states[column.plan.id]?.doc:null;
    const cell=getCell(doc,subjectId,column.grade,column.semester);
    if(column.field==="year"){
      if(!doc)return null;
      return [1,2].reduce((sum,semester)=>{
        const item=getCell(doc,subjectId,column.grade,semester);
        return sum+(item?evaluateCell(doc,item).total:0);
      },0);
    }
    return !cell||!doc?null:column.field==="weekly"?cell.weekly:evaluateCell(doc,cell).total;
  };
  const subjectSemesterHours=(subjectId:string,grade:number,semester:number)=>{
    const source=plans.find(plan=>plan.cohort_year===(view==="cohort"?cohort:currentYear-grade+1));
    const doc=source?states[source.id]?.doc:null;
    const cell=getCell(doc,subjectId,grade,semester);
    return doc&&cell?evaluateCell(doc,cell).total:0;
  };
  const subjectAllHours=(subjectId:string)=>c.grades.reduce((sum,grade)=>sum+
    [1,2].reduce((hours,semester)=>hours+subjectSemesterHours(subjectId,grade,semester),0),0);
  function updateValue(subjectId:string,column:Column,next:number){
    if(!column.plan||column.field==="year")return;
    mutate(column.plan.id,(doc)=>column.field==="weekly"
      ?withWeeklyHours(doc,subjectId,column.grade,column.semester,next)
      :withFinalHours(doc,subjectId,column.grade,column.semester,next));
  }
  function pasteCells(text:string,row:number,col:number){
    const data=text.replace(/\r/g,"").trimEnd().split("\n").map((line)=>line.split("\t"));
    if(!data.length||data.length>visibleSubjects.length-row||data.some((cells)=>cells.length>columns.length-col))return false;
    const updates=new Map<string,{subjectId:string;col:Column;number:number}[]>();
    for(let i=0;i<data.length;i++)for(let j=0;j<data[i].length;j++){
      const n=Number(data[i][j].replace(/,/g,""));
      const column=columns[col+j];if(!Number.isFinite(n)||n<0||n>2000||!column.plan
        ||column.field==="year")return false;
      const list=updates.get(column.plan.id)??[];
      list.push({subjectId:visibleSubjects[row+i].id,col:column,number:n});
      updates.set(column.plan.id,list);
    }
    for(const [planId,items]of updates)mutate(planId,(doc)=>{
      let next=doc;
      for(const item of items) next=item.col.field==="weekly"
        ?withWeeklyHours(next,item.subjectId,item.col.grade,item.col.semester,item.number)
        :withFinalHours(next,item.subjectId,item.col.grade,item.col.semester,item.number);
      return next;
    });
    return true;
  }
  const firstPlan=view==="cohort"?plans[0]:undefined;
  const firstDoc=firstPlan?states[firstPlan.id]?.doc:null;
  const operatingWeek=view==="operating"
    ?operatingWeekReview(c,currentYear,Object.fromEntries(plans.flatMap(plan=>
        states[plan.id]?[ [plan.id,states[plan.id].doc] ]:[]))):null;
  const canChangeOperatingWeeks=plans.length===c.grades.length&&
    plans.every(plan=>!!states[plan.id]?.locked&&!states[plan.id].saving);
  function applyOperatingWeeks(patch:Partial<WeekRule>){
    if(!operatingWeek||!canChangeOperatingWeeks)return;
    const next={...operatingWeek.rule,...patch};
    for(const plan of plans)mutate(plan.id,doc=>withWeeks(doc,currentYear,next));
  }
  return <div className="cv2">
    <div className="cv2-modebar no-print" role="group" aria-label="교육과정 편성 보기 방식">
      {([["weekly","주당시수 편집"],["semester","학기시수 보기·조정"],
         ["yearly","학년별 합계"],["national","국가 기준 비교"]] as const).map(([key,label])=>
        <button type="button" key={key} className={viewMode===key?"active":""}
          onClick={()=>{setViewMode(key);if(key==="national")setShowNational(true);}}>
          {label}
        </button>)}
      <span>기본 입력은 주당시수 · 학기 총시수 직접 수정 시 차액은 조정 시수로 기록</span>
    </div>
    <div className="cv2-toolbar no-print">
      <div><strong>{view==="cohort"?cohort+"학년도 입학생 · 3개년":currentYear+"학년도 · 1~3학년"} 직접 편성</strong>
        <p>주당 시수와 학기 총시수를 표에서 직접 수정하면 자동 계산·저장됩니다. 기존 학사일정과 시간표는 변경하지 않습니다.</p>
      </div>
      <div className="cv2-actions">
        {allLoaded&&plans.length>0&&<div className="cv2-export-buttons">
          <button type="button" disabled={!!exporting} onClick={()=>void exportSheet("classic")}>
            <Download size={13}/>{exporting==="classic"?"생성 중…":"원본형 엑셀"}
          </button>
          <button type="button" disabled={!!exporting} onClick={()=>void exportSheet("modern")}>
            <Download size={13}/>{exporting==="modern"?"생성 중…":"현대화 엑셀"}
          </button>
        </div>}
        {plans.map((p)=>{
          const item=states[p.id];
          return <div className="cv2-plan-state" key={p.id}>
            <span>{p.cohort_year} 입학: {item?item.saving?"저장 중…":item.dirty?"저장 대기":item.status||"연결됨":"불러오는 중…"}</span>
            {item&&!item.locked&&editable&&<button onClick={()=>void reacquire(p)}>편집권 요청</button>}
            {item&&!item.locked&&c.role==="admin"&&<button onClick={()=>void reacquire(p,true)}>관리자 회수</button>}
            {item?.locked&&editable&&<>
              <button disabled={!item.dirty||item.saving} onClick={()=>void saveOne(p.id)}><Save size={13}/>저장</button>
              <button disabled={!item.history.length} onClick={()=>historyMove(p.id,true)}>취소</button>
              <button disabled={!item.future.length} onClick={()=>historyMove(p.id,false)}>재실행</button>
              {!simple&&<button disabled={item.dirty||item.saving} onClick={()=>void confirm(p)}><ShieldCheck size={13}/>확정본</button>}
            </>}
          </div>;
        })}
      </div>
    </div>
    {errors.length>0&&<div className="cv2-errors" role="alert">
      <button onClick={()=>setErrors([])} aria-label="오류 메시지 닫기">×</button>
      {errors.slice(-8).map((error,i)=><p key={i}>{error}</p>)}
    </div>}
    {plans.length===0&&<p className="cv2-empty">연결할 입학년도 편성표가 없습니다. 먼저 ‘편성표 만들기’에서 해당 입학년도를 생성해 주세요.</p>}
    {plans.length>0&&!allLoaded&&<p className="cv2-empty">교육과정 편성 자료와 편집 상태를 불러오는 중입니다.</p>}
    {plans.length>0&&allLoaded&&<>
      {c.schoolType==="중학교"&&<CurriculumInsights context={c} view={view} cohort={cohort}
        documents={Object.fromEntries(plans.map(plan=>[plan.id,states[plan.id].doc]))}/>}
      <div className="cv2-weeks no-print">
        <strong>편성 기준 주수</strong>
        {view==="operating"&&operatingWeek?<>
          <label>
            <span>{currentYear}학년도 · 운영 1~{c.grades.length}학년 공통</span>
            <select aria-label="운영 학년도 공통 수업 주수"
              value={operatingWeek.rule.count} disabled={!canChangeOperatingWeeks}
              onChange={e=>applyOperatingWeeks({count:Number(e.target.value) as 16|17})}>
              <option value="16">16주</option><option value="17">17주</option>
            </select>
            <select aria-label="운영 학년도 주수 확정 상태"
              value={operatingWeek.rule.status} disabled={!canChangeOperatingWeeks}
              onChange={e=>applyOperatingWeeks({status:e.target.value as WeekRule["status"]})}>
              <option value="confirmed">확정</option><option value="provisional">잠정</option>
            </select>
          </label>
          <span className="cw3-weeks-help">
            {operatingWeek.conflict
              ?"학년별 주수가 서로 다릅니다. 위 값을 변경하면 연결된 입학년도 문서에 공통 적용됩니다."
              :"운영 학년도 1~3학년에 같은 주수가 적용되어 있습니다."}
            {!canChangeOperatingWeeks&&" · 모든 학년 편성 문서 및 편집권이 필요합니다."}
          </span>
        </>:plans.map(plan=>{
          const state=states[plan.id];
          return c.grades.flatMap(grade=>[1,2].map(semester=>{
            const year=plan.cohort_year+grade-1;
            const rule=weekRule(state.doc,grade,semester);
            return <label key={plan.id+"-"+year+":"+semester}>
              <span>{year}학년도 {grade}학년 {semester}학기</span>
              <select value={rule.count} disabled={!state.locked}
                onChange={e=>mutate(plan.id,doc=>withTermWeeks(doc,year,semester as 1|2,
                  {...rule,count:Number(e.target.value) as 16|17}))}>
                <option value="16">16주</option><option value="17">17주</option>
              </select>
              <select value={rule.status} disabled={!state.locked}
                onChange={e=>mutate(plan.id,doc=>withTermWeeks(doc,year,semester as 1|2,
                  {...rule,status:e.target.value as WeekRule["status"]}))}>
                <option value="confirmed">확정</option><option value="provisional">잠정</option>
              </select>
            </label>;
          }));
        })}
      </div>
      {c.schoolType==="중학교"&&view==="cohort"&&firstPlan&&firstDoc&&
        <CurriculumScenario context={c} document={firstDoc}
          canApply={editable&&!!states[firstPlan.id]?.locked&&!states[firstPlan.id].saving}
          onApply={(subjectId,grade,semester,weekly)=>mutate(firstPlan.id,
            doc=>withWeeklyHours(doc,subjectId,grade,semester,weekly))}/>}
      <div id="curriculum-weekly-table" className="cv2-table-scroll" tabIndex={0} aria-label="교육과정 엑셀식 편성표">
        <p className="sr-only">교과군별 표는 각각 독립된 본문 그룹이며, 모든 주당·최종 시수 셀을 직접 편집할 수 있습니다.</p>
        <table className="cv2-table">
          <thead><tr>
            <th className="cv2-group-head" rowSpan={2}>교과(군)</th>
            <th className="cv2-subject-head" rowSpan={2}>교과목·활동</th>
            {c.grades.map(g=><th key={g} colSpan={viewMode==="yearly"?1:2}>
              {g}학년 <small>{view==="cohort"?cohort+g-1:currentYear}학년도</small>
            </th>)}
            <th rowSpan={2} className="cv2-total-head">3개년 합계</th>
          </tr><tr>
            {columns.map((col,i)=><th key={i} className={col.field==="weekly"?"":"cv2-derived-head"}>
              {col.field==="year"?"연간":col.semester+"학기"}
            </th>)}
          </tr></thead>
          {groupList.map((groupId)=>{
            const subjects=visibleSubjects.filter(row=>row.group_id===groupId);
            const group=c.groups.find((g)=>g.id===groupId);
            const folded=collapsed.includes(groupId);
            return <tbody key={groupId} className="cv2-body-group">
              <tr className="cv2-group-row"><th colSpan={columns.length+3}>
                <div className="cw3-group-header">
                  <button type="button" onClick={()=>setCollapsed(list=>folded?list.filter(id=>id!==groupId):[...list,groupId])}>
                    {folded?<ChevronRight size={14}/>:<ChevronDown size={14}/>}
                    {group?.name??"기타 교과군"} <small>({subjects.length}과목)</small>
                  </button>
                  {subjects.length>0&&<span className="cw3-group-sum">
                    이 표 편성 <strong>{subjects.reduce((sum,subject)=>sum+
                    subjectAllHours(subject.id),0).toLocaleString()}시간</strong>
                  </span>}
                  {editable&&<QuickAddSubject workspaceId={c.workspace.id}
                    groupId={groupId} disabled={pendingEdit||!allLoaded}
                    onCreated={()=>router.refresh()}/>}
                </div>
              </th></tr>
              {!folded&&subjects.map((subject)=>{
                const r=visibleSubjects.findIndex((s)=>s.id===subject.id);
                return <tr key={subject.id}>
                  <td className="cv2-group-cell">{group?.name??"기타"}</td>
                  <th scope="row" className="cv2-subject-cell">
                    <CurriculumRowSubjectV4 context={c} subjectId={subject.id}
                      disabled={!editable||pendingEdit} onSaved={()=>router.refresh()}/>
                  </th>
                  {columns.map((col,k)=>{
                    const cellValue=totalOf(subject.id,col);
                    const state=col.plan?states[col.plan.id]:null;
                    const eligible=editable&&!!state?.locked&&!state.saving&&cellValue!==null;
                    return <td key={k} className={col.field==="total"?"cv2-total-cell":""}>
                      {cellValue===null?"—":col.field==="year"
                        ?<span className="cv2-year-sum">{format(cellValue)}</span>
                        :<HourInput key={subject.id+"-"+k}
                          cellKey={r+"-"+k} value={cellValue} disabled={!eligible}
                          ariaLabel={subject.name+" "+col.grade+"학년 "+col.semester+"학기 "+(col.field==="weekly"?"주당 시수":"최종 시수")}
                          onChange={(value)=>updateValue(subject.id,col,value)}
                          onPaste={(text)=>pasteCells(text,r,k)}/>}
                      {col.field!=="year"&&eligible&&<button className="cv2-adjust-btn"
                        title="학기별 조정 시수 설정" onClick={()=>setAdjustFor({planId:col.plan!.id,subjectId:subject.id,grade:col.grade,semester:col.semester})}>조정</button>}
                    </td>;
                  })}
                  <td className="cv2-row-sum">{subjectAllHours(subject.id).toLocaleString()}</td>
                </tr>;
              })}
            </tbody>;
          })}
          <tfoot><tr><th colSpan={2}>{viewMode==="weekly"?"학기별 주당시수 합계":"학기·학년별 총시수"}</th>
            {columns.map((col,k)=><td key={k} className={col.field==="total"?"cv2-total-cell":""}>
              {c.subjects.reduce((sum,subject)=>sum+(totalOf(subject.id,col)??0),0).toLocaleString()}
            </td>)}
            <td>{c.subjects.reduce((sum,subject)=>sum+subjectAllHours(subject.id),0).toLocaleString()}</td>
          </tr></tfoot>
        </table>
      </div>
      <p className="cv2-footnote">학기 총시수를 직접 변경하면 차액만 별도 조정값으로 기록돼 기존 주당 시수와 조정 내역을 보존합니다. 숫자를 붙여넣거나 방향키로 셀을 이동할 수 있어요.</p>
      {view==="cohort"&&firstPlan&&firstDoc&&
        <CohortChoiceManager context={c} doc={firstDoc}
          editable={editable&&!!states[firstPlan.id]?.locked&&!states[firstPlan.id]?.saving}
          onEdit={doc=>mutate(firstPlan.id,()=>doc)}/>}

      {firstPlan&&firstDoc&&<>
        <div className="cv2-verify-head no-print">
          <Button variant="outline" onClick={()=>setShowNational((v)=>!v)}>
            <CheckCircle2 size={15}/>{showNational?"추가 기준 검토 접기":"스포츠클럽·상세 검토"}
          </Button>
          <span>{curriculumVersion(cohort).label} · {states[firstPlan.id].snapshots.length}개 확정본 조회</span>
        </div>
        {showNational&&<div className="cv2-check">
          <p>이 입학년도에 적용되는 교육과정의 기준 시수와 편성 시수를 비교합니다. 학교 특례·후속 개정 고시·개설 과목 분류는 별도 확인이 필요하므로 법적 위반 여부를 자동 확정하지 않습니다.</p>
          {curriculumVersion(cohort).verified?
            <table><thead><tr><th>교과군</th><th>국가 기준</th><th>현재 편성</th><th>증감</th><th>검토</th></tr></thead>
            <tbody>{nationalGroupTotals(c,firstDoc).map((row)=><tr key={row.key}>
              <th>{row.label}</th><td>{row.hours}</td><td>{format(row.actual)}</td>
              <td>{format(row.diff)}</td><td>{row.status}</td>
            </tr>)}</tbody></table>:
            <p>이 입학년도에 적용할 이전 교육과정의 정확한 국가 기준 자료가 아직 등록되지 않았습니다.</p>}
          <p>3개년 편성 합계: {format(firstDoc.cells.reduce((sum,cell)=>sum+evaluateCell(firstDoc,cell).total,0))}시간 · 중학교 기준 최소 총시수 {MIDDLE_2022_MINIMUM}시간</p>
          <p>학교스포츠클럽: {sportsHoursByGrade(c,firstDoc).map((x)=>x.grade+"학년 "+format(x.hours)+"시간").join(" / ")} · 국가 기준 연간 34시간·학기별 편성 여부 검토</p>
        </div>}
      </>}
      {adjustFor&&states[adjustFor.planId]&&
        <AdjustmentEditor
          detail={adjustFor}
          doc={states[adjustFor.planId].doc}
          subjects={c.subjects}
          onClose={()=>setAdjustFor(null)}
          onChange={(fn)=>mutate(adjustFor.planId,fn)}
        />}

    </>}
  </div>;
}

function AdjustmentEditor({
  detail,doc,subjects,onClose,onChange,
}:{
  detail:{planId:string;subjectId:string;grade:number;semester:number};
  doc:CurriculumDocument;subjects:Context["subjects"];onClose:()=>void;
  onChange:(fn:(source:CurriculumDocument)=>CurriculumDocument)=>void;
}){
  const [kind,setKind]=useState("자유학기제 시수 조정");
  const cell=getCell(doc,detail.subjectId,detail.grade,detail.semester);
  if(!cell)return null;
  const update=(fn:(current:NonNullable<typeof cell>)=>NonNullable<typeof cell>)=>
    onChange((source)=>withCell(source,detail.subjectId,detail.grade,detail.semester,fn));
  return <div className="cv2-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="cv2-adjust-dialog" role="dialog" aria-modal="true" aria-label="학기 시수 조정"
      onClick={(event)=>event.stopPropagation()}>
      <div className="cv2-dialog-head"><h3>학기 시수 조정</h3>
        <button type="button" onClick={onClose}>닫기</button></div>
      <p>{subjects.find((s)=>s.id===detail.subjectId)?.name} · {detail.grade}학년 {detail.semester}학기</p>
      <p>기본 {format(evaluateCell(doc,cell).base)}시간 + 유형별 조정 {format(evaluateCell(doc,cell).adjustments)}시간
        + 직접 조정 {format(cell.manual)}시간 = <strong>{format(evaluateCell(doc,cell).total)}시간</strong></p>
      <div className="cv2-adjust-list">
        {cell.adjustments.map((adj)=><div key={adj.id}>
          <span>{adj.kind}</span>
          <input type="number" step="1" value={adj.hours}
            onChange={(event)=>{
              const value=Number(event.target.value);
              if(Number.isFinite(value))update((old)=>({...old,adjustments:old.adjustments.map((a)=>
                a.id===adj.id?{...a,hours:value}:a)}));
            }}/>
          <button type="button" onClick={()=>update((old)=>({...old,
            adjustments:old.adjustments.filter((a)=>a.id!==adj.id)}))}>삭제</button>
        </div>)}
        <select value={kind} onChange={(event)=>setKind(event.target.value)} aria-label="조정 유형">
          {["자유학기제 시수 조정","학교자율시간 관련 조정","일반 편성 조정","학교 자체 조정"].map((item)=>
            <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={()=>update((old)=>({...old,adjustments:[...old.adjustments,
          {id:crypto.randomUUID(),kind,hours:0}]}))}>조정 유형 추가</button>
      </div>
      <Button onClick={onClose}>완료</Button>
    </section>
  </div>;
}

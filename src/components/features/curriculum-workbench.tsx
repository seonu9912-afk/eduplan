"use client";

import {useMemo,useState} from "react";
import {ArrowLeftRight,FlaskConical,Info,ShieldCheck,TriangleAlert} from "lucide-react";
import type {Context} from "@/lib/models";
import type {CurriculumDocument} from "@/lib/curriculum-design";
import {getCell} from "@/lib/curriculum-design";
import {
  reviewCohort,reviewOperatingYear,simulateWeeklyAllocation,
} from "@/lib/curriculum-workbench";
import "./curriculum-workbench.css";

type ScenarioProps={
  context:Context;document:CurriculumDocument;canApply:boolean;
  onApply:(subjectId:string,grade:number,semester:number,weekly:number)=>void;
};
export function CurriculumScenario({context,document,canApply,onApply}:ScenarioProps){
  const [subjectId,setSubjectId]=useState(context.subjects[0]?.id??"");
  const [grade,setGrade]=useState(1);
  const [semester,setSemester]=useState(1);
  const [trial,setTrial]=useState<string|null>(null);
  const [visible,setVisible]=useState(false);
  const cell=getCell(document,subjectId,grade,semester);
  const effective=trial===null?cell?.weekly??0:Number(trial);
  const valid=Number.isFinite(effective)&&effective>=0&&effective<=100&&trial!=="";
  const preview=valid&&subjectId?simulateWeeklyAllocation(
    context,document,subjectId,grade,semester,effective):null;
  const subject=context.subjects.find(row=>row.id===subjectId);
  const selection=(nextId:string,nextGrade:number,nextSemester:number)=>{
    setSubjectId(nextId);setGrade(nextGrade);setSemester(nextSemester);setTrial(null);
  };
  return <section className="cw3-simulator no-print" aria-label="교육과정 시수 변경 시험">
    <button type="button" className="cw3-simulator-toggle" onClick={()=>setVisible(old=>!old)}>
      <FlaskConical size={16}/>
      <span>시수 변경 미리 계산</span>
      <small>실제 편성값을 바꾸기 전에 결과 비교</small>
      <span aria-hidden="true">{visible?"접기":"펼치기"}</span>
    </button>
    {visible&&<div className="cw3-simulator-body">
      <div className="cw3-simulator-inputs">
        <label>교과목
          <select value={subjectId} onChange={e=>selection(e.target.value,grade,semester)}>
            {context.subjects.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label>학년
          <select value={grade} onChange={e=>selection(subjectId,Number(e.target.value),semester)}>
            {context.grades.map(n=><option key={n} value={n}>{n}학년</option>)}
          </select>
        </label>
        <label>학기
          <select value={semester} onChange={e=>selection(subjectId,grade,Number(e.target.value))}>
            <option value={1}>1학기</option><option value={2}>2학기</option>
          </select>
        </label>
        <label>시험할 주당 시수
          <input inputMode="decimal" type="number" min="0" max="100" step="0.25"
            value={trial??String(cell?.weekly??0)}
            onChange={e=>setTrial(e.target.value)}/>
        </label>
      </div>
      {preview?<div className="cw3-simulator-results">
        <div><small>{subject?.name??"교과목"} · 해당 학기</small>
          <strong>{preview.before} → {preview.after}시간</strong></div>
        <div><small>학년·학기 전체(단순 합계)</small>
          <strong>{preview.beforeTerm} → {preview.afterTerm}시간</strong></div>
        <div><small>교과군 기준 대비 증감</small>
          <strong>{preview.beforeGroup?.diff??"—"} → {preview.afterGroup?.diff??"—"}시간</strong></div>
        <div className="cw3-sim-change"><small>변경되는 시수</small>
          <strong>{preview.delta>0?"+":""}{preview.delta}시간</strong></div>
      </div>:<p className="cw3-help">0~100 사이의 유효한 주당 시수를 입력해 주세요.</p>}
      <div className="cw3-sim-footer">
        <span>시험값은 저장되지 않습니다. 실제 적용 시 기존 조정 시수는 그대로 유지됩니다.</span>
        <button type="button" disabled={!preview||!canApply||!subjectId||
          effective===(cell?.weekly??0)}
          onClick={()=>{
            if(preview)onApply(subjectId,grade,semester,effective);
            setTrial(null);
          }}>이 편성표에 적용</button>
      </div>
    </div>}
  </section>;
}
export function CurriculumInsights({context,view,cohort,documents}:{
  context:Context;view:"cohort"|"operating";cohort:number;
  documents:Readonly<Record<string,CurriculumDocument|undefined>>;
}){
  const [details,setDetails]=useState(false);
  const firstPlan=context.plans.find(p=>p.cohort_year===cohort);
  const first=firstPlan?documents[firstPlan.id]:null;
  const cohortReview=useMemo(()=>view==="cohort"&&first
    ?reviewCohort(context,first):null,[context,first,view]);
  const operating=useMemo(()=>view==="operating"
    ?reviewOperatingYear(context,context.year?.year??cohort,documents):null,
    [context,cohort,documents,view]);
  if(view==="cohort"&&!cohortReview||view==="operating"&&!operating)return null;
  const warnings=view==="cohort"?cohortReview?.warnings??[]:operating?.warnings??[];
  return <section className="cw3-insights" aria-label="교육과정 편성 계산 및 기준 검토">
    <div className="cw3-insights-main">
      {cohortReview?<>
        <div className="cw3-stat"><small>국가 교육과정</small>
          <strong>{cohortReview.basis.label}</strong></div>
        <div className="cw3-stat"><small>3개년 기준 시수</small>
          <strong>{cohortReview.minimum.toLocaleString()}시간</strong></div>
        <div className="cw3-stat"><small>학교 편성 시수(학생 선택경로 반영)</small>
          <strong>{cohortReview.effectiveTotal===null?"선택경로 검토":cohortReview.effectiveTotal.toLocaleString()+"시간"}</strong></div>
        <div className="cw3-stat"><small>기준 대비 차이</small>
          <strong>{cohortReview.difference>0?"+":""}{cohortReview.difference.toLocaleString()}시간</strong></div>
      </>:operating&&<>
        <div className="cw3-stat"><small>운영 학년도</small>
          <strong>{operating.year}학년도</strong></div>
        <div className="cw3-stat"><small>1학기 편성(단순 합계)</small>
          <strong>{operating.semesterTotals[0].toLocaleString()}시간</strong></div>
        <div className="cw3-stat"><small>2학기 편성(단순 합계)</small>
          <strong>{operating.semesterTotals[1].toLocaleString()}시간</strong></div>
        <div className="cw3-stat"><small>연간 운영 시수(단순 합계)</small>
          <strong>{operating.total.toLocaleString()}시간</strong></div>
      </>}
    </div>
    <div className="cw3-insights-controls no-print">
      <span><Info size={13}/>숫자는 연결된 입학년도 문서에서 계산합니다.</span>
      <button type="button" onClick={()=>setDetails(value=>!value)}>
        <ArrowLeftRight size={14}/>{details?"기준표 접기":"교과군 기준·구성 확인"}
      </button>
    </div>
    {warnings.length>0&&<div className="cw3-warnings">
      <TriangleAlert size={15}/>
      <div>{warnings.slice(0,4).map((warning,index)=><p key={index}>{warning}</p>)}</div>
    </div>}
    {details&&(cohortReview?<div className="cw3-details">
      <p className="cw3-help">중학교 국가 기준과 학교 편성의 교과군별 비교입니다. 경고는 검토 대상이며, 학교별 특례나 승인 여부를 자동 판정하지 않습니다.</p>
      <table><thead><tr><th>교과군</th><th>국가 기준</th><th>편성</th><th>증감</th><th>검토</th></tr></thead>
        <tbody>{cohortReview.groups.map(row=><tr key={row.key}>
          <th>{row.name}</th><td>{row.standard}</td>
          <td>{row.planned}</td><td>{row.diff>0?"+":""}{row.diff}</td>
          <td>{row.status==="정상 범위"?<span className="cw3-ok"><ShieldCheck size={12}/>범위 내</span>:row.status}</td>
        </tr>)}</tbody>
      </table>
      {cohortReview.unclassified.length>0&&
        <p className="cw3-help">교과군 분류 확인: {cohortReview.unclassified.join(", ")}</p>}
      {cohortReview.exceptions.length>0&&
        <p className="cw3-help">동시 개설 과목 검토: {cohortReview.exceptions.join(" / ")}</p>}
      <p className="cw3-help">기준 자료: {cohortReview.basis.source}</p>
    </div>:operating&&<div className="cw3-details">
      <table><thead><tr><th>운영 학년</th><th>입학년도</th><th>적용 교육과정</th><th>1학기</th><th>2학기</th><th>연간</th></tr></thead>
      <tbody>{operating.grades.map(row=><tr key={row.grade}>
        <th>{row.grade}학년</th><td>{row.cohort}년 입학</td>
        <td>{row.basis} 개정</td><td>{row.planId?row.first:"자료 없음"}</td>
        <td>{row.planId?row.second:"자료 없음"}</td>
        <td>{row.planId?row.total:"—"}</td>
      </tr>)}</tbody></table>
      <p className="cw3-help">당해연도 편성표는 각 학년의 입학년도 문서에서 해당 학년 값만 읽습니다. 국가 3개년 기준은 입학년도별 보기에서 확인하세요.</p>
    </div>)}
  </section>;
}

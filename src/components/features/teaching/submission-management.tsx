"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Modal, InlineNotice, useMutation } from "@/components/common";
import { readTeachingSubmission, reviewTeachingSubmission, saveTeachingDeadlines } from "@/app/teaching-actions";
import { dueForScope, type TeachingDeadline, activeSubmission, latestSubmission, submissionScopeLabel, submissionStatusLabels, type SubmissionDetail, type TeachingSubmission, type SubmissionScope } from "@/lib/teaching-submissions";
import { curriculumTeachingTargets } from "@/lib/teaching-targets";
import { emptyTeachingDocument, teachingDocumentSchema, reviewTeaching } from "@/lib/teaching";
import type { Context, Row } from "@/lib/models";
import { TeachingPrint } from "./teaching-print";

type CourseRow = { id:string; grade:number; semester:number; subject_name:string; teacher_name:string; course?: Row<"teaching_courses"> };
const scopeFor = (term: number): SubmissionScope => term === 1 ? "assessment_1" : "assessment_2";
function date(value:string){return new Date(value).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});}
type CellState = "미제출" | "검토 대기" | "검토 중" | "수정 요청" | "검토 완료";
function state(row?: TeachingSubmission): CellState {
  return !row || row.status === "withdrawn" ? "미제출" : submissionStatusLabels[row.status] as CellState;
}
export function SubmissionManagement({context:c,initialSemester}:{context:Context;initialSemester:string}){
  const [term,setTerm]=useState(initialSemester==="1"?1:2);
  const [grade,setGrade]=useState("all");
  const [status,setStatus]=useState("all");
  const [selected,setSelected]=useState<string|null>(null);
  const [settingDeadline,setSettingDeadline]=useState(false);
  const data=c.teaching!;
  if(data.submissions===undefined) return <p className="notice notice-error" role="alert">제출 기록을 불러오지 못했습니다. 새로고침 후 다시 확인하세요.</p>;
  const submissions=data.submissions;
  const registered=data.courses.filter(p=>!p.archived && (p.semester===term || p.semester===0));
  const rows: CourseRow[]=registered.map(course=>({...course,course}));
  const known=new Set(data.courses.map(course=>course.id));
  // Private drafts are not loaded by reviewers. Only actual submitted metadata is visible.
  for(const row of submissions){
    if(known.has(row.course_id) || (row.semester!==term && row.semester!==0)) continue;
    known.add(row.course_id);
    rows.push({id:row.course_id,grade:row.grade,semester:row.semester,subject_name:row.subject_name,teacher_name:row.teacher_name});
  }
  const cells=rows.map(row=>{
    const records=submissions.filter(s=>s.course_id===row.id);
    return {...row,lesson:latestSubmission(records,"lesson"),assessment:latestSubmission(records,scopeFor(term))};
  }).sort((a,b)=>a.grade-b.grade||a.subject_name.localeCompare(b.subject_name,"ko")||a.teacher_name.localeCompare(b.teacher_name,"ko"));
  const states=cells.flatMap(r=>[state(r.lesson),state(r.assessment)]);
  const summary=[{label:"미제출",count:states.filter(s=>s==="미제출").length,key:"draft"},{label:"검토 대기·중",count:states.filter(s=>s==="검토 대기"||s==="검토 중").length,key:"submitted"},{label:"수정 요청",count:states.filter(s=>s==="수정 요청").length,key:"changes_requested"},{label:"검토 완료",count:states.filter(s=>s==="검토 완료").length,key:"accepted"}];
  // Coverage requires an exact subject ID and known class/teacher association; never match names.
  const targets=curriculumTeachingTargets(c).filter(t=>t.semester===term);
  const timetable=c.operations?.timetable?.document.weekly??[];
  const unresolved=targets.filter(t=>{
    const candidates=registered.filter(p=>p.grade===t.grade && p.subject_id===t.subjectId);
    const gradeClasses=new Set(c.classes.filter(cls=>cls.grade===t.grade).map(cls=>cls.id));
    const assignments=timetable.filter(a=>a.subjectId===t.subjectId && a.scope==="class" && gradeClasses.has(a.scopeId));
    if(!assignments.length || !candidates.length) return true;
    return !assignments.every(a=>candidates.some(p=>{
      const teacher=c.operations?.directory.find(x=>x.id===a.teacherId||x.user_id===a.teacherId);
      return !!p.teacher_id && (p.teacher_id===a.teacherId||p.teacher_id===teacher?.id) &&
        data.classes.some(l=>l.course_id===p.id&&l.class_id===a.scopeId);
    }));
  });
  const filtered=cells.filter(r=>(grade==="all"||String(r.grade)===grade)&&(status==="all"||state(r.lesson)===status||state(r.assessment)===status||(status==="pending"&&[state(r.lesson),state(r.assessment)].some(s=>s==="검토 대기"||s==="검토 중"))));
  const chosen=submissions.find(s=>s.id===selected);
  return <section className="teaching-submission-management">
    <div className="section-title"><h2>제출 관리</h2><label className="submission-term"><span className="sr-only">제출 관리 학기</span><select value={term} onChange={e=>setTerm(Number(e.target.value))}><option value={1}>1학기</option><option value={2}>2학기</option></select></label></div>
    <div className="submission-deadline-strip">
      <div><small>교수학습계획 마감</small><strong>{dueForScope(c.teachingDeadlines?.deadlines??[],term,"lesson")??"미설정"}</strong></div>
      <div><small>평가계획 마감</small><strong>{dueForScope(c.teachingDeadlines?.deadlines??[],term,scopeFor(term))??"미설정"}</strong></div>
      <Button variant="outline" size="sm" disabled={!c.teachingDeadlines} onClick={()=>setSettingDeadline(true)}>기한 설정</Button>
    </div>
    <Modal open={settingDeadline} onOpenChange={setSettingDeadline} title={`${term}학기 제출 기한 설정`} description="학교 공통 제출 기한입니다. 비워 두면 기한을 해제합니다.">
      {settingDeadline&&<DeadlineSettings key={term} context={c} term={term} deadline={c.teachingDeadlines?.deadlines.find(d=>d.semester===term)} onDone={()=>setSettingDeadline(false)}/>}
    </Modal>
    <div className="submission-summary">{summary.map(d=><button key={d.key} type="button" data-state={d.key} aria-pressed={status===(d.key==="submitted"?"pending":d.label)} onClick={()=>setStatus(status===(d.key==="submitted"?"pending":d.label)?"all":d.key==="submitted"?"pending":d.label)}><span>{d.label}</span><strong>{d.count}</strong></button>)}</div>
    {states.length>0&&<div className="submission-summary-bar" aria-hidden="true">{summary.map(d=><span key={d.key} data-state={d.key} style={{width:`${100*d.count/states.length}%`}}/>)}</div>}
    <p className="muted-small">확인 가능한 계획 {states.length}건 · 검토 완료 {summary[3].count}건. 교육과정 미연결 대상은 아래에서 별도로 확인합니다.</p>
    <div className="submission-filters"><select aria-label="제출 관리 학년" value={grade} onChange={e=>setGrade(e.target.value)}><option value="all">전체 학년</option>{c.grades.map(g=><option key={g} value={g}>{g}학년</option>)}</select><select aria-label="제출 관리 상태" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">전체 상태</option><option value="pending">검토 대기·중</option>{["미제출","검토 대기","검토 중","수정 요청","검토 완료"].map(v=><option key={v}>{v}</option>)}</select></div>
    <div className="table-scroll submission-table"><table className="plan-table"><thead><tr><th>교과·담당 교사</th><th>교수학습</th><th>평가계획</th></tr></thead><tbody>
      {filtered.map(r=><tr key={r.id}><th><strong>{r.grade}학년 {r.subject_name}</strong><small>{r.teacher_name}{r.semester===0?" · 연간":""}</small></th>{[r.lesson,r.assessment].map((record,i)=><td key={i}>{record?<button type="button" className="submission-cell" data-status={record.status} onClick={()=>setSelected(record.id)}>{state(record)}<small>v{record.version} · {date(record.submitted_at)}</small></button>:<span className="muted-small">미제출</span>}</td>)}</tr>)}
      {!filtered.length&&<tr><td colSpan={3}>해당하는 계획이 없습니다.</td></tr>}
    </tbody></table></div>
    <Disclosure compact label={`교육과정 작성 대상 연결 확인 · ${unresolved.length}건`}>
      <p className="muted-small">과목·교원·학급 연결이 확인되지 않은 대상입니다. 비공개 제출본이나 선택 과목이 포함될 수 있으므로 미제출 건수에 중복 합산하지 않습니다.</p>
      {unresolved.map(t=><div className="submission-unresolved" key={`${t.grade}:${t.subjectId}`}><strong>{t.grade}학년 {t.subjectName}</strong><span>{t.teacherName||"담당 교사 확인 필요"}</span></div>)}
      {!unresolved.length&&<p>확인할 대상이 없습니다.</p>}
      {!targets.length&&<p>확정된 교육과정의 작성 대상을 불러오지 못했거나 편성된 과목이 없습니다.</p>}
    </Disclosure>
    <Modal open={!!chosen} onOpenChange={open=>{if(!open)setSelected(null)}} title={chosen?`${chosen.grade}학년 ${chosen.subject_name} · ${submissionScopeLabel(chosen.scope)}`:"제출본 검토"} description="제출 시점에 저장한 내용만 확인합니다." wide>
      {chosen&&<SubmissionReview key={chosen.id} context={c} row={chosen}/>}
    </Modal>
  </section>;
}

function DeadlineSettings({context:c,term,deadline,onDone}:{context:Context;term:number;deadline?:TeachingDeadline;onDone:()=>void}){
  const [lesson,setLesson]=useState(deadline?.lesson_due??"");
  const [assessment,setAssessment]=useState(deadline?.assessment_due??"");
  const m=useMutation();
  return <form className="form-stack" onSubmit={event=>{
    event.preventDefault();
    m.execute(()=>saveTeachingDeadlines(c.workspace.id,c.year!.id,term,deadline?.version??0,lesson||null,assessment||null),onDone,"제출 기한을 저장했습니다.");
  }}>
    <label>교수학습계획<input type="date" value={lesson} onChange={e=>setLesson(e.target.value)}/></label>
    <label>평가계획<input type="date" value={assessment} onChange={e=>setAssessment(e.target.value)}/></label>
    <p className="muted-small">마감 7일 전부터 미제출 담당자에게 앱 알림이 표시됩니다. 연간 교수학습계획에는 설정된 두 학기 기한 중 가장 이른 날짜를 적용합니다. 마감 후에도 제출할 수 있습니다.</p>
    <InlineNotice mutation={m}/><Button type="submit" disabled={m.pending}>{m.pending?"저장 중…":"저장"}</Button>
  </form>;
}

function SubmissionReview({context:c,row}:{context:Context;row:TeachingSubmission}){
  const [detail,setDetail]=useState<SubmissionDetail|null>(null);
  const [error,setError]=useState("");
  const [note,setNote]=useState("");
  const m=useMutation();
  useEffect(()=>{
    let active=true;
    readTeachingSubmission(row.id).then(r=>{if(!active)return;if(r.ok)setDetail(r.data);else setError(r.error);}).catch(()=>{if(active)setError("제출본을 불러오지 못했습니다.");});
    return()=>{active=false;};
  },[row.id,row.status]);
  if(error)return <p className="notice notice-error">{error}</p>;
  if(!detail || detail.status!==row.status)return <p role="status">제출본을 불러오는 중…</p>;
  const lesson=detail.scope==="lesson";
  const term=lesson?detail.course.semester:detail.scope==="assessment_1"?1:2;
  const base=emptyTeachingDocument(term);
  const parsed=teachingDocumentSchema.safeParse({...base, ...(detail.report?{report:detail.report}:{}), ...(lesson?{units:detail.content}:{evaluations:[detail.content]})});
  if(!parsed.success)return <p className="notice notice-error">저장된 제출본의 형식을 확인할 수 없습니다. 검토 처리를 중단합니다.</p>;
  const course={id:row.course_id,...detail.course,semester:term};
  // Use only submitted class identifiers; current labels/standards are reference data.
  const cls=detail.course.classes??[];
  const snapshotContext={...c,classes:cls.map(x=>({...x,workspace_id:c.workspace.id,academic_year_id:c.year!.id} as Row<"classes">)),teaching:{...c.teaching!,classes:cls.map(x=>({course_id:row.course_id,class_id:x.id,grade:x.grade,workspace_id:c.workspace.id,academic_year_id:c.year!.id}))}};
  const issues=reviewTeaching(parsed.data,{grade:course.grade,semester:term,expected_hours:null},c.year!.year,c.semesters,c.teaching!.standards,c.schoolType).filter(i=>i.section===(lesson?"교수학습계획":"평가계획")||i.section==="수업 설정");
  const transition=(next:"reviewing"|"changes_requested"|"accepted")=>{
    if(next==="changes_requested"&&!note.trim())return;
    if(next!=="reviewing"&&!window.confirm(next==="accepted"?"이 제출 버전의 검토를 완료할까요?":"작성 교사에게 수정 요청을 보낼까요?"))return;
    m.execute(()=>reviewTeachingSubmission(row.id,row.status,next,note),()=>setNote(""),"검토 상태를 저장했습니다.");
  };
  return <div className="submission-review-detail">
    <div className="teaching-submission-heading"><strong>{detail.course.teacher_name} · v{row.version}</strong><span className="teaching-submission-state" data-status={row.status}>{submissionStatusLabels[row.status]}</span></div>
    <p className="muted-small">{date(row.submitted_at)} 제출 · 성취기준과 양식의 표시에는 현재 참조 정보가 사용될 수 있습니다. 별도 제출 범위의 수업·평가 연결은 표시되지 않습니다.</p>
    <Disclosure label="제출 문서 보기" open><TeachingPrint context={snapshotContext} course={course} document={parsed.data} mode={lesson?"lesson":"assessment"} dirty={false} preview/></Disclosure>
    <Disclosure compact label={`제출 범위 자동 점검 · 오류 ${issues.filter(i=>i.level==="오류").length}건 · 확인 필요 ${issues.filter(i=>i.level!=="오류").length}건`}>
      <ul className="review-issues">{issues.map((i,n)=><li key={n}><strong>{i.level}</strong><p>{i.message}</p></li>)}</ul>
      {!issues.length&&<p>해당 범위의 기본 점검에서 오류가 발견되지 않았습니다.</p>}
    </Disclosure>
    <Disclosure compact label="제출 및 검토 이력"><ol>{detail.events.map((e,n)=><li key={n}>{submissionStatusLabels[e.status]} · {date(e.at)}{e.note&&<p>{e.note}</p>}</li>)}</ol></Disclosure>
    {activeSubmission(row)&&<>
      <label className="submission-review-note">검토 의견<textarea rows={3} maxLength={3000} value={note} disabled={m.pending} onChange={e=>setNote(e.target.value)} placeholder="수정 요청 시 사유를 입력하세요."/></label>
      <div className="teaching-actions submission-review-actions">
        {row.status==="submitted"&&<Button variant="outline" disabled={m.pending} onClick={()=>transition("reviewing")}>검토 시작</Button>}
        <Button variant="outline" disabled={m.pending||!note.trim()} onClick={()=>transition("changes_requested")}>수정 요청</Button>
        <Button disabled={m.pending} onClick={()=>transition("accepted")}>검토 완료</Button>
      </div>
    </>}
    <InlineNotice mutation={m}/>
  </div>;
}

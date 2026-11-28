"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { InlineNotice, useMutation } from "@/components/common";
import { submitTeachingVersion, withdrawTeachingSubmission } from "@/app/teaching-actions";
import { activeSubmission, latestSubmission, submissionScopeLabel, submissionStatusLabels, type SubmissionScope, type TeachingSubmission } from "@/lib/teaching-submissions";
import type { TeachingDocument } from "@/lib/teaching";
import type { Row } from "@/lib/models";

function date(value: string) {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function TeachingSubmissionPanel({ course, document, rows, author, blocked, dirty, errors, checks, onBusyChange }: {
  course: Row<"teaching_courses">;
  document: TeachingDocument;
  rows?: TeachingSubmission[];
  author: boolean;
  blocked: boolean;
  dirty: boolean;
  errors: number;
  checks: number;
  onBusyChange: (busy: boolean) => void;
}) {
  const m = useMutation();
  useEffect(() => {
    onBusyChange(m.pending);
    return () => onBusyChange(false);
  }, [m.pending, onBusyChange]);
  const records = (rows ?? []).filter(row => row.course_id === course.id);
  const scopes: {scope: SubmissionScope; ready: boolean}[] = [
    {scope: "lesson", ready: document.units.some(u => u.title.trim())},
    ...document.evaluations.map(e => ({
      scope: (e.semester === 1 ? "assessment_1" : "assessment_2") as SubmissionScope,
      ready: e.items.length > 0,
    })),
  ];
  const canSend = (item: typeof scopes[number]) => {
    const latest = latestSubmission(records, item.scope);
    return author && item.ready && !activeSubmission(latest) &&
      !(latest?.status === "accepted" && latest.version === course.version);
  };
  const available = scopes.filter(canSend);
  const disabled = blocked || dirty || m.pending || rows === undefined || course.archived;
  const submit = (selected: SubmissionScope[]) => {
    if (disabled || !selected.length || !selected.every(scope => available.some(item => item.scope === scope))) return;
    const note = errors || checks ? `\n현재 자동 점검: 오류 ${errors}건, 확인 필요 ${checks}건. 점검 결과를 확인한 후 제출하세요.` : "";
    if (!window.confirm(`현재 저장본 v${course.version}의 ${selected.map(submissionScopeLabel).join(", ")}을 제출할까요?${note}`)) return;
    m.execute(() => submitTeachingVersion(course.id, course.version, selected), undefined, "계획을 제출했습니다.");
  };
  return <section className="teaching-section teaching-submission-panel" aria-label="계획 제출">
    <div className="section-title"><h2>계획 제출</h2>
      {author && available.length > 1 && <Button size="sm" variant="outline" disabled={disabled} onClick={() => submit(available.map(s => s.scope))}>미제출 계획 함께 제출</Button>}
    </div>
    {rows === undefined ? <p role="alert" className="notice notice-error">제출 기록을 불러오지 못했습니다. 다시 불러온 뒤 제출하세요.</p> : <>
      {dirty && <p className="muted-small">현재 수정한 내용을 먼저 저장해 주세요.</p>}
      <div className="teaching-submission-cards">
        {scopes.map(item => {
          const latest = latestSubmission(records, item.scope);
          const changed = latest && latest.version !== course.version;
          return <article key={item.scope} className="teaching-submission-card">
            <div className="teaching-submission-heading"><h3>{submissionScopeLabel(item.scope)}</h3>
              <span className="teaching-submission-state" data-status={latest?.status ?? "draft"}>{latest ? submissionStatusLabels[latest.status] : "미제출"}</span></div>
            {latest ? <>
              <p className="muted-small">제출본 v{latest.version} · {date(latest.submitted_at)} 제출</p>
              {changed && <p className="muted-small">현재 저장본 v{course.version} · 제출 이후 저장 버전 변경</p>}
              {latest.review_note && <div className="teaching-submission-note"><strong>검토 의견</strong><p>{latest.review_note}</p></div>}
            </> : <p className="muted-small">현재 저장본 v{course.version}</p>}
            {author && activeSubmission(latest) && latest && <Button variant="outline" disabled={m.pending || blocked} onClick={() => {
              if (window.confirm(`${submissionScopeLabel(item.scope)} 제출을 철회할까요? 이력은 보존됩니다.`))
                m.execute(() => withdrawTeachingSubmission(latest.id, latest.status), undefined, "제출을 철회했습니다.");
            }}>제출 철회</Button>}
            {author && !activeSubmission(latest) && !(latest?.status === "accepted" && latest.version === course.version) && <Button disabled={disabled || !item.ready} onClick={() => submit([item.scope])}>{latest ? "다시 제출" : "계획 제출"}</Button>}
            {author && !item.ready && !activeSubmission(latest) && <p className="muted-small">계획 내용을 먼저 작성하세요.</p>}
          </article>;
        })}
      </div>
      <Disclosure compact className="teaching-submission-history" label={`제출 이력 및 검토 의견 · ${records.length}건`}>
        {!records.length ? <p className="muted-small">아직 제출 이력이 없습니다.</p> : <ol>{records.map(row => <li key={row.id}>
          <div><strong>{submissionScopeLabel(row.scope)} · v{row.version}</strong><span className="teaching-submission-state" data-status={row.status}>{submissionStatusLabels[row.status]}</span></div>
          <p className="muted-small">{date(row.submitted_at)} 제출{row.reviewed_at ? ` · ${date(row.reviewed_at)} 검토` : ""}</p>
          {row.review_note && <p className="teaching-submission-note">{row.review_note}</p>}
        </li>)}</ol>}
      </Disclosure>
    </>}
    <InlineNotice mutation={m}/>
  </section>;
}

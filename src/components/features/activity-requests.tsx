"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, InlineNotice, useMutation } from "@/components/common";
import {
  analyzeActivity,
  saveActivityRequest,
  reviewActivityRequest,
} from "@/app/planning-completion-actions";
import {
  canPlan,
  type ActivityInput,
  type ActivityRequest,
  type Candidate,
} from "@/lib/planning-completion";
import type { Context } from "@/lib/models";
const labels = {
  draft: "작성 중",
  requested: "승인 요청",
  changes_requested: "조정 요청",
  approved: "승인 완료",
  rejected: "반려",
};
export function ActivityRequests({
  context: c,
  today,
  embedded = false,
}: {
  context: Context;
  today: string;
  embedded?: boolean;
}) {
  const [editing, setEditing] = useState<ActivityRequest | null | undefined>(),
    [review, setReview] = useState<ActivityRequest | null>(null);
  if (!c.year) return null;
  const content = <>
      <p>
        대상 학급·교원·특별실과 확정 평가 일정을 함께 확인합니다. 승인된 활동은
        학사일정에 한 번 등록되고 월중·주간계획에 연결됩니다.
      </p>
      <Button onClick={() => setEditing(null)}>교육활동 요청 작성</Button>
      {editing !== undefined && (
        <ActivityForm
          key={editing?.id ?? "new"}
          context={c}
          request={editing}
          today={today}
          onDone={() => setEditing(undefined)}
        />
      )}
      <div className="operations-scroll">
        <table className="operations-table">
          <thead>
            <tr>
              <th>교육활동</th>
              <th>상태</th>
              <th>희망 일정</th>
              <th>검토 결과</th>
              <th>처리</th>
            </tr>
          </thead>
          <tbody>
            {c.completion?.requests.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{labels[r.state]}</td>
                <td>
                  {r.state === "approved"
                    ? "학사일정의 현재 일정 참조"
                    : `${r.selected_date ?? "미선택"} ${r.selected_period ?? ""}교시부터 ${r.periods}교시`}
                </td>
                <td>{r.review_note || "—"}</td>
                <td>
                  {r.owner_id === c.userId &&
                    ["draft", "changes_requested", "rejected"].includes(
                      r.state,
                    ) && (
                      <Button variant="outline" onClick={() => setEditing(r)}>
                        수정·재요청
                      </Button>
                    )}
                  {canPlan(c, "calendar") && r.state === "requested" && (
                    <Button onClick={() => setReview(r)}>검토</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {review && (
        <ActivityReview
          key={review.id}
          context={c}
          request={review}
          onDone={() => setReview(null)}
        />
      )}
    </>;
  return embedded ? <div className="calendar-activity-modal">{content}</div> : <Disclosure className="secondary-disclosure no-print" label="교육활동 편성 요청 · 가능한 날짜 분석">{content}</Disclosure>;
}
function CandidateDetails({ candidate: x }: { candidate: Candidate }) {
  return (
    <div>
      <strong>
        {x.date} · {x.period}~{x.end}교시
        {x.startTime && ` (${x.startTime}~${x.endTime ?? "종료 시각 미확인"})`}
      </strong>
      <p>
        대체되는 교과 수업: {x.impact.join(", ") || "확인 가능한 수업 없음"}
      </p>
      {x.conflicts.map((t) => (
        <p className="notice-error" key={t}>
          충돌 · {t}
        </p>
      ))}
      {x.warnings.map((t) => (
        <p className="field-hint" key={t}>
          확인 필요 · {t}
        </p>
      ))}
    </div>
  );
}
function ActivityForm({
  context: c,
  request: r,
  today,
  onDone,
}: {
  context: Context;
  request: ActivityRequest | null;
  today: string;
  onDone: () => void;
}) {
  const defaultDate =
    today >= `${c.year!.year}-03-01` && today < `${c.year!.year + 1}-03-01`
      ? today
      : `${c.year!.year}-03-01`;
  const [v, setV] = useState<ActivityInput>(
    r
      ? { ...r, submit: false }
      : {
          title: "",
          starts_on: defaultDate,
          ends_on: defaultDate,
          periods: 1,
          class_ids: [],
          teacher_ids: [],
          room_id: null,
          constraints_note: "",
          alternatives: "",
          selected_date: null,
          selected_period: null,
          submit: false,
        },
  );
  const [candidates, setCandidates] = useState<Candidate[] | null>(null),
    [limit, setLimit] = useState(15),
    m = useMutation(),
    router = useRouter();
  const change = (patch: Partial<ActivityInput>) => {
    setV({ ...v, ...patch, selected_date: null, selected_period: null });
    setCandidates(null);
  };
  const scope = { workspaceId: c.workspace.id, year: c.year!.year };
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        m.execute(
          () =>
            saveActivityRequest({
              ...scope,
              id: r?.id ?? null,
              version: r?.version ?? 0,
              activity: { ...v, submit: true },
            }),
          () => {
            router.refresh();
            onDone();
          },
        );
      }}
    >
      <fieldset disabled={m.pending} className="form-stack">
        <Field label="교육활동명" id="activity-title">
          <input
            id="activity-title"
            value={v.title}
            maxLength={150}
            required
            onChange={(e) => change({ title: e.target.value })}
          />
        </Field>
        <div className="form-two">
          <Field label="희망 시작일" id="activity-start">
            <input
              id="activity-start"
              type="date"
              value={v.starts_on}
              onChange={(e) => change({ starts_on: e.target.value })}
            />
          </Field>
          <Field label="희망 종료일" id="activity-end">
            <input
              id="activity-end"
              type="date"
              value={v.ends_on}
              onChange={(e) => change({ ends_on: e.target.value })}
            />
          </Field>
        </div>
        <Field label="필요 교시 수" id="activity-length">
          <input
            id="activity-length"
            type="number"
            min={1}
            max={12}
            value={v.periods}
            onChange={(e) => change({ periods: Number(e.target.value) })}
          />
        </Field>
        <fieldset className="course-classes">
          <legend>대상 학급</legend>
          {c.classes.map((cl) => (
            <label key={cl.id}>
              <input
                type="checkbox"
                checked={v.class_ids.includes(cl.id)}
                onChange={(e) =>
                  change({
                    class_ids: e.target.checked
                      ? [...v.class_ids, cl.id]
                      : v.class_ids.filter((x) => x !== cl.id),
                  })
                }
              />
              {cl.grade}학년 {cl.class_number}반
            </label>
          ))}
        </fieldset>
        <Field label="필요 특별실" id="activity-room">
          <select
            id="activity-room"
            value={v.room_id ?? ""}
            onChange={(e) => change({ room_id: e.target.value || null })}
          >
            <option value="">지정 없음</option>
            {c.operations?.resources?.rooms.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="course-classes">
          <legend>필수 참여 교원 (선택)</legend>
          {c.operations?.directory.map((t) => (
            <label key={t.id}>
              <input
                type="checkbox"
                checked={v.teacher_ids.includes(t.id)}
                onChange={(e) =>
                  change({
                    teacher_ids: e.target.checked
                      ? [...v.teacher_ids, t.id]
                      : v.teacher_ids.filter((x) => x !== t.id),
                  })
                }
              />
              {t.display_name}
            </label>
          ))}
        </fieldset>
        <Field label="변경할 수 없는 조건" id="activity-constraints">
          <textarea
            id="activity-constraints"
            value={v.constraints_note}
            maxLength={2000}
            onChange={(e) => change({ constraints_note: e.target.value })}
          />
        </Field>
        <Field label="가능한 대체 운영 방식" id="activity-alternatives">
          <textarea
            id="activity-alternatives"
            value={v.alternatives}
            maxLength={2000}
            onChange={(e) => change({ alternatives: e.target.value })}
          />
        </Field>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            m.execute(
              () => analyzeActivity({ ...scope, activity: v }),
              (data) => {
                setCandidates(data.candidates);
                setLimit(15);
              },
            )
          }
        >
          가능 일정 분석
        </Button>
        {candidates && (
          <>
            <p>
              {candidates.length}개 후보 · 교과 대체가 적고 요일 운영이 많은
              날을 먼저 표시합니다. 최종 편성은 담당자가 판단합니다.
            </p>
            {!candidates.length && (
              <p>
                입력 조건에 맞는 수업일·교시가 없습니다. 기간 또는 필요 교시를
                조정하세요.
              </p>
            )}
            {candidates.slice(0, limit).map((x) => (
              <label className="info-box" key={`${x.date}:${x.period}`}>
                <input
                  type="radio"
                  name="candidate"
                  disabled={!!x.conflicts.length}
                  checked={
                    v.selected_date === x.date && v.selected_period === x.period
                  }
                  onChange={() =>
                    setV({
                      ...v,
                      selected_date: x.date,
                      selected_period: x.period,
                    })
                  }
                />
                <CandidateDetails candidate={x} />
              </label>
            ))}
            {candidates.length > limit && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setLimit(limit + 15)}
              >
                후보 더 보기
              </Button>
            )}
          </>
        )}
        <div className="form-two">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              m.execute(
                () =>
                  saveActivityRequest({
                    ...scope,
                    id: r?.id ?? null,
                    version: r?.version ?? 0,
                    activity: { ...v, submit: false },
                  }),
                () => {
                  router.refresh();
                  onDone();
                },
              )
            }
          >
            초안 저장
          </Button>
          <Button disabled={!v.selected_date || !v.selected_period}>
            선택한 일정으로 승인 요청
          </Button>
        </div>
      </fieldset>
      <InlineNotice mutation={m} />
      <Button type="button" variant="ghost" onClick={onDone}>
        닫기
      </Button>
    </form>
  );
}
function ActivityReview({
  context: c,
  request: r,
  onDone,
}: {
  context: Context;
  request: ActivityRequest;
  onDone: () => void;
}) {
  const [analysis, setAnalysis] = useState<{
      candidate: Candidate | undefined;
      stamp: string;
    } | null>(null),
    [ack, setAck] = useState(false),
    [decision, setDecision] = useState("approved"),
    m = useMutation(),
    router = useRouter();
  const scope = { workspaceId: c.workspace.id, year: c.year!.year };
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        m.execute(
          () =>
            reviewActivityRequest({
              ...scope,
              id: r.id,
              version: r.version,
              decision,
              note: f.get("note"),
              stamp: analysis?.stamp ?? "",
              acknowledged: ack,
              area: f.get("area"),
            }),
          () => {
            router.refresh();
            onDone();
          },
        );
      }}
    >
      <h3>{r.title} 검토</h3>
      <p>
        {r.constraints_note || "추가 조건 없음"} · 대체 방식:{" "}
        {r.alternatives || "미지정"}
      </p>
      <fieldset disabled={m.pending} className="form-stack">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            m.execute(
              () =>
                analyzeActivity({
                  ...scope,
                  activity: { ...r, submit: false },
                }),
              (data) => {
                setAnalysis({
                  stamp: data.stamp,
                  candidate: data.candidates.find(
                    (x) =>
                      x.date === r.selected_date &&
                      x.period === r.selected_period,
                  ),
                });
                setAck(false);
              },
            )
          }
        >
          최신 영향 분석
        </Button>
        {analysis &&
          (analysis.candidate ? (
            <CandidateDetails candidate={analysis.candidate} />
          ) : (
            <p role="alert">
              요청한 날짜·교시가 현재 운영 조건에 맞지 않습니다.
            </p>
          ))}
        <Field label="검토 결과" id="activity-decision">
          <select
            id="activity-decision"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="approved">승인 · 공식 일정 반영</option>
            <option value="changes_requested">조정 요청</option>
            <option value="rejected">반려</option>
          </select>
        </Field>
        <Field label="교육과정 활동 영역" id="activity-area">
          <select id="activity-area" name="area">
            {[
              "교과",
              "자율",
              "자율·자치",
              "동아리",
              "진로",
              "봉사",
              "학교자율시간",
              "없음",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <p className="field-hint">
          영역 지정만으로 실시·인정 시수가 확정되지는 않습니다.
        </p>
        <Field label="검토 사유·확인한 운영 조건" id="activity-review-note">
          <textarea
            id="activity-review-note"
            name="note"
            maxLength={2000}
            required
          />
        </Field>
        {decision === "approved" && (
          <label>
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            확인 필요 사항을 검토했으며 학교에서 필요한 승인 절차를
            완료했습니다.
          </label>
        )}
        <Button
          disabled={
            decision === "approved" &&
            (!ack ||
              !analysis?.candidate ||
              !!analysis.candidate.conflicts.length)
          }
        >
          검토 결과 저장
        </Button>
      </fieldset>
      <InlineNotice mutation={m} />
      <Button type="button" variant="ghost" onClick={onDone}>
        닫기
      </Button>
    </form>
  );
}

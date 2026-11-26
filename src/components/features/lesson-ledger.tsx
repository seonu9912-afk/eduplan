"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, InlineNotice, useMutation } from "@/components/common";
import {
  loadLessonLedger,
  saveLessonRecords,
} from "@/app/planning-completion-actions";
import {
  canPlan,
  type LessonInput,
  type LessonRecord,
} from "@/lib/planning-completion";
import { myTeacherIds } from "@/lib/school-operations";
import type { Context } from "@/lib/models";
type Data = Extract<
  Awaited<ReturnType<typeof loadLessonLedger>>,
  { ok: true }
>["data"];
function recordKey(x: { date: string; class_id: string; period: number }) {
  return `${x.date}:${x.class_id}:${x.period}`;
}
export function LessonLedger({
  context: c,
  today,
}: {
  context: Context;
  today: string;
}) {
  const [from, setFrom] = useState(`${c.year?.year}-03-01`),
    [to, setTo] = useState(
      today >= `${c.year?.year}-03-01` &&
        today < `${(c.year?.year ?? 0) + 1}-03-01`
        ? today
        : `${c.year?.year}-03-01`,
    ),
    [data, setData] = useState<Data | null>(null),
    [classId, setClassId] = useState(""),
    [subjectId, setSubjectId] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    m = useMutation();
  if (!c.year) return null;
  const scope = { workspaceId: c.workspace.id, year: c.year.year },
    ids = myTeacherIds(c),
    canWrite = (l: Data["lessons"][number]) =>
      canPlan(c, "timetable") || ids.has(l.teacherId);
  const rows =
      data?.lessons.filter(
        (x) =>
          (!classId || x.class_id === classId) &&
          (!subjectId || x.subjectId === subjectId),
      ) ?? [],
    records =
      data?.records.filter(
        (x) =>
          (!classId || x.class_id === classId) &&
          (!subjectId || x.subject_id === subjectId),
      ) ?? [];
  const refresh = () =>
    m.execute(
      () => loadLessonLedger({ ...scope, from, to }),
      (v) => {
        setData(v);
        setSelected([]);
      },
    );
  const input = (
    lesson: Data["lessons"][number],
    record?: LessonRecord,
  ): LessonInput => ({
    date: lesson.date,
    class_id: lesson.class_id,
    period: lesson.period,
    publication_id: lesson.publication_id,
    lesson_id: lesson.id,
    subject_id: lesson.subjectId,
    teacher_id: lesson.teacherId,
    outcome: "held",
    actual_minutes: lesson.actual_minutes,
    recognized_hours: null,
    reason: "",
    version: record?.version ?? 0,
  });
  return (
    <Disclosure className="panel no-print" label="수업 실시 확인·인정 시수">
      <p>
        예정 수업은 확정 시간표와 학사일정에서 계산합니다. 실시 여부는 담당자가
        확인하고 인정 시수는 기준·사유와 함께 별도로 기록합니다.
      </p>
      <div className="form-two">
        <Field label="조회 시작일" id="ledger-from">
          <input
            id="ledger-from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setData(null);
            }}
          />
        </Field>
        <Field label="조회 종료일" id="ledger-to">
          <input
            id="ledger-to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setData(null);
            }}
          />
        </Field>
      </div>
      <Button onClick={refresh} disabled={m.pending}>
        수업·기록 조회
      </Button>
      {data && (
        <>
          {data.warnings.map((w) => (
            <p role="alert" key={w}>
              {w}
            </p>
          ))}
          {!data.hasPublication && (
            <p role="alert">
              확정 시간표가 없어 예정 시수를 계산할 수 없습니다. 기존 실시
              기록은 보존합니다.
            </p>
          )}
          <div className="form-two">
            <Field label="학급" id="ledger-class">
              <select
                id="ledger-class"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSelected([]);
                }}
              >
                <option value="">전체 학급</option>
                {c.classes.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.grade}학년 {x.class_number}반
                  </option>
                ))}
              </select>
            </Field>
            <Field label="교과목" id="ledger-subject">
              <select
                id="ledger-subject"
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setSelected([]);
                }}
              >
                <option value="">전체 과목</option>
                {c.subjects.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="info-box">
            조회 기간 예정 {rows.length}차시 · 실시 확인{" "}
            {records.filter((x) => x.outcome === "held").length}차시 (
            {records.reduce((n, x) => n + x.actual_minutes, 0)}분) · 취소 확인{" "}
            {records.filter((x) => x.outcome === "cancelled").length}차시 · 인정{" "}
            {records.reduce((n, x) => n + (x.recognized_hours ?? 0), 0)}시간
            (미판정 {records.filter((x) => x.recognized_hours === null).length}
            건) · 오늘 이후 예정 {rows.filter((x) => x.date > today).length}차시
          </p>
          <p className="field-hint">
            미확인 수업을 실시로 간주하지 않습니다. 단축수업의 실제 분수와 인정
            시수는 서로 다릅니다. 조회 기간의 학급별 수업 건수를 합산합니다.
          </p>
          <Button
            disabled={m.pending || !selected.length}
            onClick={() =>
              m.execute(
                () =>
                  saveLessonRecords({
                    ...scope,
                    stamp: data.stamp,
                    entries: rows
                      .filter((l) => selected.includes(recordKey(l)))
                      .map((l) =>
                        input(
                          l,
                          records.find((r) => recordKey(r) === recordKey(l)),
                        ),
                      ),
                  }),
                refresh,
              )
            }
          >
            선택한 {selected.length}개 수업을 표시 시간대로 실시 확인
          </Button>
          <div className="operations-scroll">
            <table className="operations-table">
              <thead>
                <tr>
                  <th>선택</th>
                  <th>날짜·교시</th>
                  <th>학급·과목</th>
                  <th>예정 시간</th>
                  <th>실시·인정 기록</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const key = recordKey(l),
                    r = records.find((x) => recordKey(x) === key),
                    changed =
                      r &&
                      (r.lesson_id !== l.id ||
                        r.subject_id !== l.subjectId ||
                        r.teacher_id !== l.teacherId ||
                        r.publication_id !== l.publication_id);
                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${l.date} ${l.period}교시 ${l.classes} 실시 확인 선택`}
                          disabled={
                            !canWrite(l) || !!r || l.date > today || m.pending
                          }
                          checked={selected.includes(key)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, key]
                                : selected.filter((x) => x !== key),
                            )
                          }
                        />
                      </td>
                      <td>
                        {l.date} {l.period}교시
                      </td>
                      <td>
                        {c.classes.find((x) => x.id === l.class_id)?.grade}학년{" "}
                        {
                          c.classes.find((x) => x.id === l.class_id)
                            ?.class_number
                        }
                        반 · {l.subject}
                      </td>
                      <td>
                        {l.start}~{l.end} ({l.actual_minutes}분)
                      </td>
                      <td>
                        {changed && (
                          <p role="alert">
                            기록 후 계획이 변경되었습니다. 이전 기록을 확인하고
                            수정 시 이력에 보존합니다.
                          </p>
                        )}
                        {canWrite(l) ? (
                          <RecordForm
                            key={`${key}:${r?.version ?? 0}`}
                            initial={input(l, r)}
                            record={r}
                            pending={m.pending}
                            save={(entry) =>
                              m.execute(
                                () =>
                                  saveLessonRecords({
                                    ...scope,
                                    stamp: data.stamp,
                                    entries: [entry],
                                  }),
                                refresh,
                              )
                            }
                          />
                        ) : r ? (
                          <span>
                            {r.outcome === "held" ? "실시" : "취소"}{" "}
                            {r.actual_minutes}분 · 인정{" "}
                            {r.recognized_hours ?? "미판정"}
                          </span>
                        ) : (
                          "미확인"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {records.some(
            (r) => !rows.some((l) => recordKey(r) === recordKey(l)),
          ) && (
            <Disclosure compact label="현재 예정표와 연결되지 않는 과거 기록">
              {records
                .filter((r) => !rows.some((l) => recordKey(r) === recordKey(l)))
                .map((r) => (
                  <p key={recordKey(r)}>
                    {r.date} {r.period}교시 ·{" "}
                    {c.subjects.find((x) => x.id === r.subject_id)?.name ??
                      "과목"}{" "}
                    · {r.actual_minutes}분 · 인정{" "}
                    {r.recognized_hours ?? "미판정"} · {r.reason}
                  </p>
                ))}
              <p>
                운영 계획 변경으로 예정 수업이 사라져도 실시 기록은 삭제하지
                않습니다.
              </p>
            </Disclosure>
          )}
        </>
      )}
      <InlineNotice mutation={m} />
    </Disclosure>
  );
}
function RecordForm({
  initial,
  record: r,
  pending,
  save,
}: {
  initial: LessonInput;
  record?: LessonRecord;
  pending: boolean;
  save: (entry: LessonInput) => void;
}) {
  const [outcome, setOutcome] = useState(r?.outcome ?? "held");
  return (
    <Disclosure
      compact
      label={
        <>
          {r
            ? `${r.outcome === "held" ? "실시" : "취소"} ${r.actual_minutes}분 · 인정 ${r.recognized_hours ?? "미판정"}`
            : "미확인 · 기록"}
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save({
            ...initial,
            outcome,
            actual_minutes:
              outcome === "cancelled" ? 0 : Number(f.get("minutes")),
            recognized_hours:
              f.get("recognized") === "" ? null : Number(f.get("recognized")),
            reason: String(f.get("reason")),
          });
        }}
      >
        <fieldset disabled={pending}>
          <label>
            실시 여부
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as typeof outcome)}
            >
              <option value="held">실시</option>
              <option value="cancelled">취소</option>
            </select>
          </label>
          <label>
            실제 수업 시간 (분)
            <input
              name="minutes"
              type="number"
              min={1}
              max={240}
              disabled={outcome === "cancelled"}
              defaultValue={r?.actual_minutes || initial.actual_minutes}
            />
          </label>
          <label>
            인정 시수 (미판정은 빈칸)
            <input
              name="recognized"
              type="number"
              min={0}
              max={10}
              step="0.01"
              defaultValue={r?.recognized_hours ?? ""}
            />
          </label>
          <label>
            변경 사유·시수 인정 기준
            <textarea
              name="reason"
              maxLength={1000}
              defaultValue={r?.reason ?? ""}
            />
          </label>
          <Button>실시·인정 기록 저장</Button>
        </fieldset>
      </form>
    </Disclosure>
  );
}

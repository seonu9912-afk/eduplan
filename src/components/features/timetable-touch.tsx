"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { useMemo, useState } from "react";
import { proposeDatedSwap } from "@/lib/timetable-touch-editing";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/common";
import { useEditGuard } from "@/lib/device-session";
import {
  createLessonResolver,
  myTeacherIds,
  seoulClock,
  timetableIssues,
} from "@/lib/school-operations";
import type { TimetableDocument } from "@/lib/timetable-bridge";
import type { Context } from "@/lib/models";
type Slot = TimetableDocument["weekly"][number];
export function TimetableTouch({
  context: c,
  document: doc,
  editable,
  onChange,
}: {
  context: Context;
  document: TimetableDocument;
  editable: boolean;
  onChange: (doc: TimetableDocument) => void;
}) {
  const [kind, setKind] = useState("class"),
    [target, setTarget] = useState(doc.classes[0]?.id ?? ""),
    [day, setDay] = useState(1),
    [date, setDate] = useState(seoulClock(new Date()).date),
    [mode, setMode] = useState("weekly"),
    [edit, setEdit] = useState<Slot | null>(null),
    [error, setError] = useState("");
  const [secondDate, setSecondDate] = useState(date),
    [firstPeriod, setFirstPeriod] = useState(1),
    [secondPeriod, setSecondPeriod] = useState(2);
  const mine = myTeacherIds(c),
    resolve = useMemo(() => createLessonResolver(c, doc), [c, doc]);
  useEditGuard("timetable-touch", !!edit);
  const targets =
    kind === "class"
      ? doc.classes
      : kind === "teacher"
        ? doc.teachers
        : kind === "room"
          ? doc.rooms.map((id) => ({
              id,
              label:
                c.operations?.resources?.rooms.find((r) => r.id === id)?.name ??
                id,
            }))
          : [];
  const rows = doc.weekly
    .filter(
      (s) =>
        s.weekday === day &&
        (kind === "mine"
          ? mine.has(s.teacherId)
          : kind === "teacher"
            ? s.teacherId === target
            : kind === "room"
              ? s.room === target
              : s.scope === "class"
                ? s.scopeId === target
                : doc.groups
                    .find((g) => g.id === s.scopeId)
                    ?.classIds.includes(target)),
    )
    .sort((a, b) => a.period - b.period);
  const daily = resolve(date).filter((s) =>
    kind === "mine"
      ? mine.has(s.teacherId)
      : kind === "teacher"
        ? s.teacherId === target
        : kind === "room"
          ? s.room === (targets.find((t) => t.id === target)?.label ?? target)
          : s.classIds.includes(target),
  );
  function apply(next: TimetableDocument) {
    const issues = timetableIssues(next).filter(
      (i) => !/수업 시각|시작·종료 시각/.test(i),
    );
    if (issues.length) {
      setError(issues.join(" · "));
      return false;
    }
    onChange(next);
    setError("");
    return true;
  }
  return (
    <section className="panel mobile-touch-editor">
      <h2>수업 선택 편집</h2>
      <p>
        수업을 선택해 이동·변경할 수 있습니다. 변경 후 ‘학교에 저장’과
        ‘확정·배포’를 이용하세요.
      </p>
      <div className="mobile-view-toolbar">
        <label>
          보기
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="weekly">요일별 기본 시간표</option>
            <option value="daily">날짜별 운영·보결</option>
          </select>
        </label>
        <label>
          대상
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setTarget(
                e.target.value === "teacher"
                  ? (doc.teachers[0]?.id ?? "")
                  : e.target.value === "room"
                    ? (doc.rooms[0] ?? "")
                    : (doc.classes[0]?.id ?? ""),
              );
            }}
          >
            <option value="mine">개인</option>
            <option value="class">학급</option>
            <option value="teacher">교원</option>
            <option value="room">특별실</option>
          </select>
        </label>
        {kind !== "mine" && (
          <label>
            조회 대상
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">선택</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === "weekly" ? (
          <label>
            요일
            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            >
              {["월", "화", "수", "목", "금"].map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}요일
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            날짜
            <input
              type="date"
              min={`${doc.year}-03-01`}
              max={new Date(Date.UTC(doc.year + 1, 2, 0))
                .toISOString()
                .slice(0, 10)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="mobile-card-list">
        {mode === "weekly"
          ? rows.map((s) => (
              <article className="mobile-edit-card" key={s.id}>
                <h3>
                  {s.period}교시 ·{" "}
                  {doc.subjects.find((x) => x.id === s.subjectId)?.label ??
                    "과목 연결 확인"}
                </h3>
                <p>
                  {doc.teachers.find((t) => t.id === s.teacherId)?.label ??
                    "교원 미지정"}{" "}
                  ·{" "}
                  {doc.classes.find((t) => t.id === s.scopeId)?.label ??
                    doc.groups.find((t) => t.id === s.scopeId)?.label}{" "}
                  ·{" "}
                  {c.operations?.resources?.rooms.find((r) => r.id === s.room)
                    ?.name ?? s.room}
                </p>
                {editable && (
                  <Button variant="outline" onClick={() => setEdit({ ...s })}>
                    수업 수정·이동·삭제
                  </Button>
                )}
              </article>
            ))
          : daily.map((s) => (
              <article className="mobile-edit-card" key={s.id + ":" + s.period}>
                <h3>
                  {s.period}교시 · {s.subject}
                </h3>
                <p>
                  {s.start ?? "시각 미확인"}–{s.end ?? ""} · {s.classes} ·{" "}
                  {s.room}
                </p>
                <p>
                  {doc.teachers.find((t) => t.id === s.teacherId)?.label ??
                    "교원 미지정"}
                </p>
                {s.blockedBy.length > 0 && (
                  <p role="alert">{s.blockedBy.join(" · ")}</p>
                )}
                {editable && s.classIds.length === 1 && (
                  <Disclosure compact label="이 날짜 수업 변경">
                    <label>
                      보결 담당 교원
                      <select
                        value={s.teacherId}
                        onChange={(e) => {
                          const teacherId = e.target.value;
                          const clash = resolve(date).some(
                            (x) =>
                              x.id !== s.id &&
                              x.period === s.period &&
                              x.teacherId === teacherId,
                          );
                          if (clash) {
                            setError(
                              "해당 교원은 같은 교시에 수업이 있습니다.",
                            );
                            return;
                          }
                          const base =
                            doc.weekly.find((x) => x.id === s.id) ??
                            doc.overrides.find((x) => x.id === s.id);
                          if (!base) {
                            setError(
                              "원본 수업 연결을 확인할 수 없습니다. 전체 편집에서 확인하세요.",
                            );
                            return;
                          }
                          if (
                            !window.confirm(
                              "이 수업의 보결 담당자를 변경할까요?",
                            )
                          )
                            return;
                          apply({
                            ...doc,
                            overrides: [
                              ...doc.overrides.filter(
                                (o) =>
                                  !(
                                    o.date === date &&
                                    o.scope === "class" &&
                                    o.scopeId === s.classIds[0] &&
                                    o.period === s.period
                                  ),
                              ),
                              {
                                id: crypto.randomUUID(),
                                date,
                                scope: "class",
                                scopeId: s.classIds[0],
                                period: s.period,
                                action: "replace",
                                subjectId: s.subjectId,
                                teacherId,
                                room: base.room ?? "",
                                note: "보결",
                              },
                            ],
                          });
                        }}
                      >
                        <option value="">교원 선택</option>
                        {doc.teachers.map((t) => (
                          <option
                            key={t.id}
                            value={t.id}
                            disabled={resolve(date).some(
                              (x) =>
                                x.id !== s.id &&
                                x.period === s.period &&
                                x.teacherId === t.id,
                            )}
                          >
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (window.confirm("이 날짜의 해당 수업을 취소할까요?"))
                          apply({
                            ...doc,
                            overrides: [
                              ...doc.overrides.filter(
                                (o) =>
                                  !(
                                    o.date === date &&
                                    o.scope === "class" &&
                                    o.scopeId === s.classIds[0] &&
                                    o.period === s.period
                                  ),
                              ),
                              {
                                id: crypto.randomUUID(),
                                date,
                                scope: "class",
                                scopeId: s.classIds[0],
                                period: s.period,
                                action: "cancel",
                              },
                            ],
                          });
                      }}
                    >
                      해당 날짜 수업 취소
                    </Button>
                  </Disclosure>
                )}
              </article>
            ))}
      </div>
      {mode === "daily" && editable && kind === "class" && (
        <Disclosure compact label="두 날짜·교시의 수업 교환">
          <div className="mobile-view-toolbar">
            <label>
              {date} 교시
              <input
                type="number"
                min="1"
                max="12"
                value={firstPeriod}
                onChange={(e) => setFirstPeriod(Number(e.target.value))}
              />
            </label>
            <label>
              교환할 날짜
              <input
                type="date"
                value={secondDate}
                onChange={(e) => setSecondDate(e.target.value)}
              />
            </label>
            <label>
              교환할 교시
              <input
                type="number"
                min="1"
                max="12"
                value={secondPeriod}
                onChange={(e) => setSecondPeriod(Number(e.target.value))}
              />
            </label>
          </div>
          <Button
            onClick={() => {
              try {
                const next = proposeDatedSwap(
                  c,
                  doc,
                  target,
                  date,
                  firstPeriod,
                  secondDate,
                  secondPeriod,
                );
                if (
                  window.confirm(
                    "두 수업을 교환할까요? 저장·확정 후 개인 시간표에 반영됩니다.",
                  )
                )
                  onChange(next);
                setError("");
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "수업 교환 조건을 확인하세요.",
                );
              }
            }}
          >
            교환 검토·적용
          </Button>
        </Disclosure>
      )}
      {mode === "daily" &&
        editable &&
        doc.overrides
          .filter(
            (o) =>
              o.date === date && (kind !== "class" || o.scopeId === target),
          )
          .map((o, index) => (
            <p key={String(o.id ?? index)}>
              {o.period}교시 · {o.action === "cancel" ? "취소" : "변경"}
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm("이 예외를 제거하고 기본 수업을 적용할까요?")
                  )
                    onChange({
                      ...doc,
                      overrides: doc.overrides.filter((item) => item !== o),
                    });
                }}
              >
                변경 해제
              </Button>
            </p>
          ))}
      {mode === "daily" && !daily.length && (
        <p>
          이 조건에 해당하는 수업이 없습니다. 수업일·확정 상태와 대상 설정을
          확인하세요.
        </p>
      )}
      {editable && mode === "weekly" && (
        <Button
          variant="outline"
          onClick={() =>
            setEdit({
              id: crypto.randomUUID(),
              scope: "class",
              scopeId: doc.classes[0]?.id ?? "",
              weekday: day,
              period: 1,
              subjectId: doc.subjects[0]?.id ?? "",
              teacherId: "",
              room: "",
            })
          }
        >
          수업 추가
        </Button>
      )}
      <Modal
        open={!!edit}
        onOpenChange={(v) => {
          if (
            !v &&
            window.confirm("수업 편집을 닫을까요? 적용 전 입력은 사라집니다.")
          )
            setEdit(null);
        }}
        title="수업 편집"
        description="교과·교원·학급은 학교 공통 목록입니다."
      >
        {edit && (
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                apply({
                  ...doc,
                  weekly: [...doc.weekly.filter((s) => s.id !== edit.id), edit],
                })
              )
                setEdit(null);
            }}
          >
            <label>
              대상 구분
              <select
                value={edit.scope}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    scope: e.target.value as Slot["scope"],
                    scopeId: "",
                  })
                }
              >
                <option value="class">학급</option>
                <option value="group">수업 그룹</option>
              </select>
            </label>
            <label>
              학급·그룹
              <select
                required
                value={edit.scopeId}
                onChange={(e) => setEdit({ ...edit, scopeId: e.target.value })}
              >
                <option value="">선택</option>
                {(edit.scope === "class" ? doc.classes : doc.groups).map(
                  (t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              교과목
              <select
                required
                value={edit.subjectId}
                onChange={(e) =>
                  setEdit({ ...edit, subjectId: e.target.value })
                }
              >
                {doc.subjects.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              교원
              <select
                required
                value={edit.teacherId}
                onChange={(e) =>
                  setEdit({ ...edit, teacherId: e.target.value })
                }
              >
                <option value="">선택</option>
                {doc.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              요일
              <select
                value={edit.weekday}
                onChange={(e) =>
                  setEdit({ ...edit, weekday: Number(e.target.value) })
                }
              >
                {["월", "화", "수", "목", "금"].map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}요일
                  </option>
                ))}
              </select>
            </label>
            <label>
              교시
              <input
                type="number"
                required
                min="1"
                max="12"
                value={edit.period}
                onChange={(e) =>
                  setEdit({ ...edit, period: Number(e.target.value) })
                }
              />
            </label>
            <label>
              특별실
              <select
                value={edit.room}
                onChange={(e) => setEdit({ ...edit, room: e.target.value })}
              >
                <option value="">미지정</option>
                {doc.rooms.map((id) => (
                  <option key={id} value={id}>
                    {c.operations?.resources?.rooms.find((r) => r.id === id)
                      ?.name ?? id}
                  </option>
                ))}
              </select>
            </label>
            {error && <p role="alert">{error}</p>}
            <Button type="submit">편집 내용 적용</Button>
            {doc.weekly.some((s) => s.id === edit.id) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (window.confirm("이 기본 수업 배정을 삭제할까요?")) {
                    onChange({
                      ...doc,
                      weekly: doc.weekly.filter((s) => s.id !== edit.id),
                    });
                    setEdit(null);
                  }
                }}
              >
                수업 배정 삭제
              </Button>
            )}
          </form>
        )}
      </Modal>
    </section>
  );
}

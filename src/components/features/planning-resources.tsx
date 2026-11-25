"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  applyBell,
  removeBell,
  saveBell,
  saveRoom,
} from "@/app/planning-actions";
import {
  emptyResources,
  shortenedSchedules,
  unresolvedReferences,
  type ReferenceLink,
  type ShortenedInput,
} from "@/lib/planning-resources";
import type { Context } from "@/lib/models";
import type { TimetableDocument } from "@/lib/timetable-bridge";

export function PlanningResources({
  context: c,
  document: doc,
  onLinks,
}: {
  context: Context;
  document: TimetableDocument;
  onLinks: (links: ReferenceLink[]) => void;
}) {
  const router = useRouter(),
    [pending, startTransition] = useTransition(),
    [message, setMessage] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({}),
    [room, setRoom] = useState("");
  const resources = c.operations?.resources ?? emptyResources(),
    missing = unresolvedReferences(c, doc),
    canWrite = c.role !== "viewer";
  const [name, setName] = useState("단축수업"),
    [kind, setKind] = useState("shortened"),
    [schedule, setSchedule] = useState("");
  const [start, setStart] = useState(`${c.year?.year}-03-02`),
    [end, setEnd] = useState(`${c.year?.year}-03-02`),
    [reason, setReason] = useState("");
  const [v, setV] = useState<ShortenedInput>({
    start: "09:00",
    lessonEnd: "14:30",
    dismissal: "14:40",
    periods: 6,
    lesson: 45,
    minLesson: 30,
    break: 10,
    minBreak: 5,
    lunchAfter: 4,
    lunch: 50,
    closing: 10,
    step: 5,
  });
  const result = shortenedSchedules(v);
  const execute = (
    task: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) =>
    startTransition(async () => {
      try {
        const r = await task();
        setMessage(r.ok ? success : (r.error ?? "저장하지 못했습니다."));
        if (r.ok) router.refresh();
      } catch {
        setMessage("요청을 완료하지 못했습니다. 현재 입력은 유지됩니다.");
      }
    });
  return (
    <section className="panel planning-resources">
      <details open={missing.length > 0}>
        <summary>
          <strong>공통 자료 연결 · 특별실</strong>
          {missing.length > 0 && ` · 미연결 ${missing.length}개`}
        </summary>
        <p>
          학급·과목·교원은 학교 공통 목록을 사용합니다. 기존 자료의 연결은
          담당자가 선택하며, 연결 전 원본과 변환 관계를 보존합니다.
        </p>
        <p>
          <Link href={`/app/${c.workspace.id}/settings?year=${c.year?.year}`}>
            학교·과목 설정
          </Link>{" "}
          ·{" "}
          <Link href={`/app/${c.workspace.id}/teachers?year=${c.year?.year}`}>
            교원 명부
          </Link>
        </p>
        {missing.map((row) => (
          <label className="field" key={`${row.kind}:${row.id}`}>
            <span>
              {row.kind === "subject"
                ? "과목"
                : row.kind === "teacher"
                  ? "교원"
                  : "특별실"}{" "}
              · {row.label}
            </span>
            <select
              disabled={!canWrite || pending}
              value={links[`${row.kind}:${row.id}`] ?? ""}
              onChange={(e) =>
                setLinks({
                  ...links,
                  [`${row.kind}:${row.id}`]: e.target.value,
                })
              }
            >
              <option value="">공통 목록에서 직접 연결</option>
              {row.choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {missing.length > 0 && canWrite && (
          <Button
            disabled={
              pending || missing.some((r) => !links[`${r.kind}:${r.id}`])
            }
            onClick={() => {
              onLinks(
                missing.map((r) => ({
                  kind: r.kind,
                  legacyId: r.id,
                  targetId: links[`${r.kind}:${r.id}`],
                })),
              );
              setMessage(
                "연결을 편집안에 적용했습니다. ‘학교에 저장’하면 수업 배정과 함께 저장됩니다.",
              );
            }}
          >
            선택한 연결 적용
          </Button>
        )}
        <p>
          등록된 특별실:{" "}
          {resources.rooms.map((r) => r.name).join(", ") || "없음"}
        </p>
        {canWrite && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              execute(
                () =>
                  saveRoom({
                    workspaceId: c.workspace.id,
                    id: null,
                    name: room,
                  }),
                "특별실을 등록했습니다.",
              );
            }}
            className="inline-form"
          >
            <label>
              특별실 이름{" "}
              <input
                required
                maxLength={70}
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              />
            </label>
            <Button disabled={pending}>공통 특별실 등록</Button>
          </form>
        )}
      </details>
      <details>
        <summary>
          <strong>특별 시정표 · 날짜별 적용</strong>
        </summary>
        <p>
          대체 요일은 학사일정에서 지정합니다. 특별 시정표는 아래 기간에만
          적용되고 기간이 끝나면 기본 시정표로 돌아갑니다. 수업 운영 시간은
          교육과정상 인정 시수와 구분합니다.
        </p>
        {canWrite && (
          <>
            <div className="form-grid">
              {(
                [
                  ["start", "첫 수업 시작"],
                  ["lessonEnd", "마지막 수업 종료 목표"],
                  ["dismissal", "학생 귀가 목표"],
                ] as const
              ).map(([key, label]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <input
                    type="time"
                    value={v[key]}
                    onChange={(e) => setV({ ...v, [key]: e.target.value })}
                  />
                </label>
              ))}
              {(
                [
                  ["periods", "운영 교시 수", 1, 12],
                  ["lesson", "기본 수업 시간(분)", 1, 120],
                  ["minLesson", "최소 수업 시간(분)", 1, 120],
                  ["break", "기본 쉬는 시간(분)", 0, 60],
                  ["minBreak", "최소 쉬는 시간(분)", 0, 60],
                  ["lunchAfter", "점심 직전 교시(0=없음)", 0, 12],
                  ["lunch", "점심시간(분)", 0, 180],
                  ["closing", "종례·귀가 준비(분)", 0, 120],
                  ["step", "수업 조정 단위(분)", 1, 15],
                ] as const
              ).map(([key, label, min, max]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={v[key]}
                    onChange={(e) =>
                      setV({ ...v, [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="field">
              저장할 이름
              <input
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              유형
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {[
                  ["shortened", "단축수업"],
                  ["exam", "시험"],
                  ["event", "학교 행사"],
                  ["vacation", "방학식"],
                  ["temporary", "임시"],
                ].map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {result.error && <p role="status">{result.error}</p>}
            {result.options.map((option) => (
              <div key={option.priority} className="info-box">
                <strong>{option.priority}</strong>
                <p>
                  수업 {option.lesson}분 · 쉬는 시간 {option.break}분 · 마지막
                  수업{" "}
                  {option.rows.filter((r) => r.type === "lesson").at(-1)?.end} ·
                  귀가 {option.dismissal}
                </p>
                <p>
                  {option.rows
                    .filter((r) => r.type === "lesson")
                    .map((r) => `${r.label} ${r.start}–${r.end}`)
                    .join(" / ")}
                </p>
                <Button
                  variant="outline"
                  disabled={pending || !name.trim()}
                  onClick={() =>
                    execute(
                      () =>
                        saveBell({
                          workspaceId: c.workspace.id,
                          name,
                          kind,
                          rows: option.rows,
                        }),
                      "시정표를 저장했습니다. 적용 기간을 지정해 주세요.",
                    )
                  }
                >
                  이 시정표 저장
                </Button>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                execute(
                  () =>
                    applyBell({
                      workspaceId: c.workspace.id,
                      yearId: c.year!.id,
                      schedule,
                      start,
                      end,
                      reason,
                    }),
                  "특별 시정표를 적용했습니다. 개인 시간표와 교수학습계획의 수업 시각에 반영됩니다.",
                );
              }}
            >
              <div className="form-grid">
                <label className="field">
                  저장된 시정표
                  <select
                    required
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                  >
                    <option value="">선택</option>
                    {resources.bells.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  적용 시작
                  <input
                    required
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label className="field">
                  적용 종료
                  <input
                    required
                    type="date"
                    min={start}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                <label className="field">
                  적용 사유
                  <input
                    required
                    maxLength={300}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              </div>
              <Button disabled={pending || !schedule}>기간에 적용</Button>
            </form>
          </>
        )}
        {resources.applications.map((a) => (
          <p key={a.id}>
            {a.starts_on} ~ {a.ends_on} ·{" "}
            {resources.bells.find((b) => b.id === a.schedule_id)?.name} ·{" "}
            {a.reason}{" "}
            {canWrite && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  execute(
                    () => removeBell({ workspaceId: c.workspace.id, id: a.id }),
                    "특별 시정표 적용을 해제했습니다. 해제 이력은 보존됩니다.",
                  )
                }
              >
                적용 해제
              </Button>
            )}
          </p>
        ))}
      </details>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

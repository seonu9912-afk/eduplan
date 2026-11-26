"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { markOperationRead } from "@/app/operations-actions";
import { addDays, weekRange } from "@/lib/domain";
import {
  dailyOperationNotice,
  createLessonResolver,
  currentAndNext,
  myTeacherIds,
  publishedTimetable,
  seoulClock,
  unifiedSchedule,
} from "@/lib/school-operations";
import type { Context } from "@/lib/models";
import "./school-operations.css";
export function PersonalDay({
  context: c,
  today,
  previewNow,
}: {
  context: Context;
  today: string;
  previewNow?: string;
}) {
  const [now, setNow] = useState(
    () => new Date(previewNow ?? `${today}T00:00:00+09:00`),
  );
  const [lead, setLead] = useState(5),
    [permission, setPermission] = useState("내부 안내 사용"),
    [read, setRead] = useState<string[]>([]),
    [error, setError] = useState("");
  const doc = useMemo(() => publishedTimetable(c), [c]);
  const resolver = useMemo(
    () => (doc ? createLessonResolver(c, doc) : null),
    [c, doc],
  );
  const ids = useMemo(() => myTeacherIds(c), [c]);
  const clock = seoulClock(now),
    lessons = resolver?.(clock.date).filter((x) => ids.has(x.teacherId)) ?? [];
  const { current, next, remaining } = currentAndNext(lessons, clock.minutes);
  const teacher = c.operations?.directory.find((x) => x.user_id === c.userId);
  const items = unifiedSchedule(c, clock.date, addDays(clock.date, 6));
  const mine = items.filter(
    (x) =>
      !x.department ||
      x.department === teacher?.department ||
      x.source !== "business" ||
      c.role !== "viewer",
  );
  const prefKey = `eduplan-reminder:${c.workspace.id}:${c.userId}`;
  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const n = Number(localStorage.getItem(prefKey) ?? 5);
        if ([0, 1, 3, 5, 10, 15].includes(n)) setLead(n);
      } catch {}
    }, 0);
    const tick = () => setNow(new Date(previewNow ?? Date.now()));
    const first = window.setTimeout(tick, 0),
      timer = window.setInterval(tick, 10000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(restore);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [previewNow, prefKey]);
  return (
    <section
      className="operations-module personal-day"
      aria-label="나의 학교 생활"
    >
      <div className="dashboard-columns">
        <section className="panel">
          <div className="personal-day-heading">
            <h2>오늘의 나의 수업</h2>
            <time className="daily-clock">{clock.time.slice(0, 5)}</time>
          </div>
          <p>
            {clock.date} · 대한민국 표준시
            {c.operations?.publication
              ? ` · 배포 버전 ${c.operations.publication.source_version}`
              : ""}
          </p>
          {dailyOperationNotice(c, clock.date) && (
            <p className="info-box" role="status">
              {dailyOperationNotice(c, clock.date)}
            </p>
          )}
          {!doc ? (
            <p>
              학교에서 시간표를 저장한 뒤 ‘검토 후 확정·배포’하면 개인 시간표가
              표시됩니다.
            </p>
          ) : (
            <>
              <div className="next-lesson" aria-live="polite">
                <strong>
                  {current.length
                    ? `현재 ${current.map((x) => `${x.period}교시 ${x.subject}`).join(" · ")}`
                    : "현재 진행 중인 수업 없음"}
                </strong>
                <p>
                  {next
                    ? `다음 수업 ${next.subject} · ${next.classes} · ${next.start} (${remaining}분 후)`
                    : "오늘 남은 수업이 없습니다."}
                </p>
              </div>
              {!teacher && (
                <p className="operations-warning">
                  공통 교원 명부에 계정이 연결되지 않았습니다. 기존 계정 ID로
                  배정된 수업은 함께 표시합니다.
                </p>
              )}
              {!lessons.length && <p>오늘 배정된 수업이 없습니다.</p>}
              {lessons.map((lesson, index) => (
                <article
                  key={`${lesson.id}:${index}`}
                  className={`daily-lesson ${lesson.blockedBy.length ? "cancelled" : ""}`}
                >
                  <div>
                    <b>{lesson.period}교시</b>
                    <small>{lesson.start ?? "시각 미설정"}</small>
                  </div>
                  <div>
                    <strong>{lesson.subject}</strong>
                    <small>
                      {lesson.classes} · {lesson.room || "장소 미지정"}
                    </small>
                    {lesson.changed && <small>변경·교환·보결 수업</small>}
                    {!!lesson.blockedBy.length && (
                      <small>{lesson.blockedBy.join(" · ")}</small>
                    )}
                  </div>
                  <span>{lesson.end}</span>
                </article>
              ))}
              <Disclosure compact label="이번 주 내 시간표">
                {Array.from({ length: 7 }, (_, i) =>
                  addDays(weekRange(clock.date).start, i),
                ).map((date) => (
                  <div key={date}>
                    <h3>{date}</h3>
                    <p>
                      {resolver!(date)
                        .filter(
                          (x) => ids.has(x.teacherId) && !x.blockedBy.length,
                        )
                        .map(
                          (x) => `${x.period}교시 ${x.subject}(${x.classes})`,
                        )
                        .join(" · ") || "배정 수업 없음"}
                    </p>
                  </div>
                ))}
              </Disclosure>
            </>
          )}
          <div className="operations-controls personal-reminder-controls no-print">
            <label>
              수업 전 안내
              <select
                aria-label="수업 전 안내 시간"
                value={lead}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setLead(n);
                  try {
                    localStorage.setItem(prefKey, String(n));
                    window.dispatchEvent(
                      new Event("eduplan-reminder-settings"),
                    );
                  } catch {
                    setError("이 브라우저에 알림 설정을 저장할 수 없습니다.");
                  }
                }}
              >
                {[0, 1, 3, 5, 10, 15].map((n) => (
                  <option key={n} value={n}>
                    {n ? `${n}분 전` : "끄기"}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              onClick={async () => {
                if (!("Notification" in window)) {
                  setPermission("브라우저 알림 미지원 · 내부 안내 사용");
                  return;
                }
                try {
                  const result = await Notification.requestPermission();
                  setPermission(
                    result === "granted"
                      ? "브라우저 알림 허용됨"
                      : "내부 안내 사용",
                  );
                } catch {
                  setPermission("내부 안내 사용");
                }
              }}
            >
              브라우저 알림 사용
            </Button>
          </div>
          <p className="muted-small">
            {permission}. 화면을 열어 둔 동안 안내합니다. 화면을 닫거나 기기가
            절전 상태이면 알림함에서 변경 내용을 확인하세요.
          </p>
        </section>
        <section className="panel">
          <h2>오늘·이번 주 학교 업무</h2>
          {mine.length ? (
            <ul className="operations-compact-list">
              {mine.map((x) => (
                <li key={`${x.source}:${x.id}`}>
                  <b>
                    {x.date.slice(5)} {x.title}
                  </b>
                  <small>
                    {" "}
                    {x.department} · {x.kind} {x.time} {x.location}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>예정된 학교·부서 일정이 없습니다.</p>
          )}
          <p className="muted-small">
            학사운영과 학교업무에 등록한 원본 일정을 함께 표시합니다.
          </p>
          <Button asChild variant="outline">
            <Link
              href={
                previewNow
                  ? "/recovery-preview/operations"
                  : `/app/${c.workspace.id}/plans?year=${c.year?.year}`
              }
            >
              월중·주간계획
            </Link>
          </Button>
          <h2 className="personal-day-notification-title">내 알림함</h2>
          <ul className="notification-list">
            {(c.operations?.notifications ?? []).map((n) => (
              <li key={n.id}>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>{n.created_at.slice(0, 10)}</small>
                {!n.read_at && !read.includes(n.id) && (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (previewNow) {
                        setRead((old) => [...old, n.id]);
                        return;
                      }
                      try {
                        const result = await markOperationRead({
                          workspaceId: c.workspace.id,
                          id: n.id,
                        });
                        if (result.ok) setRead((old) => [...old, n.id]);
                        else setError(result.error);
                      } catch {
                        setError("읽음 상태를 저장하지 못했습니다.");
                      }
                    }}
                  >
                    읽음
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!c.operations?.notifications.length && (
            <p>새로운 시간표 변경 알림이 없습니다.</p>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </section>
  );
}

"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CalendarDays, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markOperationRead } from "@/app/operations-actions";
import { useMutation, InlineNotice } from "@/components/common";
import { addDays, dateLabel } from "@/lib/domain";
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
import { publicationAt } from "@/lib/school-publications";
import { timetableModeForWeek, timetableWeek } from "@/lib/timetable-view";
import { TimetableGrid } from "./timetable-grid";
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
    [reminderError, setReminderError] = useState("");
  const readMutation = useMutation();
  const doc = useMemo(() => publishedTimetable(c), [c]);
  const resolver = useMemo(
    () => (doc ? createLessonResolver(c, doc) : null),
    [c, doc],
  );
  const ids = useMemo(() => myTeacherIds(c), [c]);
  const clock = seoulClock(now),
    lessons = resolver?.(clock.date).filter((x) => ids.has(x.teacherId)) ?? [];
  const hhmm = clock.time.slice(0, 5);
  const operationNotice = dailyOperationNotice(c, clock.date);
  const { current, next, remaining } = currentAndNext(lessons, clock.minutes);
  const teacher = c.operations?.directory.find((x) => x.user_id === c.userId && x.active);
  const hasCalendar = c.schoolPublications
    ? !!publicationAt(c.schoolPublications, "calendar", clock.date) : !!c.annual;
  const unread = (c.operations?.notifications ?? []).filter((n) => !n.read_at && !read.includes(n.id));
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
            <h2><Clock3 aria-hidden="true" />오늘 수업</h2>
            <time className="daily-clock" dateTime={`${clock.date}T${hhmm}+09:00`}>
              {dateLabel(clock.date)} <strong>{hhmm}</strong>
            </time>
          </div>
          {operationNotice && (
            <p className="info-box" role="status">
              {operationNotice}
            </p>
          )}
          {!doc ? (
            <p className="operations-empty">시간표가 확정되면 담당 수업이 표시됩니다.</p>
          ) : !teacher ? (
            <p className="operations-empty">교원 명부에 연결되지 않았습니다. 관리자에게 계정 연결을 요청하세요.</p>
          ) : (
            <>
              {(hasCalendar || lessons.length > 0) && <div className="next-lesson" aria-live="polite">
                {current.length > 0 && (
                  <p>진행 중 · {current.map((x) => `${x.period}교시 ${x.subject}`).join(" · ")}</p>
                )}
                {next ? (
                  <>
                    <strong>다음 수업 · {next.period}교시 {next.subject}</strong>
                    <p>{next.classes} · {next.start} ({remaining}분 후)</p>
                  </>
                ) : (
                  <p>{lessons.length ? "다음 수업이 없습니다." : "오늘 배정된 수업이 없습니다."}</p>
                )}
              </div>}
              {lessons.map((lesson, index) => (
                <article
                  key={`${lesson.id}:${index}`}
                  className={`daily-lesson ${lesson.blockedBy.length ? "cancelled" : ""}`}
                >
                  <div>
                    <b>{lesson.period}교시</b>
                    <small className="daily-lesson-time">
                      {lesson.start && lesson.end
                        ? `${lesson.start}–${lesson.end}`
                        : "시각 미설정"}
                    </small>
                  </div>
                  <div>
                    <strong>{lesson.subject}</strong>
                    <small>
                      {[lesson.classes, lesson.room].filter(Boolean).join(" · ")}
                    </small>
                    {lesson.changed && <small>변경·교환·보결 수업</small>}
                    {!!lesson.blockedBy.length && (
                      <small>{lesson.blockedBy.join(" · ")}</small>
                    )}
                  </div>
                </article>
              ))}
              <PersonalWeeklyTimetable context={c} date={clock.date} teacherIds={ids} />
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
                    setReminderError("이 브라우저에 알림 설정을 저장할 수 없습니다.");
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
          <p className="muted-small">{permission} · 화면을 열어 둔 동안 알림을 받습니다.</p>
          {reminderError && <p role="alert" className="operations-warning">{reminderError}</p>}
        </section>
        <section className="panel">
          <div className="personal-day-heading">
            <h2><CalendarDays aria-hidden="true" />앞으로 7일 일정</h2>
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
          </div>
          {mine.length ? (
            <ul className="personal-schedule-list">
              {mine.map((x) => (
                <li key={`${x.source}:${x.id}`}>
                  <time dateTime={x.date}>{dateLabel(x.date)}</time>
                  <div>
                    <strong>{x.title}</strong>
                    <small>{[x.department, x.kind, x.time, x.location].filter(Boolean).join(" · ")}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="operations-empty">예정된 학교·부서 일정이 없습니다.</p>
          )}
          <h2 className="personal-day-notification-title"><Bell aria-hidden="true" />내 알림함</h2>
          {unread.length ? <ul className="notification-list">
            {unread.map((n) => (
              <li key={n.id}>
                <div><strong>{n.title}</strong><p>{n.body}</p>
                  <time dateTime={n.created_at}>{dateLabel(n.created_at.slice(0, 10))}</time></div>
                <Button variant="outline" disabled={readMutation.pending} onClick={() => {
                  const remove = () => setRead((current) => [...current, n.id]);
                  if (previewNow) remove();
                  else readMutation.execute(() => markOperationRead({ workspaceId: c.workspace.id, id: n.id }), remove, "");
                }}>확인<span className="sr-only"> · {n.title}</span></Button>
              </li>
            ))}
          </ul> : <p className="operations-empty" role="status">확인할 새 알림이 없습니다.</p>}
          <InlineNotice mutation={readMutation} />
        </section>
      </div>
    </section>
  );
}

const PersonalWeeklyTimetable = memo(function PersonalWeeklyTimetable({ context, date, teacherIds }: {
  context: Context;
  date: string;
  teacherIds: Set<string>;
}) {
  const mode = timetableModeForWeek(context, date);
  const week = timetableWeek(context, date, mode);
  return (
    <Disclosure compact label="이번 주 내 시간표" className="personal-week">
      {mode === "weekly" ? <p className="muted-small">{dateLabel(week.weekdays[0].date)} ~ {dateLabel(week.weekdays[4].date)}</p>
        : <p className="muted-small">공개 학사일정이 없어 기본 시간표를 표시합니다.</p>}
      {week.rows > 0 ? <TimetableGrid week={week} mode={mode} audience="mine" compact
        label={mode === "weekly" ? "이번 주 내 시간표" : "내 기본 시간표"}
        visible={(cell) => teacherIds.has(cell.teacherId)} />
        : <p className="operations-empty">이 주에 적용되는 공개 시간표가 없습니다.</p>}
    </Disclosure>
  );
});

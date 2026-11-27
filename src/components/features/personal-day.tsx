"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bell, CalendarDays, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markOperationRead } from "@/app/operations-actions";
import { useMutation, InlineNotice } from "@/components/common";
import { addDays, dateLabel } from "@/lib/domain";
import {
  dailyOperationNotice, createLessonResolver, currentAndNext,
  myTeacherIds, publishedTimetable, seoulClock, unifiedSchedule, type ScheduleItem,
} from "@/lib/school-operations";
import type { Context } from "@/lib/models";
import { publicationAt } from "@/lib/school-publications";
import { timetableModeForWeek, timetableWeek } from "@/lib/timetable-view";
import { TimetableGrid } from "./timetable-grid";
import { LessonReminderSettings } from "./lesson-reminder-settings";
import "./school-operations.css";

const dayLabel = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" });
const dayTitle = (date: string) => dayLabel.format(new Date(`${date}T00:00:00+09:00`));

export function PersonalDay({ context: c, today, previewNow }: {
  context: Context;
  today: string;
  previewNow?: string;
}) {
  const [now, setNow] = useState(() => previewNow ? new Date(previewNow) : null);
  const [read, setRead] = useState<string[]>([]);
  const readMutation = useMutation();
  const doc = useMemo(() => publishedTimetable(c), [c]);
  const resolver = useMemo(() => doc ? createLessonResolver(c, doc) : null, [c, doc]);
  const ids = useMemo(() => myTeacherIds(c), [c]);
  const clock = seoulClock(now ?? new Date(`${today}T00:00:00+09:00`));
  const lessons = resolver?.(clock.date).filter((lesson) => ids.has(lesson.teacherId)) ?? [];
  const operationNotice = dailyOperationNotice(c, clock.date);
  const { current, next, remaining } = currentAndNext(lessons, clock.minutes);
  const teacher = c.operations?.directory.find((item) => item.user_id === c.userId && item.active);
  const hasCalendar = c.schoolPublications ? !!publicationAt(c.schoolPublications, "calendar", clock.date) : !!c.annual;
  const unread = (c.operations?.notifications ?? []).filter((item) => !item.read_at && !read.includes(item.id));
  const schedule = unifiedSchedule(c, clock.date, addDays(clock.date, 6)).filter((item) =>
    !item.department || item.department === teacher?.department || item.source !== "business" || c.role !== "viewer",
  );
  const todayItems = schedule.filter((item) => item.date <= clock.date);
  const upcoming = schedule.filter((item) => item.date > clock.date);
  const base = `/app/${c.workspace.id}`;
  const suffix = c.year ? `?year=${c.year.year}` : "";
  useEffect(() => {
    const tick = () => setNow(new Date(previewNow ?? Date.now()));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 10000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [previewNow]);

  return <section className="operations-module personal-day" aria-label="나의 학교 생활">
    <div className="personal-widgets">
      <div className="personal-widget-column">
        <section className="personal-widget">
          <header className="personal-day-heading">
            <h2><Clock3 aria-hidden="true" />오늘 수업</h2>
            <time className="daily-clock" dateTime={clock.date}>{dayTitle(clock.date)}</time>
          </header>
          {operationNotice && <p className="personal-widget-note" role="status">{operationNotice}</p>}
          {!doc ? <p className="personal-widget-note">시간표가 확정되면 담당 수업이 표시됩니다.</p>
            : !teacher ? <p className="personal-widget-note">교원 명부에 연결되지 않았습니다. 관리자에게 계정 연결을 요청하세요.</p>
            : <>
              {now && (hasCalendar || lessons.length > 0) && <div className="next-lesson" role="group" aria-label="다음 수업" aria-live="polite">
                {next ? <>
                  <span className="next-lesson-label">다음 수업</span>
                  <time className="next-lesson-clock" dateTime={next.start ?? undefined}>{next.start}</time>
                  <strong>{next.period}교시 · {next.classes} {next.subject}</strong>
                  {remaining !== null && <small>시작까지 {remaining >= 60 ? `${Math.floor(remaining / 60)}시간 ${remaining % 60}분` : `${remaining}분`}</small>}
                </> : <p>{lessons.length ? "다음 수업이 없습니다." : "오늘 배정된 수업이 없습니다."}</p>}
                {current.length > 0 && <small>진행 중 · {current.map((item) => `${item.period}교시 ${item.subject}`).join(" · ")}</small>}
              </div>}
              {lessons.length > 0 && <ol className="personal-lesson-list">
                {lessons.map((lesson, index) => <li key={`${lesson.id}:${index}`} className={`daily-lesson${lesson.blockedBy.length ? " cancelled" : ""}`}>
                  <div>
                    <b>{lesson.period}교시</b>
                    <small className="daily-lesson-time">{lesson.start && lesson.end ? `${lesson.start}–${lesson.end}` : "시각 미설정"}</small>
                  </div>
                  <div>
                    <strong>{lesson.subject}</strong>
                    <small>{[lesson.classes, lesson.room].filter(Boolean).join(" · ")}</small>
                    {lesson.changed && <small>변경·교환·보결 수업</small>}
                    {!!lesson.blockedBy.length && <small>{lesson.blockedBy.join(" · ")}</small>}
                  </div>
                </li>)}
              </ol>}
            </>}
        </section>
        {doc && teacher && <PersonalWeeklyTimetable context={c} date={clock.date} teacherIds={ids} />}
      </div>
      <div className="personal-widget-column">
        <section className="personal-widget personal-agenda">
          <header className="personal-day-heading">
            <h2><CalendarDays aria-hidden="true" />오늘 일정</h2>
            <Link className="widget-link" href={previewNow ? "/recovery-preview/operations" : `${base}/plans${suffix}`}>
              월중·주간계획 <ArrowUpRight aria-hidden="true" />
            </Link>
          </header>
          {todayItems.length ? <AgendaItems items={todayItems} /> : <p className="personal-widget-note">오늘 등록된 일정이 없습니다.</p>}
          <h3>다가오는 일정</h3>
          {upcoming.length ? <AgendaItems items={upcoming} showDate /> : <p className="personal-widget-note">예정된 학교·부서 일정이 없습니다.</p>}
        </section>
        <section className="personal-widget">
          <header className="personal-day-heading">
            <h2><Bell aria-hidden="true" />알림</h2>
            {!previewNow && <Link className="widget-link" href={`${base}/notifications${suffix}`}>알림함 <ArrowUpRight aria-hidden="true" /></Link>}
          </header>
          {unread.length ? <ul className="notification-list">
            {unread.map((item) => <li key={item.id}>
              <div><strong>{item.title}</strong><p>{item.body}</p>
                <time dateTime={item.created_at}>{dateLabel(item.created_at.slice(0, 10))}</time></div>
              <Button variant="ghost" disabled={readMutation.pending} onClick={() => {
                const remove = () => setRead((previous) => [...previous, item.id]);
                if (previewNow) remove();
                else readMutation.execute(() => markOperationRead({ workspaceId: c.workspace.id, id: item.id }), remove, "");
              }}>확인<span className="sr-only"> · {item.title}</span></Button>
            </li>)}
          </ul> : <p className="personal-widget-note" role="status">확인할 새 알림이 없습니다.</p>}
          <InlineNotice mutation={readMutation} />
        </section>
      </div>
    </div>
    {previewNow && <LessonReminderSettings workspaceId={c.workspace.id} userId={c.userId} />}
  </section>;
}

function AgendaItems({ items, showDate = false }: { items: ScheduleItem[]; showDate?: boolean }) {
  return <ul className="personal-schedule-list">
    {items.map((item) => <li key={`${item.source}:${item.id}`} data-source={item.source}>
      {showDate && <time dateTime={item.date}>{dayTitle(item.date)}</time>}
      <div>
        <strong>{item.title}</strong>
        <small>{[item.time, item.location, item.department, item.kind].filter(Boolean).join(" · ")}</small>
      </div>
    </li>)}
  </ul>;
}

const PersonalWeeklyTimetable = memo(function PersonalWeeklyTimetable({ context, date, teacherIds }: {
  context: Context;
  date: string;
  teacherIds: Set<string>;
}) {
  const mode = timetableModeForWeek(context, date);
  const week = timetableWeek(context, date, mode);
  return <Disclosure compact label="이번 주 내 시간표" className="personal-week">
    {mode === "weekly" ? <p className="muted-small">{dateLabel(week.weekdays[0].date)} ~ {dateLabel(week.weekdays[4].date)}</p>
      : <p className="muted-small">공개 학사일정이 없어 기본 시간표를 표시합니다.</p>}
    {week.rows > 0 ? <TimetableGrid week={week} mode={mode} audience="mine" compact today={date}
      label={mode === "weekly" ? "이번 주 내 시간표" : "내 기본 시간표"}
      visible={(cell) => teacherIds.has(cell.teacherId)} />
      : <p className="personal-widget-note">이 주에 적용되는 공개 시간표가 없습니다.</p>}
  </Disclosure>;
});

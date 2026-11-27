"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, dateLabel } from "@/lib/domain";
import {
  dailyOperationNotice, createLessonResolver, currentAndNext,
  myTeacherIds, publishedTimetable, seoulClock,
} from "@/lib/school-operations";
import type { Context } from "@/lib/models";
import { publicationAt } from "@/lib/school-publications";
import { calendarWeekLanes, publishedScheduleDays, schoolScheduleEntries, type ScheduleEntry } from "@/lib/school-schedule";
import { visibleWeekDate, visibleWeekDates } from "@/lib/schedule-dates";
import { ResourceLinks } from "./resource-links";
import { DepartmentBadge } from "./department-badge";
import { scheduleDepartmentColor } from "@/lib/department-badge";
import { LessonReminderSettings } from "./lesson-reminder-settings";
import { MyTasks } from "./my-tasks";
import { ScheduleDetailDialog, ScheduleDetailTitle, useScheduleDetail } from "./schedule-detail";
import { useWeekendVisibility, WeekendToggle } from "./weekend-visibility";
import "./school-operations.css";

const dayLabel = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" });
const dayTitle = (date: string) => dayLabel.format(new Date(`${date}T00:00:00+09:00`));

export function PersonalDay({ context: c, today, previewNow, publicData }: {
  context: Context;
  today: string;
  previewNow?: string;
  publicData?: ReactNode;
}) {
  const [now, setNow] = useState(() => previewNow ? new Date(previewNow) : null);
  const doc = useMemo(() => publishedTimetable(c), [c]);
  const resolver = useMemo(() => doc ? createLessonResolver(c, doc) : null, [c, doc]);
  const ids = useMemo(() => myTeacherIds(c), [c]);
  const clock = seoulClock(now ?? new Date(`${today}T00:00:00+09:00`));
  const lessons = resolver?.(clock.date).filter((lesson) => ids.has(lesson.teacherId)) ?? [];
  const operationNotice = dailyOperationNotice(c, clock.date);
  const { current, next, remaining } = currentAndNext(lessons, clock.minutes);
  const teacher = c.operations?.directory.find((item) => item.user_id === c.userId && item.active);
  const hasCalendar = c.schoolPublications ? !!publicationAt(c.schoolPublications, "calendar", clock.date) : !!c.annual;
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
    <HomeLiveClock today={clock.date} previewNow={previewNow} />
    <div className={`home-today-grid${publicData ? "" : " home-today-grid-single"}`}>
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
      {publicData}
    </div>
    <div className="home-week-and-tasks">
      <HomeWeeklyAgenda context={c} today={clock.date} department={teacher?.department} plansHref={previewNow ? "/recovery-preview/operations" : `${base}/plans${suffix}`} />
      <MyTasks />
    </div>
    {previewNow && <LessonReminderSettings workspaceId={c.workspace.id} userId={c.userId} />}
  </section>;
}


const liveClockFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const liveDateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long",
});

function HomeLiveClock({ today, previewNow }: { today: string; previewNow?: string }) {
  const [instant, setInstant] = useState<Date | null>(() => previewNow ? new Date(previewNow) : null);
  useEffect(() => {
    const tick = () => setInstant(new Date(previewNow ?? Date.now()));
    const first = window.setTimeout(tick, 0);
    const timer = previewNow ? undefined : window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearTimeout(first);
      if (timer !== undefined) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [previewNow]);

  return <div className="home-live-clock">
    <div className="home-clock-date">
      <span>오늘</span>
      <time dateTime={instant?.toISOString() ?? today}>{liveDateFormat.format(instant ?? new Date(`${today}T00:00:00+09:00`))}</time>
    </div>
    <time className="home-clock-time" aria-label="현재 시각 (한국 표준시)" dateTime={instant?.toISOString()}>
      {instant ? liveClockFormat.format(instant) : "--:--:--"}
    </time>
  </div>;
}

const weekdayNames = ["월", "화", "수", "목", "금", "토", "일"];
const agendaTones = { event: "학사일정", work: "업무계획", break: "휴업·방학" };

function HomeWeeklyAgenda({ context, today, department, plansHref }: {
  context: Context; today: string; department?: string; plansHref: string;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const scheduleDetail = useScheduleDetail();
  const weekend = useWeekendVisibility(context.workspace.id, context.userId);
  const selected = visibleWeekDate(selection ?? today, weekend.showWeekends);
  const dates = useMemo(() => visibleWeekDates(selected, weekend.showWeekends), [selected, weekend.showWeekends]);
  const days = useMemo(() => {
    const first = dates[0], last = dates[dates.length - 1];
    const entries = context.schoolPublications ? [] : schoolScheduleEntries(context, first, last, true);
    const published = context.schoolPublications ? publishedScheduleDays(context, dates, true) : null;
    return new Map(dates.map((day) => {
      const source = published?.get(day)?.entries ?? entries.filter((entry) => entry.date <= day && entry.end >= day);
      const visible = source.filter((entry) =>
        entry.tone !== "work" || !entry.department || entry.department === department || context.role !== "viewer");
      return [day, { entries: visible }] as const;
    }));
  }, [context, dates, department]);
  const lanes = useMemo(() => calendarWeekLanes(dates, days), [dates, days]);
  const detail = days.get(selected)?.entries ?? [];
  const firstMonth = dates[0].slice(0, 7);
  const lastMonth = dates[dates.length - 1].slice(0, 7);
  const monthTitle = firstMonth === lastMonth
    ? `${Number(firstMonth.slice(5))}월`
    : `${Number(firstMonth.slice(5))}월 – ${Number(lastMonth.slice(5))}월`;

  return <section className="personal-widget home-weekly-agenda" aria-label="주간 일정">
    <header className="personal-day-heading">
      <h2><CalendarDays aria-hidden="true" />주간 일정</h2>
      <Link className="widget-link" href={plansHref}>월중·주간계획 <ArrowUpRight aria-hidden="true" /></Link>
    </header>
    <div className="home-week-toolbar">
      <h3>{monthTitle} <small>{dateLabel(dates[0])} – {dateLabel(dates[dates.length - 1])}</small></h3>
      <div className="home-week-navigation">
        <WeekendToggle {...weekend} />
        <Button variant="ghost" size="icon" aria-label="이전 주" onClick={() => setSelection(addDays(selected, -7))}><ChevronLeft /></Button>
        <Button variant="outline" size="sm" onClick={() => setSelection(null)}>오늘</Button>
        <Button variant="ghost" size="icon" aria-label="다음 주" onClick={() => setSelection(addDays(selected, 7))}><ChevronRight /></Button>
      </div>
    </div>
    <div className="home-week-mobile-grid" data-weekdays-only={dates.length === 5 ? "" : undefined} role="group" aria-label="주간 일정 요약">
      {dates.map((day, column) => {
        const entries = days.get(day)?.entries ?? [];
        return <button key={day} type="button" className="home-week-mobile-day"
          data-weekend={column >= 5 ? "" : undefined}
          aria-current={day === today ? "date" : undefined}
          aria-pressed={day === selected} aria-label={`${dayTitle(day)}, 일정 ${entries.length}건`}
          onClick={() => setSelection(day)}>
          <span className="home-week-mobile-weekday">{weekdayNames[column]}</span>
          <time dateTime={day}>{Number(day.slice(8))}</time>
          <span className="home-week-mobile-preview" aria-hidden="true">
            {entries.slice(0, 2).map((entry, index) => <span key={`${entry.id}:${index}`}
              className="home-week-mobile-entry" data-department-color={scheduleDepartmentColor(entry.department, entry.tone)}>{entry.title}</span>)}
            {entries.length > 2 && <span className="home-week-mobile-more">+{entries.length - 2}</span>}
          </span>
        </button>;
      })}
    </div>
    <div className="home-week-grid" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${Math.max(1, lanes.length)}, minmax(34px, auto)) minmax(18px, 1fr)` }}>
      {dates.map((day, column) => <div key={day} className="home-week-column" data-selected={day === selected ? "" : undefined}
        style={{ gridColumn: column + 1, gridRow: "1 / -1" }} aria-hidden="true" />)}
      {dates.map((day, column) => <button key={day} type="button" className="home-week-date"
        data-weekend={column >= 5 ? "" : undefined} aria-current={day === today ? "date" : undefined}
        aria-pressed={day === selected} aria-label={dayTitle(day)}
        style={{ gridColumn: column + 1, gridRow: 1 }} onClick={() => setSelection(day)}>
        <span>{weekdayNames[column]}</span><time dateTime={day}>{Number(day.slice(8))}</time>
      </button>)}
      {lanes.flatMap((lane, row) => lane.map(({ entry, start, end }) =>
        <button type="button" className="home-week-event" data-tone={entry.tone} data-department-color={scheduleDepartmentColor(entry.department, entry.tone)}
          key={`${entry.id}:${start}:${row}`}
          style={{ gridColumn: `${start + 1} / ${end + 2}`, gridRow: row + 2 }}
          aria-label={`${entry.title}, ${dateLabel(dates[start])}${start !== end ? `부터 ${dateLabel(dates[end])}까지` : ""}`}
          title={entry.title}
          onClick={(event) => { setSelection(dates.includes(selected) && selected >= dates[start] && selected <= dates[end] ? selected : dates[start]); scheduleDetail.show(entry, event.currentTarget); }}>
          <span className="schedule-department-title">{entry.department && <DepartmentBadge department={entry.department} />}<span>{entry.title}</span></span>
        </button>))}
      {!lanes.length && <p className="home-week-empty">이번 주 등록된 일정이 없습니다.</p>}
    </div>
    <div className="home-week-detail" aria-live="polite">
      <h3>{dayTitle(selected)} 일정</h3>
      {detail.length ? <ul className="home-week-detail-list">{detail.map((entry: ScheduleEntry, index) =>
        <li key={`${entry.id}:${index}`} data-tone={entry.tone} data-department-color={scheduleDepartmentColor(entry.department, entry.tone)}>
          <div className="schedule-department-title">{entry.department && <DepartmentBadge department={entry.department} />}<ScheduleDetailTitle entry={entry} onOpen={scheduleDetail.show} /></div>
          <small>{[entry.time, entry.location, agendaTones[entry.tone]].filter(Boolean).join(" · ")}</small>
          <ResourceLinks value={entry.resources} compact />
        </li>)}</ul> : <p className="personal-widget-note">등록된 일정이 없습니다.</p>}
    </div>
    <ScheduleDetailDialog entry={scheduleDetail.entry} onClose={scheduleDetail.close} onCloseAutoFocus={scheduleDetail.restoreFocus} />
  </section>;
}

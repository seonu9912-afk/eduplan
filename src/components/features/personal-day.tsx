"use client";
import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/common";
import { addDays, dateLabel } from "@/lib/domain";
import { timetableAt } from "@/lib/timetable-view";
import { periodChangeBadge } from "@/lib/timetable-display";
import {
  dailyOperationSummary, createLessonResolver, currentAndNext, dailyLessonStatus,
  myTeacherIds, publishedTimetable, seoulClock,
} from "@/lib/school-operations";
import type { Context } from "@/lib/models";
import { publicationAt } from "@/lib/school-publications";
import { compactCalendarWeek, publishedScheduleDays, schoolScheduleEntries, type ScheduleEntry } from "@/lib/school-schedule";
import { visibleWeekDate, visibleWeekDates } from "@/lib/schedule-dates";
import { ResourceLinks } from "./resource-links";
import { DepartmentBadge } from "./department-badge";
import { scheduleDepartmentColor } from "@/lib/department-badge";
import { LessonReminderSettings } from "./lesson-reminder-settings";
import { MyTasks } from "./my-tasks";
import { ScheduleDetailDialog, ScheduleDetailTitle, useScheduleDetail } from "./schedule-detail";
import { useWeekendVisibility, WeekendToggle } from "./weekend-visibility";
import { useHomeRefresh } from "./home-auto-refresh";
import { MobileCalendarDates } from "./mobile-calendar-dates";
import "./school-operations.css";

const dayLabel = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" });
const dayTitle = (date: string) => dayLabel.format(new Date(`${date}T00:00:00+09:00`));
const lessonStatusLabels = { cancelled: "취소", finished: "종료", current: "진행 중", upcoming: "예정", unknown: "시각 확인" };

export function PersonalDay({ context: c, today, previewNow, publicData, shortcuts }: {
  context: Context;
  today: string;
  previewNow?: string;
  publicData?: ReactNode;
  shortcuts?: ReactNode;
}) {
  const [now, setNow] = useState(() => previewNow ? new Date(previewNow) : null);
  const doc = useMemo(() => publishedTimetable(c), [c]);
  const resolver = useMemo(() => doc ? createLessonResolver(c, doc) : null, [c, doc]);
  const ids = useMemo(() => myTeacherIds(c), [c]);
  const clock = seoulClock(now ?? new Date(`${today}T00:00:00+09:00`));
  useHomeRefresh(today, !!publicData && !previewNow);
  const publicDataDateChanged = !!publicData && !previewNow && clock.date !== today;
  const lessons = resolver?.(clock.date).filter((lesson) => ids.has(lesson.teacherId)) ?? [];
  const operation = dailyOperationSummary(c, clock.date, lessons);
  const effective = timetableAt(c, clock.date).document;
  const periodCount = Math.max(0, ...Object.values(effective?.timetableConfig?.periods ?? {}), ...(effective?.weekly ?? []).map(slot => slot.period), ...lessons.map(lesson => lesson.period));
  const [lessonPeriod, setLessonPeriod] = useState<number | null>(null);
  const hasOperationNotice = operation.notices.length > 0 || operation.changed > 0 || operation.cancelled > 0;
  const { current, next, remaining } = currentAndNext(lessons, clock.minutes);
  const statuses = lessons.map((lesson) => dailyLessonStatus(lesson, now ? clock.minutes : null));
  const allFinished = statuses.includes("finished") && statuses.every((status) => status === "finished" || status === "cancelled");
  const allCancelled = statuses.length > 0 && statuses.every((status) => status === "cancelled");
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
        <section className="personal-widget home-lessons-widget">
          <header className="personal-day-heading">
            <h2><Clock3 aria-hidden="true" />오늘 수업</h2>
            <time className="daily-clock" dateTime={clock.date}>{dayTitle(clock.date)}</time>
          </header>
          {hasOperationNotice && <div className="home-operation-notice" data-warning={operation.warning ? "" : undefined}>
            <div className="home-operation-title"><Clock3 aria-hidden="true" size={15}/><strong>{operation.warning ? "일과 확인 필요" : "오늘의 일과 안내"}</strong></div>
            {operation.notices.map((notice,index)=><p key={index}>{notice}</p>)}
            {(operation.changed>0||operation.cancelled>0)&&<p>나의 수업 · {[operation.changed>0?`변경 ${operation.changed}건`:"",operation.cancelled>0?`미운영·확인 필요 ${operation.cancelled}건`:""].filter(Boolean).join(" · ")}</p>}
            {operation.changes.length>0&&<details><summary>교시별 시각 변경 {operation.changes.length}건</summary><ul>{operation.changes.map(row=><li key={row.period}><b>{row.period}교시</b><span>{row.before} → {row.after}</span></li>)}</ul></details>}
          </div>}
          {!doc ? <p className="personal-widget-note">시간표가 확정되면 담당 수업이 표시됩니다.</p>
            : !teacher ? <p className="personal-widget-note">교원 명부에 연결되지 않았습니다. 관리자에게 계정 연결을 요청하세요.</p>
            : <>
              {now && (hasCalendar || lessons.length > 0) && <div className="next-lesson" data-lesson-summary={current.length ? "current" : next ? "upcoming" : "idle"} role="group" aria-label="수업 현황" aria-live="polite">
                {current.length > 0 ? <>
                  <span className="next-lesson-label">진행 중인 수업</span>
                  <strong>{current.map((item) => `${item.period}교시 · ${item.classes} ${item.subject}`).join(" / ")}</strong>
                  <small>{current.map((item) => `${item.end} 종료 예정`).join(" · ")}</small>
                  {next && <small className="lesson-summary-next">다음 · {next.start} {next.period}교시 {next.classes} {next.subject}</small>}
                </> : next ? <>
                  <span className="next-lesson-label">다음 수업</span>
                  <time className="next-lesson-clock" dateTime={next.start ?? undefined}>{next.start}</time>
                  <strong>{next.period}교시 · {next.classes} {next.subject}</strong>
                  {remaining !== null && <small>시작까지 {remaining >= 60 ? `${Math.floor(remaining / 60)}시간 ${remaining % 60}분` : `${remaining}분`}</small>}
                </> : <p>{allFinished ? "오늘 예정된 수업 시간이 모두 지났습니다." : allCancelled ? "오늘 운영되는 수업이 없습니다." : lessons.length ? "다음 수업 시각을 확인할 수 없습니다." : "오늘 배정된 수업이 없습니다."}</p>}
              </div>}
              {periodCount > 0 && (hasCalendar || lessons.length > 0) && <div className="home-period-desktop">
                <ol className="home-period-grid" style={{"--home-period-columns": Math.min(7, periodCount)} as CSSProperties} aria-label="오늘 교시별 수업">
                  {Array.from({length:periodCount},(_,index)=>{
                    const period=index+1;
                    const assigned=lessons.filter(lesson=>lesson.period===period);
                    const lesson=assigned.find(item=>!item.blockedBy.length) ?? assigned[0];
                    const status=lesson ? dailyLessonStatus(lesson, now ? clock.minutes : null) : undefined;
                    const shift=operation.changes.find(change=>change.period===period);
                    const badge=lesson?.blockedBy.length ? "확인" : lesson?.changed ? "변경" : shift ? periodChangeBadge(shift.before,shift.after) : undefined;
                    const classLabel=lesson?.classes.replace(/(\d+)학년\s*(\d+)반/g,"$1-$2");
                    const grades=[...new Set(lesson?.classIds.map(id=>c.classes.find(cls=>cls.id===id)?.grade).filter(Boolean)??[])];
                    return <li key={period}><span className="home-period-number">{period}교시</span>{lesson ? <button type="button" className="home-period-card" data-grade={grades.length===1?grades[0]:undefined} data-status={status} onClick={()=>setLessonPeriod(period)} aria-label={period+"교시 "+assigned.map(item=>item.classes+" "+item.subject).join(", ")+" 상세 보기"}>
                      <span className="home-period-badge">{badge??(status==="current"?"진행 중":status==="upcoming"&&lesson===next?"다음":"")}{assigned.length>1?" +"+(assigned.length-1):""}</span>
                      <strong>{classLabel||lesson.subject}</strong><small>{lesson.subject}</small>
                    </button> : <div className="home-period-card home-period-empty" aria-label={period+"교시 배정 수업 없음"}>—</div>}</li>;
                  })}
                </ol>
                <div className="home-period-footer"><span>배정 {new Set(lessons.filter(lesson=>!lesson.blockedBy.length).map(lesson=>lesson.period)).size}교시</span><Link href={previewNow?"/recovery-preview/operations":`${base}/timetable${suffix}`} className="widget-link">시간표 보기 <ArrowUpRight aria-hidden="true"/></Link></div>
              </div>}
              {lessons.length > 0 && <ol className="personal-lesson-list">
                {lessons.map((lesson, index) => <li key={`${lesson.id}:${index}`} data-lesson-status={statuses[index]} className={`daily-lesson${lesson.blockedBy.length ? " cancelled" : ""}`}>
                  <div>
                    <b>{lesson.period}교시</b>
                    <small className="daily-lesson-time">{lesson.start && lesson.end ? `${lesson.start}–${lesson.end}` : "시각 미설정"}</small>
                  </div>
                  <div>
                    <div className="daily-lesson-subject"><strong>{lesson.subject}</strong><span className="daily-lesson-status">{statuses[index] === "upcoming" && lesson === next && now ? "다음" : lessonStatusLabels[statuses[index]]}</span></div>
                    <small>{[lesson.classes, lesson.room].filter(Boolean).join(" · ")}</small>
                    {lesson.changed && <small>변경·교환·보결 수업</small>}
                    {!!lesson.blockedBy.length && <small>{lesson.blockedBy.join(" · ")}</small>}
                  </div>
                </li>)}
              </ol>}
            </>}
        </section>
      {publicDataDateChanged ? <>
        <section className="personal-widget school-public-widget" aria-busy="true"><header className="personal-day-heading"><h2>날씨</h2></header><p className="personal-widget-note" role="status">새 날짜의 날씨를 확인하는 중…</p></section>
        <section className="personal-widget school-public-widget" aria-busy="true"><header className="personal-day-heading"><h2>오늘의 급식</h2></header><p className="personal-widget-note" role="status">새 날짜의 급식 정보를 확인하는 중…</p></section>
      </> : publicData}
    </div>
    <div className="home-week-and-tasks">
      <HomeWeeklyAgenda context={c} today={clock.date} department={teacher?.department} plansHref={previewNow ? "/recovery-preview/operations" : `${base}/plans${suffix}`} />
      <aside className="home-dashboard-side" aria-label="개인 업무 및 바로가기">
        <MyTasks key={c.taskFocus?.id ?? c.taskFocus?.source} context={c} today={clock.date} dashboard />
        {shortcuts && <div className="home-shortcuts">{shortcuts}</div>}
      </aside>
    </div>
    <Modal open={lessonPeriod!==null} onOpenChange={open=>{if(!open)setLessonPeriod(null)}} title={`${lessonPeriod??""}교시 수업`} description={dayTitle(clock.date)}>
      <ul className="home-period-detail-list">{lessons.filter(lesson=>lesson.period===lessonPeriod).map((lesson,index)=><li key={lesson.id+":"+index}>
        <strong>{lesson.classes} · {lesson.subject}</strong>
        <p>{lesson.start&&lesson.end?lesson.start+"–"+lesson.end:"시각 미설정"} · {lessonStatusLabels[dailyLessonStatus(lesson, now?clock.minutes:null)]}</p>
        {lesson.room&&<p>{lesson.room}</p>}{lesson.changed&&<p>변경·교환·보결 수업</p>}{lesson.blockedBy.map(reason=><p key={reason}>{reason}</p>)}
      </li>)}</ul>
    </Modal>
    {previewNow && <LessonReminderSettings workspaceId={c.workspace.id} userId={c.userId} />}
  </section>;
}


const liveClockFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const liveDateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long",
});

function HomeLiveClock({ today, previewNow }: { today: string; previewNow?: string }) {
  const [instant, setInstant] = useState<Date | null>(() => previewNow ? new Date(previewNow) : null);
  useEffect(() => {
    const tick = () => setInstant(new Date(previewNow ?? Date.now()));
    const first = window.setTimeout(tick, 0);
    const timer = previewNow ? undefined : window.setInterval(tick, 10000);
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
      {instant ? liveClockFormat.format(instant) : "--:--"}
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
      return [day, { entries: visible, available: published ? !!published.get(day)?.available : true }] as const;
    }));
  }, [context, dates, department]);
  const {lanes: visibleLanes, hidden: overflowByDay} = useMemo(() => compactCalendarWeek(dates, days, 3), [dates, days]);
  const detail = days.get(selected)?.entries ?? [];
  const hasEntries = visibleLanes.some(lane=>lane.length>0);
  const available = days.get(selected)?.available;
  const weekAvailable = [...days.values()].some(day=>day.available);
  const firstMonth = dates[0].slice(0, 7);
  const lastMonth = dates[dates.length - 1].slice(0, 7);
  const monthTitle = firstMonth === lastMonth
    ? `${Number(firstMonth.slice(5))}월`
    : `${Number(firstMonth.slice(5))}월 – ${Number(lastMonth.slice(5))}월`;

  return <div className="home-calendar-stack">
  <section className="personal-widget home-weekly-agenda" aria-label="주간 일정">
    <header className="personal-day-heading">
      <h2><CalendarDays aria-hidden="true" />주간 일정</h2>
      <Link className="widget-link" href={plansHref}>업무 계획 <ArrowUpRight aria-hidden="true" /></Link>
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
    <div className="home-week-mobile-grid" data-weekdays-only={dates.length === 5 ? "" : undefined}>
      <MobileCalendarDates date={selected} today={today} start={dates[0]} end={dates[dates.length-1]} period="week"
        showWeekends={weekend.showWeekends} emphasizeToday compactRows spanDays={days}
        items={day => days.get(day)?.entries ?? []} onSelect={setSelection} onNavigate={step => setSelection(addDays(selected,step*7))} />
    </div>
    <div className="home-week-grid" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))`, gridTemplateRows: `48px repeat(3, 30px) 24px` }}>
      {dates.map((day, column) => <div key={day} className="home-week-column"
        style={{ gridColumn: column + 1, gridRow: "1 / -1" }} aria-hidden="true" />)}
      {dates.map((day, column) => <button key={day} type="button" className="home-week-date"
        data-weekend={column >= 5 ? "" : undefined} aria-current={day === today ? "date" : undefined}
        aria-pressed={day === selected} aria-label={dayTitle(day)}
        style={{ gridColumn: column + 1, gridRow: 1 }} onClick={() => setSelection(day)}>
        <span>{weekdayNames[column]}</span><time dateTime={day}>{Number(day.slice(8))}</time>
      </button>)}
      {visibleLanes.flatMap((lane, row) => lane.map(({ entry, start, end }) =>
        <button type="button" className="home-week-event" data-continues-before={entry.date<dates[start]?"":undefined} data-continues-after={entry.end>dates[end]?"":undefined} data-past={entry.end < today ? "" : undefined} data-tone={entry.tone} data-department-color={scheduleDepartmentColor(entry.department, entry.tone)}
          key={`${entry.id}:${start}:${row}`}
          style={{ gridColumn: `${start + 1} / ${end + 2}`, gridRow: row + 2 }}
          aria-label={`${entry.title}, ${dateLabel(dates[start])}${start !== end ? `부터 ${dateLabel(dates[end])}까지` : ""}`}
          title={entry.title}
          onClick={(event) => { setSelection(dates.includes(selected) && selected >= dates[start] && selected <= dates[end] ? selected : dates[start]); scheduleDetail.show(entry, event.currentTarget); }}>
          <span className="schedule-department-title">{entry.department && <DepartmentBadge department={entry.department} />}<span>{entry.title}</span></span>
        </button>))}
      {overflowByDay.map((count,column)=>count>0&&<button type="button" className="home-week-overflow" key={dates[column]} style={{gridColumn:column+1,gridRow:5}} onClick={()=>setSelection(dates[column])} aria-label={dayTitle(dates[column])+" 추가 일정 "+count+"건"}>+{count}</button>)}
      {!hasEntries && <p className="home-week-empty">{weekAvailable?"이번 주 등록된 일정이 없습니다.":"공개된 학교 일정이 없습니다."}</p>}
    </div>
  </section>
    <section className="personal-widget home-week-detail" aria-label="선택 날짜 상세 일정" aria-live="polite">
      <header className="personal-day-heading home-detail-heading"><h2>{selected===today?"오늘의 일정":"선택한 날짜 일정"}</h2><span className="home-detail-count">{dayTitle(selected)} · {detail.length}건</span></header>
      {detail.length ? <ul className="home-week-detail-list">{detail.map((entry: ScheduleEntry, index) =>
        <li key={`${entry.id}:${index}`} data-past={entry.end < today ? "" : undefined} data-tone={entry.tone} data-department-color={scheduleDepartmentColor(entry.department, entry.tone)}>
          <ScheduleDetailTitle className="home-week-detail-trigger" entry={entry} onOpen={scheduleDetail.show}><span className="home-week-detail-title">{entry.department && <DepartmentBadge department={entry.department} />}<span>{entry.title}</span></span><small>{[entry.date!==entry.end?`${dateLabel(entry.date)} – ${dateLabel(entry.end)}`:"",entry.time, entry.location, agendaTones[entry.tone],entry.participants].filter(Boolean).join(" · ")}</small></ScheduleDetailTitle>
          <ResourceLinks value={entry.resources} compact />
        </li>)}</ul> : <p className="personal-widget-note">{available?"등록된 일정이 없습니다.":"선택한 날짜에 공개된 일정이 없습니다."}</p>}
    </section>
    <ScheduleDetailDialog context={context} entry={scheduleDetail.entry} onClose={scheduleDetail.close} onCloseAutoFocus={scheduleDetail.restoreFocus} />
  </div>;
}

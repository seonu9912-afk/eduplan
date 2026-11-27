"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, dateLabel, monthRange, weekRange } from "@/lib/domain";
import type { Context } from "@/lib/models";
import { publicationAt, publishedSchoolContext } from "@/lib/school-publications";
import { calendarWeekLanes, publishedScheduleDays, schoolScheduleEntries, type ScheduleEntry } from "@/lib/school-schedule";
import { scheduleDates, shiftScheduleDate } from "@/lib/schedule-dates";
import { Disclosure } from "@/components/ui/disclosure";
import { MobileCalendarDates } from "./mobile-calendar-dates";
import { ResourceLinks } from "./resource-links";
import { DepartmentBadge } from "./department-badge";
import { scheduleDepartmentColor } from "@/lib/department-badge";
import "./school-plan-readers.css";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const weekLabels = [...weekdays.slice(1), weekdays[0]];
const tones = { event: "학사일정", work: "업무계획", break: "휴업·방학" };
type ScheduleView = "month" | "week" | "year";

export function OfficialSchedule({ context: c, today, work = false, actions }: { context: Context; today: string; work?: boolean; actions?: ReactNode }) {
  const year = c.year!.year;
  const start = `${year}-03-01`, end = addDays(`${year + 1}-03-01`, -1);
  const clamp = (value: string) => value < start ? start : value > end ? end : value;
  const [date, setDate] = useState(clamp(today));
  const [view, setView] = useState<ScheduleView>(work ? "week" : "month");
  const [selectedRelease, setSelectedRelease] = useState<string | null>(null);
  const month = date.slice(0, 7);
  const range = view === "year" ? { start, end } : view === "week" ? weekRange(date) : monthRange(month);
  const publications = c.schoolPublications ?? [];
  const selected = publications.find((release) => release.id === selectedRelease);
  const displayed = selected
    ? [selected, ...publications.filter((release) => release.domain !== selected.domain)]
    : publications;
  const officialContext = { ...c, schoolPublications: displayed };
  const dates = view === "year" ? [] : scheduleDates(date, view);
  const days = publishedScheduleDays(officialContext, dates.filter((day) => day >= start && day <= end), work);
  const available = view === "year" ? !!publicationAt(displayed, "calendar", date) :
    [...days.values()].some((day) => day.available);
  const entries = view === "year" && available
    ? schoolScheduleEntries(publishedSchoolContext(officialContext, date), start, end, false)
    : [];
  const agendaDates = view === "week"
    ? dates.filter((day) => day === date || (days.get(day)?.entries.length ?? 0) > 0)
    : [date];
  const title = view === "year" ? `${year}학년도` : view === "week"
    ? `${dateLabel(range.start)} – ${dateLabel(range.end)}` : `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
  const options: { value: ScheduleView; label: string }[] = [
    { value: "month", label: work ? "월중계획" : "월간" },
    { value: "week", label: work ? "주간계획" : "주간" },
    ...(!work ? [{ value: "year" as const, label: "연간" }] : []),
  ];
  const canPrevious = view !== "year" && range.start > start;
  const canNext = view !== "year" && range.end < end;
  function navigate(step: number) {
    if (view === "year" || (step < 0 ? !canPrevious : !canNext)) return;
    setDate(clamp(shiftScheduleDate(date, view, step)));
  }
  function selectDate(day: string) {
    setDate(day);
    if (view === "week")
      requestAnimationFrame(() => document.getElementById(`agenda-${day}`)?.scrollIntoView({ block: "nearest" }));
  }
  const updates = publications.filter((p) => p.domain === (work ? "plans" : "calendar"))
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  return (
    <section className="school-plan-reader">
      <div className="schedule-reader-toolbar no-print">
        <div className="schedule-period-nav">
          <Button variant="ghost" size="icon" aria-label="이전 기간" disabled={!canPrevious} onClick={() => navigate(-1)}><ChevronLeft /></Button>
          <h2 aria-live="polite">{title}</h2>
          <Button variant="ghost" size="icon" aria-label="다음 기간" disabled={!canNext} onClick={() => navigate(1)}><ChevronRight /></Button>
          <Button variant="outline" size="sm" disabled={today < start || today > end} onClick={() => setDate(today)}>오늘</Button>
        </div>
        <div className="schedule-view-controls">
          <div className="schedule-segments" role="group" aria-label="보기 전환">
            {options.map(({ value, label }) => <button key={value} type="button" aria-pressed={view === value}
              onClick={() => setView(value)}>{label}</button>)}
          </div>
          <label className="schedule-jump"><span className="sr-only">기준일</span>
            <input type="date" value={date} min={start} max={end} onChange={(e) => {
              if (e.target.value) setDate(clamp(e.target.value));
            }} />
          </label>
          <Button variant="ghost" size="icon" title="인쇄·PDF 저장" aria-label="인쇄" onClick={() => window.print()} disabled={!available}><Printer /></Button>
          {actions}
        </div>
      </div>
      <h2 className="schedule-print-title">{title}</h2>
      {selected && <div className="school-reader-toolbar">
        <span className="muted">공개본 · {selected.starts_on} 적용 · 버전 {selected.source_version}</span>
        <Button className="no-print" variant="outline" onClick={() => setSelectedRelease(null)}>자동 적용본 보기</Button>
      </div>}
      {view === "year" ? (
        available ? (
          <table className="school-reader-list"><thead><tr><th>기간</th><th>학사일정</th></tr></thead>
            <tbody>{entries.map((item) => <tr key={item.id}><td>{dateLabel(item.date)}{item.end !== item.date && ` ~ ${dateLabel(item.end)}`}</td>
              <td>{item.title}<ResourceLinks value={item.resources} compact /></td></tr>)}</tbody>
          </table>
        ) : <p className="panel school-reader-empty">선택한 날짜에 적용되는 공개 계획이 없습니다.</p>
      ) : <>
        <div className="school-calendar-mobile no-print">
          <MobileCalendarDates date={date} today={today} start={start} end={end} period={view}
            items={(day) => days.get(day)?.entries ?? []}
            onSelect={selectDate} onNavigate={navigate} />
          <div className="school-calendar-agenda" aria-label={view === "week" ? "이번 주 일정" : "선택한 날짜의 일정"}>
            {agendaDates.map((day) => {
              const schedule = days.get(day);
              return <section key={day} id={`agenda-${day}`} aria-label={dateLabel(day)}
                data-selected={day === date ? "" : undefined}>
                <h3><time dateTime={day}>{dateLabel(day)} {weekdays[new Date(`${day}T00:00:00Z`).getUTCDay()]}요일</time>
                  {day === today && <span>오늘</span>}</h3>
                {schedule?.entries.length ? <ul>{schedule.entries.map((entry) => {
                  const detail = [entry.location].filter(Boolean).join(" · ");
                  return <li key={entry.id} data-tone={entry.tone} data-department-color={scheduleDepartmentColor(entry.department, entry.tone)}>
                    <span className="schedule-agenda-time">{entry.time || tones[entry.tone]}</span>
                    <div><div className="schedule-department-title">{entry.department && <DepartmentBadge department={entry.department} />}<strong>{entry.title}</strong></div>
                      {detail && <small>{detail}</small>}
                      <ResourceLinks value={entry.resources} />
                    </div>
                  </li>;
                })}</ul> : <p className="schedule-agenda-empty"><CalendarDays aria-hidden="true" size={18} />
                  {schedule?.available ? "등록된 일정이 없습니다." : "선택한 날짜에 적용되는 공개 계획이 없습니다."}
                </p>}
              </section>;
            })}
          </div>
        </div>
        <div className="school-calendar-desktop">
          {!available ? <p className="panel school-reader-empty">선택한 날짜에 적용되는 공개 계획이 없습니다.</p> : (
            <div className="table-scroll school-reader-calendar-wrap" role="region" aria-label="공개 일정" tabIndex={0}>
              <table className="school-reader-calendar" aria-label="공개 일정표">
                <thead><tr>{(view === "week" ? weekLabels : weekdays).map((d) => <th scope="col" key={d}>{d}</th>)}</tr></thead>
                {Array.from({ length: dates.length / 7 }, (_, i) => {
                  const week = dates.slice(i * 7, i * 7 + 7);
                  const lanes = calendarWeekLanes(week, days);
                  const outside = (day: string) => day < start || day > end || (view === "month" && !day.startsWith(month)) ? "" : undefined;
                  return <tbody key={week[0]} className="school-calendar-week">
                    <tr className="school-calendar-date-row">{week.map((day) => (
                      <td key={day} data-outside={outside(day)}>
                        <time dateTime={day} aria-current={day === today ? "date" : undefined}>{Number(day.slice(8))}</time>
                      </td>
                    ))}</tr>
                    {lanes.map((lane, index) => <tr className="school-calendar-event-row" key={index}>
                      {week.map((day, col) => {
                        const span = lane.find((item) => item.start <= col && item.end >= col);
                        if (span && span.start !== col) return null;
                        return <td key={day} colSpan={span ? span.end - span.start + 1 : 1}
                          data-outside={!span ? outside(day) : undefined} className={span ? "school-calendar-span-cell" : undefined}>
                          {span && <DesktopCalendarEvent entry={span.entry} />}
                        </td>;
                      })}
                    </tr>)}
                    <tr className="school-calendar-week-space" aria-hidden="true">{week.map((day) => (
                      <td key={day} data-outside={outside(day)} />
                    ))}</tr>
                  </tbody>;
                })}
              </table>
            </div>
          )}
        </div>
      </>}
      {updates.length > 0 && <Disclosure label="공개 이력" className="school-publication-history no-print">
        <ul>{updates.map((item) => <li key={item.id}>
          <strong>{item.starts_on} 적용 · {item.published_at.slice(0, 10)} 공개</strong>
          {item.change_note && <p>{item.change_note}</p>}
          <Button variant="outline" onClick={() => {
            setSelectedRelease(item.id);
            setDate(clamp(item.starts_on));
          }}>이 버전 보기</Button>
        </li>)}</ul>
      </Disclosure>}
    </section>
  );
}

function DesktopCalendarEvent({ entry }: { entry: ScheduleEntry }) {
  const detail = entry.tone === "work" ? entry.time : "";
  return <div className="school-reader-event" data-tone={entry.tone} data-department-color={scheduleDepartmentColor(entry.department, entry.tone)}>
    <div className="schedule-department-title">{entry.department && <DepartmentBadge department={entry.department} />}<span>{entry.title}</span></div>{detail && <small>{detail}</small>}
    <ResourceLinks value={entry.resources} compact />
  </div>;
}

export function OfficialCurriculum({ context: c }: { context: Context }) {
  const plans = c.curriculumPublications ?? [];
  const year = c.year!.year;
  const end = addDays(`${year + 1}-03-01`, -1);
  const byYear = plans.filter((p) => !p.starts_on || p.starts_on <= end);
  const cohorts = [...new Set(byYear.map((p) => p.cohort_year))];
  const [selection, setSelection] = useState<{ cohort: number; id?: string } | null>(null);
  const preferred = selection?.cohort ?? year;
  const cohort = cohorts.includes(preferred) ? preferred : cohorts.find((value) => value <= year) ?? cohorts[0];
  const history = byYear.filter((p) => p.cohort_year === cohort);
  const plan = history.find((p) => p.id === selection?.id) ?? history[0];
  const terms = c.grades.flatMap((grade) => [1, 2].map((semester) => ({ grade, semester })));
  if (!plan) return <p className="panel school-reader-empty">공개된 교육과정 편성표가 없습니다.</p>;
  const ids = [...new Set(plan.hours.map((h) => h.subject_id))];
  const hours = new Map(plan.hours.map((h) => [`${h.subject_id}:${h.grade}:${h.semester}`, h.hours]));
  const rows = ids.map((id) => ({
    id,
    name: plan.subject_names?.[id] ?? c.subjects.find((s) => s.id === id)?.name ?? "이전 교과목",
    values: terms.map((t) => hours.get(`${id}:${t.grade}:${t.semester}`)),
  }));
  return <section className="school-plan-reader">
    <div className="school-reader-toolbar">
      <label>입학년도 <select value={plan.cohort_year} onChange={(e) => setSelection({ cohort: Number(e.target.value) })}>
        {cohorts.map((value) => <option key={value} value={value}>{value}학년도 입학생</option>)}
      </select></label>
      {history.length > 1 && <label className="no-print">공개 버전 <select value={plan.id} onChange={(e) => setSelection({ cohort, id: e.target.value })}>
        {history.map((p, index) => <option key={p.id} value={p.id}>
          {p.starts_on ? `${p.starts_on} 적용` : `${p.confirmed_at.slice(0, 10)} 공개`} · {history.length - index}차
        </option>)}
      </select></label>}
      <Button className="no-print" variant="outline" onClick={() => window.print()}><Printer /> 인쇄</Button>
    </div>
    <p className="muted">{plan.starts_on && `${plan.starts_on} 적용 · `}{plan.confirmed_at.slice(0, 10)} 공개</p>
    {plan.change_note && <p>{plan.change_note}</p>}
    <div className="table-scroll">
      <table className="school-reader-list school-curriculum-sheet" aria-label="공개 교육과정 편성표">
        <thead><tr><th rowSpan={2} scope="col">교과목</th>{c.grades.map((g) => <th key={g} colSpan={2} scope="colgroup">{g}학년</th>)}<th rowSpan={2} scope="col">합계</th></tr>
          <tr>{terms.map((t) => <th key={`${t.grade}:${t.semester}`} scope="col">{t.semester}학기</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><th scope="row">{r.name}</th>{r.values.map((value, index) => <td key={index}>{value ?? "—"}</td>)}
          <td>{r.values.reduce<number>((sum, value) => sum + (value ?? 0), 0)}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row">학기별 합계</th>{terms.map((t, ix) => <td key={`${t.grade}:${t.semester}`}>{rows.reduce((sum, row) => sum + (row.values[ix] ?? 0), 0)}</td>)}
          <td>{plan.hours.reduce((sum, h) => sum + h.hours, 0)}</td></tr></tfoot>
      </table>
    </div>
  </section>;
}

export function OfficialTeaching({ context: c }: { context: Context }) {
  const [term, setTerm] = useState(0);
  const [grade, setGrade] = useState(0);
  const plans = (c.teachingPublications ?? []).filter((item) =>
    (!term || item.semester === 0 || item.semester === term) && (!grade || item.grade === grade),
  );
  return <section className="school-plan-reader">
    <div className="school-reader-toolbar no-print">
      <label>학년 <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
        <option value={0}>전체 학년</option>
        {c.grades.map((value) => <option key={value} value={value}>{value}학년</option>)}
      </select></label>
      <label>학기 <select value={term} onChange={(e) => setTerm(Number(e.target.value))}>
        <option value={0}>전체 학기</option><option value={1}>1학기</option><option value={2}>2학기</option>
      </select></label>
    </div>
    {!plans.length && <p className="panel school-reader-empty">조건에 맞는 공개 수업·평가 계획이 없습니다.</p>}
    {plans.map((plan) => (
      <Disclosure key={plan.course_id} label={`${plan.grade}학년 · ${plan.subject_name} · ${plan.teacher_name}`}>
        <p>{plan.semester ? `${plan.semester}학기` : "연간"} · {plan.starts_on && `${plan.starts_on} 적용 · `}{plan.published_at.slice(0, 10)} 공개</p>
        {plan.change_note && <p>{plan.change_note}</p>}
        {plan.units.length > 0 && <div className="table-scroll">
          <table className="school-reader-list" aria-label="교수학습 계획">
            <thead><tr><th>기간</th><th>단원</th><th>학습 내용</th></tr></thead>
            <tbody>{plan.units.map((unit) => <tr key={unit.id}><td>{unit.period}</td>
              <td>{unit.title}</td><td>{unit.content}</td></tr>)}</tbody>
          </table>
        </div>}
        {plan.evaluations.filter((ev) => !term || term === ev.semester).map((evaluation) => (
          <div className="table-scroll" key={evaluation.semester}>
            <table className="school-reader-list" aria-label={`${evaluation.semester}학기 평가계획`}>
              <thead><tr><th>시기</th><th>평가 영역</th><th>평가 방법</th><th>반영 비율</th></tr></thead>
              <tbody>{evaluation.items.map((item) => <tr key={item.id}><td>{item.period}</td>
                <td>{item.name}</td><td>{item.method}</td><td>{item.ratio === null ? "—" : `${item.ratio}%`}</td></tr>)}</tbody>
            </table>
          </div>
        ))}
      </Disclosure>
    ))}
  </section>;
}

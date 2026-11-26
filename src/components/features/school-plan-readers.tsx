"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, calendarDays, dateLabel, monthRange, weekRange } from "@/lib/domain";
import type { Context } from "@/lib/models";
import { annualSchema } from "@/lib/academic";
import { publicationAt, publishedSchoolContext } from "@/lib/school-publications";
import { unifiedSchedule } from "@/lib/school-operations";
import { Disclosure } from "@/components/ui/disclosure";
import "./school-plan-readers.css";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
export function OfficialSchedule({ context: c, today, work = false }: { context: Context; today: string; work?: boolean }) {
  const year = c.year!.year;
  const start = `${year}-03-01`, end = addDays(`${year + 1}-03-01`, -1);
  const clamp = (value: string) => value < start ? start : value > end ? end : value;
  const [date, setDate] = useState(clamp(today));
  const [view, setView] = useState<"month" | "week" | "year">(work ? "week" : "month");
  const month = date.slice(0, 7);
  const range = view === "year" ? { start, end } : view === "week" ? weekRange(date) : monthRange(month);
  const publications = c.schoolPublications ?? [];
  const calendar = publicationAt(publications, "calendar", date);
  const workPlan = publicationAt(publications, "plans", date);
  const official = publishedSchoolContext(c, date);
  const plan = annualSchema.safeParse(official.annual?.document);
  const items = unifiedSchedule(official, range.start, range.end)
    .filter((item) => work || item.source !== "business");
  const available = !!calendar || (work && !!workPlan);
  const breaks = plan.success && calendar ? plan.data.vacations.map((v) => ({
    id: v.start + v.name, date: v.start, end: v.end, title: v.name,
  })) : [];
  const terms = calendar ? official.semesters.flatMap((s) => [
    { id: s.start_date + s.number, date: s.start_date, end: s.start_date, title: `${s.number}학기 시작` },
    { id: s.end_date + s.number, date: s.end_date, end: s.end_date, title: `${s.number}학기 종료` },
  ]) : [];
  const closures = plan.success && calendar ? [
    ...Object.entries(plan.data.holidays).map(([day, title]) => ({ id: day, date: day, end: day, title })),
    ...Object.entries(plan.data.days).flatMap(([day, rule]) => rule.type === "discretionary" || rule.type === "swap"
      ? [{ id: day + rule.type, date: day, end: day, title: rule.name || (rule.type === "swap" ? "대체 요일 운영" : "재량휴업일") }] : []),
  ] : [];
  const entries = [...items, ...breaks, ...terms, ...closures].filter((item) =>
    item.date <= range.end && item.end >= range.start && item.date <= end && item.end >= start,
  ).sort((a, b) => a.date.localeCompare(b.date));
  const monthDays = calendarDays(month);
  const dates = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(range.start, i)) : monthDays;
  function navigate(step: number) {
    if (view === "week") setDate(clamp(addDays(date, 7 * step)));
    else {
      const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + step, 1));
      setDate(clamp(next.toISOString().slice(0, 10)));
    }
  }
  const updates = publications.filter((p) => p.domain === (work ? "plans" : "calendar"))
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  return (
    <section className="school-plan-reader">
      <div className="school-reader-toolbar no-print">
        <Button variant={view === "month" ? "secondary" : "outline"} onClick={() => setView("month")}>월간</Button>
        {work ? <Button variant={view === "week" ? "secondary" : "outline"} onClick={() => setView("week")}>주간</Button>
          : <Button variant={view === "year" ? "secondary" : "outline"} onClick={() => setView("year")}>연간</Button>}
        <Button variant="ghost" size="icon" aria-label="이전 기간" disabled={date === start || view === "year"} onClick={() => navigate(-1)}><ChevronLeft /></Button>
        <label><span className="sr-only">기준일</span><input type="date" value={date} min={start} max={end} onChange={(e) => {
          if (e.target.value) setDate(clamp(e.target.value));
        }} /></label>
        <Button variant="ghost" size="icon" aria-label="다음 기간" disabled={date === end || view === "year"} onClick={() => navigate(1)}><ChevronRight /></Button>
        <Button variant="outline" onClick={() => window.print()} disabled={!available}><Printer /> 인쇄</Button>
      </div>
      <h2>{view === "year" ? `${year}학년도` : view === "week"
        ? `${dateLabel(range.start)} – ${dateLabel(range.end)}` : `${Number(month.slice(5))}월`}</h2>
      {!available ? <p className="panel school-reader-empty">선택한 날짜에 적용되는 공개 계획이 없습니다.</p>
        : view === "year" ? (
          <table className="school-reader-list"><thead><tr><th>기간</th><th>학사일정</th></tr></thead>
            <tbody>{entries.map((item) => <tr key={item.id}><td>{dateLabel(item.date)}{item.end !== item.date && ` ~ ${dateLabel(item.end)}`}</td><td>{item.title}</td></tr>)}</tbody>
          </table>
        ) : (
          <div className="table-scroll">
            <table className="school-reader-calendar" aria-label="공개 일정표">
              <thead><tr>{(view === "week" ? [...weekdays.slice(1), "일"] : weekdays).map((d) => <th scope="col" key={d}>{d}</th>)}</tr></thead>
              <tbody>{Array.from({ length: dates.length / 7 }, (_, i) => (
                <tr key={dates[i * 7]}>{dates.slice(i * 7, i * 7 + 7).map((day) => (
                  <td key={day} data-outside={day < start || day > end || (view === "month" && !day.startsWith(month)) ? "" : undefined}>
                    <time dateTime={day}>{Number(day.slice(8))}</time>
                    {entries.filter((entry) => entry.date <= day && entry.end >= day).map((entry) => (
                      <p key={entry.id}>{entry.title}</p>
                    ))}
                  </td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        )}
      {updates.length > 0 && <Disclosure label="공개 이력" className="school-publication-history no-print">
        <ul>{updates.map((item) => <li key={item.id}>
          <strong>{item.starts_on} 적용 · {item.published_at.slice(0, 10)} 공개</strong>
          {item.change_note && <p>{item.change_note}</p>}
        </li>)}</ul>
      </Disclosure>}
    </section>
  );
}

export function OfficialCurriculum({ context: c }: { context: Context }) {
  const plans = c.curriculumPublications ?? [];
  const [cohort, setCohort] = useState(c.year?.year ?? plans[0]?.cohort_year ?? 0);
  const plan = plans.find((p) => p.cohort_year === cohort) ?? plans[0];
  const terms = c.grades.flatMap((grade) => [1, 2].map((semester) => ({ grade, semester })));
  if (!plan) return <p className="panel school-reader-empty">공개된 교육과정 편성표가 없습니다.</p>;
  const ids = [...new Set(plan.hours.map((h) => h.subject_id))];
  const hours = new Map(plan.hours.map((h) => [`${h.subject_id}:${h.grade}:${h.semester}`, h.hours]));
  const rows = ids.map((id) => ({
    id,
    name: c.subjects.find((s) => s.id === id)?.name ?? "이전 교과목",
    values: terms.map((t) => hours.get(`${id}:${t.grade}:${t.semester}`)),
  }));
  return <section className="school-plan-reader">
    <div className="school-reader-toolbar">
      <label>입학년도 <select value={plan.cohort_year} onChange={(e) => setCohort(Number(e.target.value))}>
        {plans.map((p) => <option key={p.id} value={p.cohort_year}>{p.cohort_year}학년도 입학생</option>)}
      </select></label>
      <Button className="no-print" variant="outline" onClick={() => window.print()}><Printer /> 인쇄</Button>
    </div>
    <p className="muted">{plan.confirmed_at.slice(0, 10)} 공개</p>
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
        <p>{plan.semester ? `${plan.semester}학기` : "연간"} · {plan.published_at.slice(0, 10)} 공개</p>
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

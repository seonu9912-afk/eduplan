"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { applyEventPeriods } from "@/lib/academic-rebuild";
import { areas, eventPeriodAllocations, isTeachingDay, operatingPeriodRange,
  type AcademicDay, type AnnualPlan } from "@/lib/academic";
import type { Context } from "@/lib/models";

type Area = AnnualPlan["allocations"][number]["areas"][string];

export function AcademicEventPeriods({ context, plan, days, focusDate, onChange, onMessage }: {
  context: Context;
  plan: AnnualPlan;
  days: AcademicDay[];
  focusDate: string;
  onChange: (plan: AnnualPlan) => void;
  onMessage: (message: string) => void;
}) {
  const [eventId, setEventId] = useState("");
  const [date, setDate] = useState(focusDate);
  const [grade, setGrade] = useState(context.grades[0]);
  const [classId, setClassId] = useState("");
  const [slots, setSlots] = useState<number[]>([]);
  const [area, setArea] = useState<Area>("자율·자치");
  const event = context.events.find((item) => item.id === eventId);
  const grades = event?.target_grades.length
    ? context.grades.filter((g) => event.target_grades.includes(g))
    : context.grades;
  const classes = context.classes.filter((item) => item.grade === grade);
  const selectedClass = classes.find((item) => item.id === classId);
  const dateRows = plan.allocations.filter((row) => row.date === date);
  const eventRows = dateRows.filter((row) => row.eventId === eventId);
  const day = days.find((item) => item.date === date);
  const range = day && operatingPeriodRange(day, plan, grade);
  const validDate = event && date >= event.start_date && date <= event.end_date;
  const editable = context.role === "admin";
  if (!context.events.length) return null;
  return (
    <section className="panel annual-section">
      <h2>행사 교시별 편성</h2>
      <p>학년 공통 편성을 적용한 뒤 필요한 학급의 교시를 조정할 수 있습니다.</p>
      <div className="annual-inline">
        <label className="annual-field">등록 행사
          <select value={eventId} onChange={(e) => {
            const next = context.events.find((row) => row.id === e.target.value);
            setEventId(e.target.value);
            setDate(next && (focusDate < next.start_date || focusDate > next.end_date)
              ? next.start_date : focusDate);
            setGrade(context.grades.find((g) => !next?.target_grades.length ||
              next.target_grades.includes(g)) ?? context.grades[0]);
            setClassId("");
            setSlots([]);
          }}>
            <option value="">선택</option>
            {context.events.map((row) => (
              <option key={row.id} value={row.id}>{row.start_date} · {row.title}</option>
            ))}
          </select>
        </label>
        {event && <>
          <label className="annual-field">행사일
            <input type="date" value={date} min={event.start_date} max={event.end_date}
              onChange={(e) => { setDate(e.target.value); setSlots([]); }} />
          </label>
          <label className="annual-field">학년
            <select value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setClassId(""); setSlots([]); }}>
              {grades.map((g) => <option key={g} value={g}>{g}학년</option>)}
            </select>
          </label>
          {classes.length > 0 && <label className="annual-field">적용 대상
            <select value={classId} onChange={(e) => { setClassId(e.target.value); setSlots([]); }}>
              <option value="">학년 공통</option>
              {classes.map((item) => <option key={item.id} value={item.id}>
                {grade}학년 {item.class_number}반
              </option>)}
            </select>
          </label>}
        </>}
      </div>
      {validDate && <>
        {(!range || !day || !isTeachingDay(day)) && <p className="muted">
          수업일과 운영 교시를 설정하면 활동 시수가 집계됩니다.
        </p>}
        <div className="academic-period-slots" aria-label="행사 교시">
          {Array.from({ length: 12 }, (_, index) => {
            const period = index + 1;
            const rows = eventPeriodAllocations(eventRows, grade, period, selectedClass?.id);
            const assigned = rows.map((row) => row.areas[grade]);
            const text = assigned.join(" / ") || "교과";
            const isException = rows.some((row) => row.classId);
            const outsideRange = range && (period < range.start || period > range.end);
            const label = `${period}교시 · ${text}${isException ? " · 학급 예외" : ""}`;
            return editable
              ? <button key={period} type="button" aria-pressed={slots.includes(period)}
                  disabled={!!outsideRange && !rows.length}
                  onClick={() => setSlots((previous) => previous.includes(period)
                    ? previous.filter((item) => item !== period) : [...previous, period])}>{label}</button>
              : <span key={period}>{label}</span>;
          })}
        </div>
        {editable && <div className="annual-inline">
          <label className="annual-field">선택 교시 활동
            <select value={area} onChange={(e) => setArea(e.target.value as Area)}>
              {areas.map((value) => <option key={value} value={value}>
                {value === "없음" ? (selectedClass ? "학년 공통 적용" : "개별 배정 해제") : value}
              </option>)}
            </select>
          </label>
          <Button disabled={!slots.length} onClick={() => {
            const scopes = selectedClass ? [selectedClass] : classes.length ? classes : [null];
            const overlaps = scopes.flatMap((item) => slots.flatMap((period) =>
              eventPeriodAllocations(dateRows, grade, period, item?.id)
                .filter((row) => row.eventId !== event.id)
                .map((row) => `${item ? `${grade}학년 ${item.class_number}반` : `${grade}학년`} ${period}교시 ${row.title}`)));
            if (area !== "없음" && overlaps.length && !window.confirm(
              `${date} ${event.title}의 교시가 기존 배정과 겹칩니다.\n${[...new Set(overlaps)].join("\n")}\n적용할까요?`,
            )) return;
            onChange({ ...plan, allocations: applyEventPeriods(plan.allocations, {
              eventId: event.id, date, title: event.title, department: event.department,
            }, grade, slots, area, () => crypto.randomUUID(), selectedClass?.id) });
            onMessage("선택 교시에 반영했습니다. 연간 계획을 저장해 주세요.");
            setSlots([]);
          }}>선택한 교시 적용</Button>
        </div>}
      </>}
    </section>
  );
}

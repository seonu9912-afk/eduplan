"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { applyEventPeriods } from "@/lib/academic-rebuild";
import { areas, type AnnualPlan } from "@/lib/academic";
import type { Context } from "@/lib/models";

type Area = AnnualPlan["allocations"][number]["areas"][string];

export function AcademicEventPeriods({ context, plan, focusDate, onChange, onMessage }: {
  context: Context;
  plan: AnnualPlan;
  focusDate: string;
  onChange: (plan: AnnualPlan) => void;
  onMessage: (message: string) => void;
}) {
  const [eventId, setEventId] = useState("");
  const [date, setDate] = useState(focusDate);
  const [grade, setGrade] = useState(context.grades[0]);
  const [slots, setSlots] = useState<number[]>([]);
  const [area, setArea] = useState<Area>("자율·자치");
  const event = context.events.find((item) => item.id === eventId);
  const grades = event?.target_grades.length
    ? context.grades.filter((g) => event.target_grades.includes(g))
    : context.grades;
  if (!context.events.length) return null;
  return (
    <section className="panel annual-section">
      <h2>행사 교시별 편성</h2>
      <p>행사를 선택한 뒤 날짜·학년별로 필요한 교시의 활동 영역을 지정하세요.</p>
      <div className="annual-inline">
        <label className="annual-field">등록 행사
          <select value={eventId} onChange={(e) => {
            const next = context.events.find((row) => row.id === e.target.value);
            setEventId(e.target.value);
            setDate(next && (focusDate < next.start_date || focusDate > next.end_date)
              ? next.start_date : focusDate);
            setGrade(context.grades.find((g) => !next?.target_grades.length ||
              next.target_grades.includes(g)) ?? context.grades[0]);
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
            <select value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setSlots([]); }}>
              {grades.map((g) => <option key={g} value={g}>{g}학년</option>)}
            </select>
          </label>
        </>}
      </div>
      {event && date >= event.start_date && date <= event.end_date && <>
        <div className="academic-period-slots" aria-label="행사 교시">
          {Array.from({ length: 12 }, (_, index) => {
            const period = index + 1;
            const assigned = plan.allocations.filter((row) => row.eventId === event.id &&
              row.date === date && row.start <= period && period <= row.end)
              .map((row) => row.areas[grade]).filter((value) => value && value !== "없음");
            const text = assigned.join(" / ") || "교과";
            const label = `${period}교시 · ${text}`;
            return context.role === "admin"
              ? <button key={period} type="button" aria-pressed={slots.includes(period)}
                  onClick={() => setSlots((previous) => previous.includes(period)
                    ? previous.filter((item) => item !== period) : [...previous, period])}>{label}</button>
              : <span key={period}>{label}</span>;
          })}
        </div>
        {context.role === "admin" && <div className="annual-inline">
          <label className="annual-field">선택 교시 활동
            <select value={area} onChange={(e) => setArea(e.target.value as Area)}>
              {areas.map((value) => <option key={value} value={value}>
                {value === "없음" ? "개별 배정 해제" : value}
              </option>)}
            </select>
          </label>
          <Button disabled={!slots.length} onClick={() => {
            const overlaps = plan.allocations.filter((row) => row.eventId !== event.id &&
              row.date === date && row.areas[grade] && row.areas[grade] !== "없음" &&
              slots.some((period) => row.start <= period && period <= row.end));
            if (area !== "없음" && overlaps.length &&
                !window.confirm(`겹치는 배정이 있습니다. ${[...new Set(overlaps.map((row) => row.title))].join(", ")}. 적용할까요?`)) return;
            onChange({ ...plan, allocations: applyEventPeriods(plan.allocations, {
              eventId: event.id, date, title: event.title, department: event.department,
            }, grade, slots, area, () => crypto.randomUUID()) });
            onMessage("선택 교시에 반영했습니다. 연간 계획을 저장해 주세요.");
            setSlots([]);
          }}>선택한 교시 적용</Button>
        </div>}
      </>}
    </section>
  );
}

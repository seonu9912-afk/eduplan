"use client";

import { useState } from "react";
import { addDays, dateLabel, monthRange, moveMonth, weekRange } from "@/lib/domain";
import { calendarWeekRange, visibleWeekDates } from "@/lib/schedule-dates";
import { Modal } from "@/components/common";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReaderPeriodNavigator({ title, subtitle, previous, next, today, previousLabel = "이전 기간", nextLabel = "다음 기간", todayDisabled = false, onTitleClick }: {
  title: string; subtitle?: string; previous?: () => void; next?: () => void; today: () => void;
  previousLabel?: string; nextLabel?: string; todayDisabled?: boolean; onTitleClick?: () => void;
}) {
  return <div className="schedule-period-nav reader-period-nav">
    <Button type="button" variant="ghost" size="icon" aria-label={previousLabel} disabled={!previous} onClick={previous}><ChevronLeft /></Button>
    <div className="reader-period-title" aria-live="polite">
      <h2>{onTitleClick ? <button type="button" className="reader-period-picker" aria-label={title+" 날짜 선택"} onClick={onTitleClick}>{title}<ChevronDown className="reader-period-chevron" aria-hidden="true" size={14} /></button> : title}</h2>
      {subtitle && <small>{subtitle}</small>}
    </div>
    <Button type="button" variant="ghost" size="icon" aria-label={nextLabel} disabled={!next} onClick={next}><ChevronRight /></Button>
    <Button type="button" variant="outline" size="sm" className="reader-today" disabled={todayDisabled} onClick={today}>오늘</Button>
  </div>;
}

export function ReaderViewSegment<T extends string>({ options, value, onChange, label, className = "" }: {
  options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string; className?: string;
}) {
  return <div className={`schedule-segments reader-segments ${className}`} role="group" aria-label={label}>
    {options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

export type ReaderPeriod = "week" | "month" | "year" | "day";
const periodLabels = { week: "주간", month: "월간", year: "학년도", day: "날짜" };
const periodDescriptions = { week: "이동할 주를 선택하세요.", month: "이동할 월을 선택하세요.", year: "조회할 학년도를 선택하세요.", day: "조회할 기준 날짜를 선택하세요." };

export function ReaderPeriodDialog({ open, onOpenChange, period, date, start, end, years = [], onSelect, onYearSelect, weekStyle = "calendar", showWeekends = true }: {
  open: boolean; onOpenChange: (open: boolean) => void; period: ReaderPeriod; date: string; start: string; end: string;
  years?: number[]; onSelect: (date: string) => void; onYearSelect?: (year: number) => void;
  weekStyle?: "calendar" | "timetable"; showWeekends?: boolean;
}) {
  return <Modal open={open} onOpenChange={onOpenChange} title={periodLabels[period]+" 이동"} description={periodDescriptions[period]}>
    {open && <ReaderPeriodChoices key={period+date} {...{period,date,start,end,years,onSelect,onYearSelect,weekStyle,showWeekends}} />}
  </Modal>;
}

function ReaderPeriodChoices({ period, date, start, end, years, onSelect, onYearSelect, weekStyle, showWeekends }: {
  period: ReaderPeriod; date: string; start: string; end: string; years: number[]; onSelect: (date: string) => void;
  onYearSelect?: (year: number) => void; weekStyle: "calendar" | "timetable"; showWeekends: boolean;
}) {
  const [month, setMonth] = useState(date.slice(0,7));
  const inRange = (day: string) => day >= start && day <= end;
  const year = Number(start.slice(0,4));
  if(period === "year") return <div className="reader-period-choice-grid" data-period="year">
    {[...new Set([...years,year])].sort((a,b)=>b-a).map(y=><button type="button" key={y} aria-pressed={y===year} onClick={()=>onYearSelect?.(y)}>{y}학년도</button>)}
  </div>;
  if(period === "month") return <section className="reader-period-months" aria-label={year+"학년도 월 선택"}>
    <h3>{year}학년도</h3><div className="reader-period-choice-grid" data-period="month">
      {Array.from({length:12},(_,i)=>moveMonth(start.slice(0,7),i)).map(m=><button type="button" key={m} aria-label={m.slice(0,4)+"년 "+Number(m.slice(5))+"월"} aria-pressed={m===date.slice(0,7)} onClick={()=>onSelect(m===date.slice(0,7)?date:monthRange(m).start)}><span>{Number(m.slice(5))}월</span>{m.slice(0,4)!==String(year)&&<small>{m.slice(0,4)}년</small>}</button>)}
    </div>
  </section>;
  if(period === "day") return <label className="field reader-date-dialog-field">기준 날짜
    <input type="date" aria-label="기준 날짜" value={date} min={start} max={end} onChange={e=>{if(e.target.value&&inRange(e.target.value))onSelect(e.target.value);}} />
  </label>;
  const range = monthRange(month);
  const weekFor = weekStyle==="timetable"?weekRange:calendarWeekRange;
  const weekStart = weekFor(range.start).start;
  const selectedWeek = weekFor(date).start;
  const allWeekStarts: string[] = [];
  for(let day=weekStart;day<=range.end;day=addDays(day,7))allWeekStarts.push(day);
  const rows = allWeekStarts.map(first=>{
    const full=Array.from({length:7},(_,i)=>addDays(first,i));
    const visible=weekStyle==="timetable"?full.slice(0,5):visibleWeekDates(first,showWeekends,start,end);
    const valid=visible.filter(inRange);
    return {first,visible,valid};
  }).filter(row=>row.visible.some(d=>d.startsWith(month)) || row.valid.length>0 && row.first===selectedWeek);
  const dayNames=["일","월","화","수","목","금","토"];
  const seven=weekStyle==="calendar"&&(showWeekends||rows.some(row=>row.visible.length===7));
  const headers=seven?dayNames:dayNames.slice(1,6);
  return <section className="reader-week-picker" aria-label="주간 선택">
    <div className="reader-week-picker-heading">
      <Button type="button" variant="ghost" size="icon" aria-label="이전 달" disabled={range.start<=start} onClick={()=>setMonth(moveMonth(month,-1))}><ChevronLeft size={18}/></Button>
      <h3>{month.slice(0,4)}년 {Number(month.slice(5))}월</h3>
      <Button type="button" variant="ghost" size="icon" aria-label="다음 달" disabled={range.end>=end} onClick={()=>setMonth(moveMonth(month,1))}><ChevronRight size={18}/></Button>
    </div>
    <div className="reader-week-picker-days" style={{gridTemplateColumns:"repeat("+headers.length+",minmax(0,1fr))"}}>{headers.map(d=><span key={d}>{d}</span>)}</div>
    <div className="reader-week-picker-rows">
      {rows.map(({first,visible,valid})=><button type="button" className="reader-week-choice" key={first} disabled={!valid.length} aria-pressed={first===selectedWeek} aria-label={dateLabel(visible[0])+" – "+dateLabel(visible[visible.length-1])+" 주간 선택"} style={{gridTemplateColumns:"repeat("+headers.length+",minmax(0,1fr))"}} onClick={()=>onSelect(first===selectedWeek&&inRange(date)?date:(valid.find(d=>d.startsWith(month))??valid[0]))}>
        {headers.map((_,i)=>{const day=visible.length===headers.length?visible[i]:visible.length===5&&seven?visible[i-1]:visible[i+1];return <span key={i} data-adjacent={day&&!day.startsWith(month)?"":undefined} data-unavailable={!day||!inRange(day)?"":undefined}>{day?Number(day.slice(8)):""}</span>;})}
      </button>)}
    </div>
  </section>;
}

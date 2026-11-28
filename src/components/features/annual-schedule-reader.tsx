"use client";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { calendarDays } from "@/lib/domain";
import { dayTypes } from "@/lib/academic";
import { isAnnualMilestone, type AnnualMonth, type AnnualOccurrence, type AnnualScheduleModel } from "@/lib/annual-schedule-reader";
import type { ScheduleEntry } from "@/lib/school-schedule";
import { ScheduleDetailTitle } from "./schedule-detail";
import { ResourceLinks } from "./resource-links";
import "./annual-schedule-reader.css";

const weekdays = ["일","월","화","수","목","금","토"];
const monthName = (month:string) => `${Number(month.slice(5))}월`;
const shortDate = (date:string) => `${Number(date.slice(8))}일`;
const occurrenceDate = ({from,to}:AnnualOccurrence) => from === to ? shortDate(from) : `${Number(from.slice(8))}–${shortDate(to)}`;
const occurrenceKey = (item:AnnualOccurrence) => JSON.stringify([item.entry.id,item.entry.title,item.from,item.to,item.entry.time]);
export function AnnualScheduleReader({ model, year, date, today, onSelect, onMonthView, onOpen }: {
  model:AnnualScheduleModel; year:number; date:string; today:string;
  onSelect:(date:string)=>void; onMonthView:(date:string)=>void;
  onOpen:(entry:ScheduleEntry,trigger:HTMLElement)=>void;
}) {
  const [filter,setFilter] = useState<"all"|"milestones">("all");
  const selected = model.months.find(item=>date.startsWith(item.month)) ?? model.months[0];
  const partial = model.publishedDays !== model.dates.length;
  const count = (n:number, known:number, total:number) => !known ? "—" : `${n}일${known < total ? " · 일부" : ""}`;
  const items = selected.occurrences.filter(item=>filter==="all"||isAnnualMilestone(item));
  const kind = (item:AnnualOccurrence) => {
    if (item.entry.tone!=="break") return "event";
    return selected.dates.some(day=>day>=item.from&&day<=item.to&&model.academic.get(day)?.type==="vacation") ? "vacation" : "holiday";
  };
  function calendar(month:AnnualMonth) {
    const selectedMonth = month.month===selected.month;
    return <button type="button" className="annual-reader-month" key={month.month} data-selected={selectedMonth?"":undefined}
      aria-pressed={selectedMonth} aria-label={`${month.month} 월별 일정`}
      onClick={()=>onSelect(selectedMonth?date:month.dates[0])}>
      <span className="annual-reader-month-heading">
        <strong>{monthName(month.month)}</strong><span>{count(month.teachingDays,month.publishedDays,month.dates.length)}</span>
      </span>
      <span className="annual-reader-days" aria-hidden="true">
        {weekdays.map((label,i)=><span key={label} className="annual-reader-weekday" data-weekday={i}>{label}</span>)}
        {calendarDays(month.month).map((day,i)=>{
          if (!day.startsWith(month.month)) return <span key={day} aria-hidden="true"/>;
          const academic = model.academic.get(day);
          const schedule = model.schedule.get(day);
          const vacation = academic?.enabled && academic.type==="vacation";
          const holiday = academic?.enabled && (academic.type==="holiday"||academic.type==="discretionary");
          const event = schedule?.entries.some(item=>item.tone==="event");
          const hasBreak = schedule?.entries.some(item=>item.tone==="break");
          const label = [day, academic?.name || (academic ? dayTypes[academic.type] : "미공개"), ...new Set(schedule?.entries.map(item=>item.title)??[])].filter(Boolean).join(" · ");
          return <span key={day} className="annual-reader-day" data-weekday={i%7}
            data-vacation={vacation?"":undefined} data-holiday={holiday||hasBreak&&!vacation?"":undefined}
            data-event={event?"":undefined} data-unpublished={!schedule?.available?"":undefined}
            aria-current={day===today?"date":undefined} title={label}>
            <time dateTime={day}>{Number(day.slice(8))}</time>
          </span>;
        })}
      </span>
    </button>;
  }
  return <section className="annual-reader" aria-label="연간 학사일정">
    <div className="annual-reader-summary" aria-label="수업일수">
      {[["연간 수업일수",model.teachingDays],["1학기",model.semesters[0]],["2학기",model.semesters[1]]].map(([label,n])=><div key={label}><span>{label}</span><strong>{model.publishedDays?n:"—"}<small>{model.publishedDays?"일":""}</small></strong></div>)}
    </div>
    {partial && <p className="annual-reader-note">{model.publishedDays ? "공개된 날짜에 적용되는 학사력만 계산했습니다. 미공개 날짜는 합계에서 제외됩니다." : "공개된 학사일정이 없습니다."}</p>}
    <div className="annual-reader-layout">
      <div className="annual-reader-calendar-area">
        <div className="annual-reader-caption"><strong>{year}년 3월 – {year+1}년 2월</strong>
          <div className="annual-reader-legend"><span><i data-kind="event"/>학교 행사</span><span><i data-kind="holiday"/>공휴일·휴업일</span><span><i data-kind="vacation"/>방학</span>{partial&&<span><i data-kind="unpublished"/>미공개</span>}</div>
        </div>
        <div className="annual-reader-grid">{model.months.map(calendar)}</div>
      </div>
      <aside className="annual-reader-agenda no-print" aria-label="선택 월 학사일정">
        <div className="annual-reader-agenda-heading"><div><h3>{monthName(selected.month)} 학사일정</h3><span>월 수업일수 {count(selected.teachingDays,selected.publishedDays,selected.dates.length)}</span></div>
          <button type="button" className="annual-reader-month-link" onClick={()=>onMonthView(date)} aria-label="월간 일정 보기">월간 보기 <ArrowUpRight size={14}/></button></div>
        <div className="annual-reader-filter" role="group" aria-label="일정 범위">
          <button type="button" aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>전체 일정</button>
          <button type="button" aria-pressed={filter==="milestones"} onClick={()=>setFilter("milestones")} title="휴업·방학, 기간 행사, 학기 시작과 종료">주요 일정</button>
        </div>
        <div className="annual-reader-agenda-content" key={`${selected.month}:${filter}`}>
          {items.length ? <ul>{items.map(item=><li key={occurrenceKey(item)} data-kind={kind(item)}>
            <span className="annual-reader-occurrence-date">{occurrenceDate(item)}</span>
            <div><ScheduleDetailTitle entry={item.entry} onOpen={onOpen}/>{item.entry.time&&<small>{item.entry.time}</small>}<ResourceLinks value={item.entry.resources} compact/></div>
          </li>)}</ul> : <p className="annual-reader-note">{!selected.publishedDays?"공개된 일정이 없습니다.":"표시할 일정이 없습니다."}</p>}
        </div>
      </aside>
    </div>
    <div className="annual-reader-print"><h3>월별 학사일정</h3><div>{model.months.map(month=><section key={month.month}><h4>{monthName(month.month)} · 수업일수 {count(month.teachingDays,month.publishedDays,month.dates.length)}</h4>{month.occurrences.length?<ul>{month.occurrences.map(item=><li key={occurrenceKey(item)}><span>{occurrenceDate(item)}</span> {item.entry.title}</li>)}</ul>:<p>{month.publishedDays?"등록된 일정 없음":"미공개"}</p>}</section>)}</div></div>
  </section>;
}

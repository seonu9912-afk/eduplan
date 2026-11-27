"use client";
import { useSyncExternalStore } from "react";
import { dateLabel } from "@/lib/domain";
import { scheduleDepartmentColor } from "@/lib/department-badge";
import { scheduleListGroups } from "@/lib/schedule-list-view";
import type { ScheduleEntry } from "@/lib/school-schedule";
import { DepartmentBadge } from "./department-badge";
import { ScheduleDetailTitle } from "./schedule-detail";
import { ResourceLinks } from "./resource-links";
import "./schedule-list-view.css";

const changeEvent = "eduplan:schedule-list-view";
const fallback = new Map<string, boolean>();
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(changeEvent, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(changeEvent, notify); };
}
const initial = () => false;
export function useScheduleListView(workspaceId: string, userId: string, work: boolean) {
  const key = `eduplan:schedule-list:${workspaceId}:${userId}:${work ? "plans" : "calendar"}`;
  const isList = useSyncExternalStore(subscribe, () => {
    if (fallback.has(key)) return fallback.get(key)!;
    try { return localStorage.getItem(key) === "list"; } catch { return false; }
  }, initial);
  function setIsList(value: boolean) {
    try { localStorage.setItem(key, value ? "list" : "calendar"); fallback.delete(key); }
    catch { fallback.set(key, value); }
    window.dispatchEvent(new Event(changeEvent));
  }
  return { isList, setIsList };
}
const weekdays = ["일","월","화","수","목","금","토"];
const tones = { event: "학사일정", work: "업무계획", break: "휴업·방학" };
export function ScheduleListView({dates,days,today,selectedDate,available,onOpen}:{
  dates:string[]; days:ReadonlyMap<string,{entries:ScheduleEntry[]}>; today:string; selectedDate:string; available:boolean;
  onOpen:(entry:ScheduleEntry,trigger:HTMLElement)=>void;
}) {
  const groups = scheduleListGroups(dates,days);
  if (!available || !groups.length) return <p className="panel school-reader-empty">{available ? "선택한 기간에 등록된 일정이 없습니다." : "선택한 날짜에 적용되는 공개 계획이 없습니다."}</p>;
  return <div className="schedule-period-list" aria-label="날짜순 일정 목록">
    {groups.map(({date,rows}) => <section key={date} id={`agenda-${date}`} className="schedule-period-list-day" data-today={date===today?"":undefined} data-selected={date===selectedDate?"":undefined}>
      <h3><time dateTime={date}>{dateLabel(date)} {weekdays[new Date(date+"T00:00:00Z").getUTCDay()]}요일</time>{date===today && <small>오늘</small>}</h3>
      <ul>{rows.map(({entry,from,to},index) => <li key={`${entry.id}:${from}:${index}`} data-tone={entry.tone} data-department-color={scheduleDepartmentColor(entry.department,entry.tone)} data-past={to<today?"":undefined}>
        <div className="schedule-period-list-type">{entry.operationGroup ?? tones[entry.tone]}{entry.time && <small>{entry.time}</small>}</div>
        <div className="schedule-period-list-info">
          <div className="schedule-department-title">{entry.department && <DepartmentBadge department={entry.department}/>}<ScheduleDetailTitle entry={entry} onOpen={onOpen}/></div>
          {entry.date!==entry.end && <small>{dateLabel(entry.date)} ~ {dateLabel(entry.end)}{(from!==entry.date||to!==entry.end)&&" · 표시 기간 "+dateLabel(from)+(from!==to?" ~ "+dateLabel(to):"")}</small>}
          {(entry.location||entry.participants) && <small>{[entry.location,entry.participants].filter(Boolean).join(" · ")}</small>}
          <ResourceLinks value={entry.resources} compact/>
        </div>
      </li>)}</ul>
    </section>)}
  </div>;
}

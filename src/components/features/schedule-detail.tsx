"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Context } from "@/lib/models";
import { eventLessonImpacts } from "@/lib/event-lesson-impact";
import { CalendarDays, Clock3, Building2, MapPin, Users, GraduationCap, Link2 } from "lucide-react";
import { Modal } from "@/components/common";
import { Button } from "@/components/ui/button";
import type { ScheduleEntry } from "@/lib/school-schedule";
import { departmentBadgeInfo } from "@/lib/department-badge";
import { readableResources } from "@/lib/external-links";
import { ResourceLinks } from "./resource-links";
import "./department-badge.css";
import "./schedule-detail.css";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" });
function fullDate(date: string) { return dateFormat.format(new Date(date + "T00:00:00+09:00")); }
const tones = { event: "학사일정", work: "업무계획", break: "휴업·방학" };

export function useScheduleDetail() {
  const [entry, setEntry] = useState<ScheduleEntry | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  return {
    entry,
    show: (value: ScheduleEntry, element: HTMLElement) => { trigger.current = element; setEntry(value); },
    close: () => setEntry(null),
    restoreFocus: (event: Event) => { if (trigger.current?.isConnected) { event.preventDefault(); trigger.current.focus(); } },
  };
}

export function ScheduleDetailTitle({ entry, label, onOpen, children, className }: { entry: ScheduleEntry; label?: string; onOpen: (entry: ScheduleEntry, trigger: HTMLElement) => void; children?: React.ReactNode; className?: string }) {
  return <button type="button" className={["schedule-detail-trigger", className].filter(Boolean).join(" ")} aria-haspopup="dialog" aria-label={`${entry.title} 상세 보기`} onClick={(event) => onOpen(entry, event.currentTarget)}>{children ?? label ?? entry.title}</button>;
}

export function ScheduleDetailDialog({ entry, onClose, onCloseAutoFocus, onJump, context }: { entry: ScheduleEntry | null; onClose: () => void; onCloseAutoFocus: (event: Event) => void; onJump?: () => void; context?: Context }) {
  const impacts = useMemo(() => context && entry ? eventLessonImpacts(context, entry) : [], [context, entry]);
  const impactDates = [...new Set(impacts.map(row => row.lesson.date))];
  const category = entry ? entry.operationGroup ?? tones[entry.tone] : "";
  const department = entry?.department ? departmentBadgeInfo(entry.department) : null;
  const rows = entry ? [
    { icon: CalendarDays, label: "기간", value: entry.date === entry.end ? fullDate(entry.date) : `${fullDate(entry.date)} ~ ${fullDate(entry.end)}` },
    { icon: Clock3, label: "시간", value: entry.time },
    { icon: Building2, label: "담당 부서", value: entry.department },
    { icon: MapPin, label: "장소", value: entry.location },
    { icon: Users, label: "대상·참석자", value: entry.participants },
    { icon: GraduationCap, label: "대상 학년", value: entry.targetGrades?.length ? entry.targetGrades.join(", ") + "학년" : undefined },
  ].filter((row) => row.value) : [];
  return <Modal open={!!entry} onOpenChange={(open) => { if (!open) onClose(); }} onCloseAutoFocus={onCloseAutoFocus}
    title="일정 상세" description="등록된 일정 정보를 확인합니다.">
    {entry && <div className="schedule-detail-content">
      <div className="schedule-detail-category">{department && <span className="schedule-department-badge" data-color={department.color}>{department.name}</span>}<span>{category}</span></div>
      <h3>{entry.assignmentText ?? entry.title}</h3>
      <dl>{rows.map(({ icon: Icon, label, value }) => <div key={label}><dt><Icon size={16} aria-hidden="true" />{label}</dt><dd>{value}</dd></div>)}</dl>
      {!!readableResources(entry.resources).length && <section className="schedule-detail-resources"><h4><Link2 size={16} aria-hidden="true" />관련 자료</h4><ResourceLinks value={entry.resources} /></section>}
      {!!impacts.length && context && <section className="event-lesson-impact">
        <h4><GraduationCap size={16} aria-hidden="true" />나의 수업에 미치는 영향</h4>
        <p>공개 학사일정에 연결된 운영 교시와 확정 시간표 기준입니다.</p>
        {impactDates.map(date => <div key={date} className="event-lesson-impact-day">
          <header><strong>{fullDate(date)}</strong><Link href={`/app/${context.workspace.id}/timetable?year=${context.year?.year}&date=${date}`} onClick={onClose}>시간표 보기</Link></header>
          <ul>{impacts.filter(row => row.lesson.date === date).map(({lesson,status},index) => <li key={`${lesson.id}:${index}`} data-status={status}>
            <div><strong>{lesson.period}교시 · {lesson.classes} {lesson.subject}</strong><span className="event-lesson-impact-status">{status === "affected" ? "행사로 수업 미운영" : status === "normal" ? "정상 운영 예정" : "운영 확인 필요"}</span></div>
            {lesson.start && lesson.end && <small>{lesson.start} ~ {lesson.end}</small>}
            {!!lesson.blockedBy.length && <small>{lesson.blockedBy.join(" · ")}</small>}
          </li>)}</ul>
        </div>)}
      </section>}
      <div className="schedule-detail-footer">{onJump && <Button type="button" onClick={onJump}><CalendarDays size={16} />달력에서 보기</Button>}<Button type="button" variant="outline" onClick={onClose}>닫기</Button></div>
    </div>}
  </Modal>;
}

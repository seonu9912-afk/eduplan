"use client";
import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, InlineNotice } from "@/components/common";
import { markOperationRead } from "@/app/operations-actions";
import type { Context } from "@/lib/models";
import {submissionAlertLabels,submissionScopeLabel} from "@/lib/teaching-submissions";
import { PublishedChanges, type PublishedChangesState } from "./published-changes";
import "./school-operations.css";
export function NotificationCenter({ context: c, onNavigate, changes }: { context: Context; onNavigate?: () => boolean; changes?: PublishedChangesState }) {
  const m = useMutation();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const items = (c.operations?.notifications ?? []).filter((n) => !n.read_at && !confirmed.includes(n.id));
  const reminders=c.teachingDeadlines?.alerts??[];
  return (
    <section className="notification-center">
      <h1 className="sr-only">내 알림</h1>
      <ul className="notification-list">
        {reminders.map(n=><li className="notification-card" key={`teaching:${n.course_id}:${n.scope}`}>
          <div className="notification-content"><div className="notification-heading"><h2>{submissionAlertLabels[n.kind]}</h2>{n.due_date&&<time dateTime={n.due_date}>{n.due_date}</time>}</div>
          <p>{n.grade}학년 {n.subject_name} · {submissionScopeLabel(n.scope)}</p>{n.note&&<p>{n.note}</p>}</div>
          <div className="notification-actions"><Button asChild variant="ghost"><Link href={`/app/${c.workspace.id}/teaching?year=${c.year?.year}`} onClick={event=>{if(onNavigate&&!onNavigate())event.preventDefault();}}>수업·평가 열기</Link></Button></div>
        </li>)}
        {items.map((n) => (
          <li className="notification-card" key={n.id}>
            <div className="notification-content">
              <div className="notification-heading">
                <h2>{n.title}</h2>
                <time dateTime={n.created_at}>
                  {new Date(n.created_at).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p>{n.body}</p>
            </div>
            <div className="notification-actions">
              <Button asChild variant="ghost">
                <Link
                  href={n.task_id ? `/app/${c.workspace.id}/home?year=${c.year?.year}&task=${n.task_id}#my-tasks`
                    : `/app/${c.workspace.id}/${n.request_id ? "calendar" : "timetable"}?year=${c.year?.year}`}
                  onClick={(event) => { if (onNavigate && !onNavigate()) event.preventDefault(); }}
                >
                  {n.task_id ? "할 일 열기" : n.request_id ? "학사일정 열기" : "시간표 열기"}
                </Link>
              </Button>
              <Button variant="ghost" disabled={m.pending} onClick={() => m.execute(
                () => markOperationRead({ workspaceId: c.workspace.id, id: n.id }),
                () => setConfirmed((old) => [...old, n.id]),
                "",
              )}>확인<span className="sr-only"> · {n.title}</span></Button>
            </div>
          </li>
        ))}
      </ul>
      {changes && <PublishedChanges context={c} state={changes} onNavigate={onNavigate} />}
      {!items.length && !reminders.length && !changes?.items.length && <p className="notification-empty" role="status">
        <Bell size={18} aria-hidden="true" /> 확인할 새 알림이 없습니다.
      </p>}
      <InlineNotice mutation={m} />
    </section>
  );
}

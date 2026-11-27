"use client";
import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, InlineNotice } from "@/components/common";
import { markOperationRead } from "@/app/operations-actions";
import type { Context } from "@/lib/models";
import "./school-operations.css";
export function NotificationCenter({ context: c }: { context: Context }) {
  const m = useMutation();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const items = (c.operations?.notifications ?? []).filter((n) => !n.read_at && !confirmed.includes(n.id));
  return (
    <section className="notification-center">
      <header className="page-heading">
        <h1>내 알림</h1>
      </header>
      <div className="mobile-card-list">
        {items.map((n) => (
          <article className="mobile-edit-card notification-card" key={n.id}>
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
            <div className="heading-actions">
              <Button asChild variant="outline">
                <Link
                  href={`/app/${c.workspace.id}/${n.request_id ? "calendar" : "timetable"}?year=${c.year?.year}`}
                >
                  {n.request_id ? "학사일정 열기" : "시간표 열기"}
                </Link>
              </Button>
              <Button variant="secondary" disabled={m.pending} onClick={() => m.execute(
                () => markOperationRead({ workspaceId: c.workspace.id, id: n.id }),
                () => setConfirmed((old) => [...old, n.id]),
                "",
              )}>확인<span className="sr-only"> · {n.title}</span></Button>
            </div>
          </article>
        ))}
        {!items.length && <p className="operations-empty notification-empty" role="status">
          <Bell size={18} aria-hidden="true" /> 확인할 새 알림이 없습니다.
        </p>}
      </div>
      <InlineNotice mutation={m} />
    </section>
  );
}

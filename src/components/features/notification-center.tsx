"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMutation, InlineNotice } from "@/components/common";
import { markOperationRead } from "@/app/operations-actions";
import type { Context } from "@/lib/models";
export function NotificationCenter({ context: c }: { context: Context }) {
  const m = useMutation(),
    items = c.operations?.notifications ?? [];
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
              {!n.read_at && (
                <Button
                  variant="ghost"
                  disabled={m.pending}
                  onClick={() =>
                    m.execute(
                      () =>
                        markOperationRead({
                          workspaceId: c.workspace.id,
                          id: n.id,
                        }),
                      m.refresh,
                    )
                  }
                >
                  읽음으로 표시
                </Button>
              )}
            </div>
          </article>
        ))}
        {!items.length && <p className="panel notification-card">받은 알림이 없습니다.</p>}
      </div>
      <InlineNotice mutation={m} />
    </section>
  );
}

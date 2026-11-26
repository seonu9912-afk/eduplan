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
    <section className="panel">
      <h1>내 알림</h1>
      <p>
        현재 학교·학년도의 최근 알림입니다. 원본 계획에서 현재 적용 내용을
        확인하세요.
      </p>
      <div className="mobile-card-list">
        {items.map((n) => (
          <article className="mobile-edit-card" key={n.id}>
            <h2>
              {!n.read_at && "● "}
              {n.title}
            </h2>
            <p>{n.body}</p>
            <Link
              href={`/app/${c.workspace.id}/${n.request_id ? "calendar" : "timetable"}?year=${c.year?.year}`}
            >
              현재 원본 계획 열기
            </Link>
            <time dateTime={n.created_at}>
              {new Date(n.created_at).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}
            </time>
            {!n.read_at && (
              <Button
                variant="outline"
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
          </article>
        ))}
        {!items.length && <p>등록된 알림이 없습니다.</p>}
      </div>
      <InlineNotice mutation={m} />
    </section>
  );
}

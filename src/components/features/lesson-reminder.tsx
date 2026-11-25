"use client";
import { useEffect, useState } from "react";
import { currentLessonNotice } from "@/app/operations-actions";
import type { Context } from "@/lib/models";
/** The official sources are re-read even while another module has unsaved edits. */
export function LessonReminder({ context: c }: { context: Context }) {
  const [message, setMessage] = useState("");
  const workspaceId = c.workspace.id,
    userId = c.userId,
    year = c.year?.year;
  useEffect(() => {
    if (!year) return;
    let disposed = false,
      busy = false,
      shown: Notification | null = null;
    const tick = async () => {
      if (busy || disposed) return;
      busy = true;
      try {
        let lead = 5;
        try {
          const n = Number(
            localStorage.getItem(`eduplan-reminder:${workspaceId}:${userId}`) ??
              5,
          );
          if ([0, 1, 3, 5, 10, 15].includes(n)) lead = n;
        } catch {}
        const result = await currentLessonNotice({ workspaceId, year, lead });
        if (disposed) return;
        shown?.close();
        shown = null;
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        setMessage(result.data?.title ?? "");
        if (
          !result.data ||
          !("Notification" in window) ||
          Notification.permission !== "granted"
        )
          return;
        const key = `eduplan-notified:${workspaceId}:${userId}`;
        try {
          if (localStorage.getItem(`eduplan-server-push:${workspaceId}:${userId}`)==="true" || localStorage.getItem(key) === result.data.signature) return;
          shown = new Notification("다음 수업 안내", {
            body: result.data.title,
            tag: `eduplan:${workspaceId}:${userId}`,
          });
          localStorage.setItem(key, result.data.signature);
        } catch {}
      } catch {
        if (!disposed)
          setMessage(
            "최신 수업 운영 정보를 확인하지 못해 수업 알림을 보류했습니다.",
          );
      } finally {
        busy = false;
      }
    };
    const initial = window.setTimeout(() => void tick(), 0),
      timer = window.setInterval(() => void tick(), 30000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("eduplan-reminder-settings", tick);
    return () => {
      disposed = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      shown?.close();
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("eduplan-reminder-settings", tick);
    };
  }, [workspaceId, userId, year]);
  return message ? (
    <aside className="info-box no-print" role="status">
      {message}
    </aside>
  ) : null;
}

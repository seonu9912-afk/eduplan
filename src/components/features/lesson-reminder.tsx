"use client";
import { useEffect, useMemo, useState } from "react";
import {
  createLessonResolver,
  currentAndNext,
  myTeacherIds,
  publishedTimetable,
  seoulClock,
} from "@/lib/school-operations";
import type { Context } from "@/lib/models";
/** Mounted above navigation so reminders continue while editing another module. */
export function LessonReminder({ context: c }: { context: Context }) {
  const [message, setMessage] = useState("");
  const resolver = useMemo(() => {
    const doc = publishedTimetable(c);
    return doc ? createLessonResolver(c, doc) : null;
  }, [c]);
  const ids = useMemo(() => myTeacherIds(c), [c]);
  useEffect(() => {
    let shown: Notification | null = null;
    const tick = () => {
      if (!resolver) {
        setMessage("");
        return;
      }
      const clock = seoulClock(new Date());
      let lead = 5;
      try {
        const saved = Number(
          localStorage.getItem(
            `eduplan-reminder:${c.workspace.id}:${c.userId}`,
          ) ?? 5,
        );
        if ([0, 1, 3, 5, 10, 15].includes(saved)) lead = saved;
      } catch {}
      const { next, remaining } = currentAndNext(
        resolver(clock.date).filter((x) => ids.has(x.teacherId)),
        clock.minutes,
      );
      if (!lead || !next || remaining === null || remaining > lead) {
        setMessage("");
        shown?.close();
        shown = null;
        return;
      }
      const title = `${remaining}분 후 ${next.subject} · ${next.classes} · ${next.period}교시`;
      setMessage(title);
      if (!("Notification" in window) || Notification.permission !== "granted")
        return;
      const key = `eduplan-notified:${c.workspace.id}:${c.userId}`,
        value = `${c.operations?.publication?.id}:${next.date}:${next.id}:${next.start}`;
      try {
        if (localStorage.getItem(key) === value) return;
        localStorage.setItem(key, value);
        shown = new Notification("다음 수업 안내", {
          body: title,
          tag: `eduplan:${c.workspace.id}:${c.userId}`,
        });
      } catch {}
    };
    const initial = window.setTimeout(tick, 0),
      timer = window.setInterval(tick, 10000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("eduplan-reminder-settings", tick);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("eduplan-reminder-settings", tick);
      shown?.close();
    };
  }, [c, resolver, ids]);
  return message ? (
    <aside className="info-box no-print" role="status">
      {message}
    </aside>
  ) : null;
}

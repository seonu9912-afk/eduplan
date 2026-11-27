"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const options = [0, 1, 3, 5, 10, 15];

export function LessonReminderSettings({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const [lead, setLead] = useState(5);
  const [permission, setPermission] = useState("내부 안내 사용");
  const [error, setError] = useState("");
  const prefKey = `eduplan-reminder:${workspaceId}:${userId}`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = Number(localStorage.getItem(prefKey) ?? 5);
        if (options.includes(saved)) setLead(saved);
      } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, [prefKey]);

  return <div className="lesson-reminder-settings">
    <label>
      <span>수업 전 안내 시간</span>
      <select value={lead} onChange={(event) => {
        const value = Number(event.target.value);
        setLead(value);
        try {
          localStorage.setItem(prefKey, String(value));
          window.dispatchEvent(new Event("eduplan-reminder-settings"));
          setError("");
        } catch {
          setError("이 브라우저에 알림 설정을 저장할 수 없습니다.");
        }
      }}>
        {options.map((value) => <option key={value} value={value}>{value ? `${value}분 전` : "끄기"}</option>)}
      </select>
    </label>
    <div className="lesson-reminder-browser">
      <div>
        <strong>브라우저 알림</strong>
        <p className="muted-small">{permission} · 화면을 열어 둔 동안 알림을 받습니다.</p>
      </div>
      <Button variant="outline" onClick={async () => {
        if (!("Notification" in window)) {
          setPermission("브라우저 알림 미지원 · 내부 안내 사용");
          return;
        }
        try {
          const result = await Notification.requestPermission();
          setPermission(result === "granted" ? "브라우저 알림 허용됨" : "내부 안내 사용");
        } catch {
          setPermission("내부 안내 사용");
        }
      }}>브라우저 알림 사용</Button>
    </div>
    {error && <p role="alert" className="operations-warning">{error}</p>}
  </div>;
}

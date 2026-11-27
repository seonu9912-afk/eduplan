"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { seoulToday } from "@/lib/domain";
import { shouldRefreshHome } from "@/lib/home-refresh";

export function useHomeRefresh(serverDate: string, enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    let lastRequest = Date.now();
    let requestedForDateChange = false;
    function check(resumed = false) {
      const now = Date.now();
      const dateChanged = seoulToday(new Date(now)) !== serverDate;
      if (!dateChanged) requestedForDateChange = false;
      if (!shouldRefreshHome({
        elapsed: Math.max(0, now - lastRequest), dateChanged, resumed,
        visible: document.visibilityState === "visible", online: navigator.onLine,
        requestedForDateChange,
      })) return;
      lastRequest = now;
      requestedForDateChange = dateChanged;
      // Refresh server components, not the entire browser page. API keys remain on the server.
      router.refresh();
    }
    const resume = () => check(true);
    const first = window.setTimeout(() => check(), 0);
    const timer = window.setInterval(() => check(), 10_000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
    };
  }, [enabled, router, serverDate]);
}

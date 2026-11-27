"use client";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const changed = "eduplan:weekend-visibility";
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(changed, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(changed, notify); };
}
const serverSnapshot = () => true;
const fallback = new Map<string, boolean>();

export function useWeekendVisibility(workspaceId: string, userId: string) {
  const key = `eduplan:weekends:${workspaceId}:${userId}`;
  const showWeekends = useSyncExternalStore(subscribe, () => {
    if (fallback.has(key)) return fallback.get(key)!;
    try { return localStorage.getItem(key) !== "hidden"; } catch { return true; }
  }, serverSnapshot);
  function setShowWeekends(value: boolean) {
    try { localStorage.setItem(key, value ? "shown" : "hidden"); fallback.delete(key); }
    catch { fallback.set(key, value); }
    window.dispatchEvent(new Event(changed));
  }
  return { showWeekends, setShowWeekends };
}

export function WeekendToggle({ showWeekends, setShowWeekends }: ReturnType<typeof useWeekendVisibility>) {
  return <Button type="button" variant="outline" size="sm" className="no-print" aria-label="주말 표시" aria-pressed={showWeekends}
    onClick={() => setShowWeekends(!showWeekends)}>{showWeekends ? "주말 숨기기" : "주말 표시"}</Button>;
}

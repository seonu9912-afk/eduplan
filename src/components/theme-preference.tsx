"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type ThemePreference = "system" | "light" | "dark";
const key = "eduplan-theme";
const eventName = "eduplan-theme-change";
let fallback: ThemePreference = "system";
function preference(): ThemePreference {
  try { const value = localStorage.getItem(key); return value === "light" || value === "dark" || value === "system" ? value : "system"; } catch { return fallback; }
}
function applyTheme() {
  const value = preference();
  const dark = value === "dark" || (value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111820" : "#ffffff");
}
function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener("storage", callback); };
}
function change(value: ThemePreference) {
  fallback = value;
  try { localStorage.setItem(key, value); } catch { /* preference remains available for this session */ }
  applyTheme();
  window.dispatchEvent(new Event(eventName));
}
export function ThemeRuntime() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme();
    media.addEventListener("change", applyTheme);
    const unsubscribe = subscribe(applyTheme);
    return () => { media.removeEventListener("change", applyTheme); unsubscribe(); };
  }, []);
  return null;
}
export function ThemePreferenceControl({ compact = false }: { compact?: boolean } = {}) {
  const current = useSyncExternalStore(subscribe, preference, () => "system" as ThemePreference);
  const options = [{value:"light", label:"밝게", Icon:Sun},{value:"dark", label:"어둡게", Icon:Moon},{value:"system", label:"시스템", Icon:Monitor}] as const;
  return <section className={`theme-preference${compact ? " theme-preference-compact" : ""}`} aria-label="화면 테마"><h3>화면 테마</h3><div className="theme-preference-options" role="group" aria-label="화면 테마 선택">
  {options.map(({value,label,Icon})=><button key={value} type="button" aria-pressed={current===value} onClick={()=>change(value)}><Icon size={18} aria-hidden="true"/><span className={compact ? "sr-only" : undefined}>{label}</span></button>)}</div>{!compact && <p>시스템은 기기의 화면 설정을 따릅니다. 설정은 이 브라우저에 저장됩니다.</p>}</section>;
}

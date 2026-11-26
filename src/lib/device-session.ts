"use client";
import { useEffect, useSyncExternalStore } from "react";
const edits = new Map<string, boolean>(),
  listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
export function setDeviceDirty(key: string, dirty: boolean) {
  if (dirty) edits.set(key, true);
  else edits.delete(key);
  emit();
}
export function useDeviceDirty() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => edits.size > 0,
    () => false,
  );
}
export function useEditGuard(key: string, dirty: boolean) {
  useEffect(() => {
    setDeviceDirty(key, dirty);
    return () => setDeviceDirty(key, false);
  }, [key, dirty]);
}
export function deviceId() {
  try {
    let id = localStorage.getItem("eduplan-device-v1");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("eduplan-device-v1", id);
    }
    return id;
  } catch {
    return null;
  }
}
export async function clearDeviceData() {
  const { clearDrafts } = await import("./draft-storage");
  let cleanupError = false;
  try {
    await clearDrafts();
  } catch {
    cleanupError = true;
  }
  try {
    for (const key of Object.keys(localStorage))
      if (
        key.startsWith("eduplan-reminder:") ||
        key.startsWith("eduplan-notified:") ||
        key.startsWith("eduplan-server-push:")
      )
        localStorage.removeItem(key);
  } catch {}
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await (await registration?.pushManager?.getSubscription())?.unsubscribe();
    (await registration?.getNotifications?.())?.forEach((n) => n.close());
    registration?.active?.postMessage({ type: "CLEAR_USER_DATA" });
  } catch {
    cleanupError = true;
  }
  edits.clear();
  emit();
  if (cleanupError)
    throw Error(
      "로그아웃했지만 기기 초안을 지우지 못했습니다. 공용 기기에서는 브라우저의 사이트 데이터를 정리하세요.",
    );
}

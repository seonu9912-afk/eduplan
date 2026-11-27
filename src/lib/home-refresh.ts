/** Refresh the authenticated home route, preserving Next.js client state and server caches. */
export const homeRefreshInterval = 15 * 60_000;
export const homeResumeInterval = 5 * 60_000;
export const homeDateRetryInterval = 60_000;

export function shouldRefreshHome({ elapsed, dateChanged, resumed, visible, online, requestedForDateChange }: {
  elapsed: number; dateChanged: boolean; resumed: boolean; visible: boolean; online: boolean; requestedForDateChange: boolean;
}) {
  if (!visible || !online) return false;
  if (dateChanged) return !requestedForDateChange || elapsed >= homeDateRetryInterval;
  return elapsed >= (resumed ? homeResumeInterval : homeRefreshInterval);
}

import { expect, it } from "vitest";
import { shouldRefreshHome, homeRefreshInterval, homeResumeInterval, homeDateRetryInterval } from "../../src/lib/home-refresh";
import { seoulToday } from "../../src/lib/domain";

const base = { elapsed: 0, dateChanged: false, resumed: false, visible: true, online: true, requestedForDateChange: false };
it("refreshes periodically and on return after the shorter freshness interval", () => {
  expect(shouldRefreshHome({ ...base, elapsed: homeRefreshInterval - 1 })).toBe(false);
  expect(shouldRefreshHome({ ...base, elapsed: homeRefreshInterval })).toBe(true);
  expect(shouldRefreshHome({ ...base, resumed: true, elapsed: homeResumeInterval })).toBe(true);
  expect(shouldRefreshHome({ ...base, resumed: true, elapsed: homeResumeInterval - 1 })).toBe(false);
});
it("refreshes immediately at Korean midnight and throttles retries until the server date updates", () => {
  expect(seoulToday(new Date("2026-11-27T14:59:59Z"))).toBe("2026-11-27");
  expect(seoulToday(new Date("2026-11-27T15:00:00Z"))).toBe("2026-11-28");
  expect(shouldRefreshHome({ ...base, dateChanged: true })).toBe(true);
  expect(shouldRefreshHome({ ...base, dateChanged: true, requestedForDateChange: true, elapsed: homeDateRetryInterval - 1 })).toBe(false);
  expect(shouldRefreshHome({ ...base, dateChanged: true, requestedForDateChange: true, elapsed: homeDateRetryInterval })).toBe(true);
});
it("does not refresh hidden tabs or offline clients", () => {
  expect(shouldRefreshHome({ ...base, dateChanged: true, visible: false })).toBe(false);
  expect(shouldRefreshHome({ ...base, dateChanged: true, online: false })).toBe(false);
});

import { annualSchema } from "./academic";
import { operationName, operationNames } from "./work-operation-items";
import type { Context } from "./models";
import { unifiedSchedule } from "./school-operations";
import { publicationAt, publishedSchoolContext } from "./school-publications";

export type ScheduleEntry = {
  id: string;
  date: string;
  end: string;
  title: string;
  tone: "event" | "work" | "break";
  time?: string;
  department?: string;
  location?: string;
  resources?: unknown;
  operationGroup?: string;
  assignmentText?: string;
  participants?: string;
  targetGrades?: number[];
};

export function schoolScheduleEntries(official: Context, start: string, end: string, work: boolean): ScheduleEntry[] {
  const plan = annualSchema.safeParse(official.annual?.document);
  const business = new Map(plan.success ? plan.data.business.map((row) => [row.id, row] as const) : []);
  const items = unifiedSchedule(official, start, end)
    .filter((item) => work || item.source !== "business")
    .map(({ id, date, end, title, source, time, department, location, resources, grades }): ScheduleEntry => {
      const row = source === "business" ? business.get(id) : undefined;
      const group = row ? operationName(row) ?? (row.kind === "출장" ? "출장" : undefined) : undefined;
      return { id, date, end, title, tone: source === "business" ? "work" : "event", time, department, location, resources,
        ...(group && row ? { operationGroup: group, assignmentText: row.text } : {}),
        ...(row?.participants ? { participants: row.participants } : {}),
        ...(grades.length ? { targetGrades: grades } : {}) };
    });
  if (!official.hasOfficialCalendar || !plan.success) return items;
  const breaks = plan.data.vacations.map((v): ScheduleEntry => ({
    id: v.start + v.name, date: v.start, end: v.end, title: v.name, tone: "break",
  }));
  const terms = official.semesters.flatMap((s): ScheduleEntry[] => [
    { id: s.start_date + s.number, date: s.start_date, end: s.start_date, title: `${s.number}학기 시작`, tone: "event" },
    { id: s.end_date + s.number, date: s.end_date, end: s.end_date, title: `${s.number}학기 종료`, tone: "event" },
  ]);
  const holidays = Object.entries(plan.data.holidays).map(([date, title]): ScheduleEntry => ({
    id: date, date, end: date, title, tone: "break",
  }));
  const adjustments = Object.entries(plan.data.days).flatMap(([date, rule]): ScheduleEntry[] => {
    if (rule.type !== "discretionary" && rule.type !== "swap") return [];
    const swap = rule.type === "swap";
    return [{ id: date + rule.type, date, end: date, title: rule.name || (swap ? "대체 요일 운영" : "재량휴업일"),
      tone: swap ? "event" : "break" }];
  });
  return [...items, ...breaks, ...terms, ...holidays, ...adjustments]
    .filter((item) => item.date <= end && item.end >= start)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}

export function publishedScheduleDays(c: Context, dates: string[], work: boolean) {
  const publications = c.schoolPublications ?? [];
  const start = dates[0];
  const end = dates.at(-1) ?? start;
  const cache = new Map<string, { entries: ScheduleEntry[]; operationGroups: string[] }>();
  return new Map(dates.map((date) => {
    const calendar = publicationAt(publications, "calendar", date);
    const plan = work ? publicationAt(publications, "plans", date) : undefined;
    const available = Boolean(calendar || plan);
    // One calendar view can span several published versions of the same plan.
    const key = `${calendar?.id ?? ""}:${plan?.id ?? ""}`;
    let cached = cache.get(key);
    if (!cached) {
      const official = available ? publishedSchoolContext(c, date) : null;
      const parsed = annualSchema.safeParse(official?.annual?.document);
      cached = {
        entries: official ? schoolScheduleEntries(official, start, end, work) : [],
        operationGroups: plan && parsed.success ? [...operationNames(parsed.data), "출장"] : [],
      };
      cache.set(key, cached);
    }
    return [date, { available, entries: cached.entries.filter((item) => item.date <= date && item.end >= date),
      ...(work ? { operationGroups: cached.operationGroups } : {}) }];
  }));
}

/** Place contiguous occurrences of the same published entry on one weekly lane. */
export type CalendarSpan = { entry: ScheduleEntry; start: number; end: number };

export function calendarWeekLanes(
  dates: string[],
  days: ReadonlyMap<string, { entries: ScheduleEntry[] }>,
): CalendarSpan[][] {
  const spans: CalendarSpan[] = [];
  const latest = new Map<string, CalendarSpan>();
  dates.forEach((day, column) => {
    for (const entry of days.get(day)?.entries ?? []) {
      // Include the visible metadata so publication changes are never hidden.
      const key = JSON.stringify([entry.id, entry.tone, entry.date, entry.end,
        entry.title, entry.time, entry.department, entry.location, entry.resources, entry.operationGroup, entry.assignmentText, entry.participants, entry.targetGrades]);
      const previous = latest.get(key);
      if (previous?.end === column) continue;
      if (previous?.end === column - 1) {
        previous.end = column;
      } else {
        const span = { entry, start: column, end: column };
        spans.push(span);
        latest.set(key, span);
      }
    }
  });
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const lanes: CalendarSpan[][] = [];
  for (const span of spans) {
    const lane = lanes.find((items) => items[items.length - 1].end < span.start);
    if (lane) lane.push(span);
    else lanes.push([span]);
  }
  return lanes;
}

/** Keep named operation rows aligned across the week, even when releases change. */
export function weeklyOperationGroups(dates: string[], days: ReadonlyMap<string, { entries: ScheduleEntry[]; operationGroups?: string[] }>) {
  const names = new Set<string>();
  for (const date of dates) {
    const day = days.get(date);
    for (const name of day?.operationGroups ?? []) names.add(name);
    for (const entry of day?.entries ?? []) if (entry.operationGroup) names.add(entry.operationGroup);
  }
  const trip = names.delete("출장");
  return [...names, ...(trip ? ["출장"] : [])];
}

/** Compact mobile preview: prioritize continuous bars, never truncate a span to fit a lane. */
export function compactCalendarWeek(dates: string[], days: ReadonlyMap<string, { entries: ScheduleEntry[] }>, maxRows = 2) {
  const spans = calendarWeekLanes(dates, days).flat().sort((a,b) => (b.end-b.start)-(a.end-a.start) || a.start-b.start);
  const lanes: CalendarSpan[][] = Array.from({length: maxRows}, () => []);
  const hidden = dates.map(() => 0);
  const overflowLanes: CalendarSpan[][] = [];
  for (const span of spans) {
    const lane = lanes.find(row => row.every(item => item.end < span.start || item.start > span.end));
    if (lane) lane.push(span);
    else {
      const overflowLane = overflowLanes.find(row => row.every(item => item.end < span.start || item.start > span.end));
      if (overflowLane) overflowLane.push(span); else overflowLanes.push([span]);
      for (let col=span.start; col<=span.end; col++) hidden[col]++;
    }
  }
  return { lanes, hidden, overflowLanes };
}

/** Keep readable event rows even on short screens; larger viewports show more. */
export function monthlyCalendarLaneCount(viewportHeight: number, top: number, weeks: number): number {
  const available = Math.max(0, viewportHeight - Math.max(0, top) - 24 - 32);
  const perWeek = available / Math.max(1, weeks);
  return Math.max(4, Math.min(6, Math.floor((perWeek - 64) / 26)));
}

/** Weekly readers show every single-day entry and keep multi-day events in separate lanes. */
export function weeklyCalendarSections(dates: string[], days: ReadonlyMap<string, { entries: ScheduleEntry[] }>) {
  const general = new Map(dates.map(date => [date, { entries: (days.get(date)?.entries ?? []).filter(entry => !entry.operationGroup) }]));
  const periods = new Map(dates.map(date => [date, { entries: general.get(date)!.entries.filter(entry => entry.date !== entry.end) }]));
  const daily = new Map(dates.map(date => [date, general.get(date)!.entries.filter(entry => entry.date === entry.end)]));
  return { periodLanes: calendarWeekLanes(dates, periods), daily };
}

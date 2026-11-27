import { annualSchema } from "./academic";
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
};

export function schoolScheduleEntries(official: Context, start: string, end: string, work: boolean): ScheduleEntry[] {
  const items = unifiedSchedule(official, start, end)
    .filter((item) => work || item.source !== "business")
    .map(({ id, date, end, title, source, time, department, location, resources }): ScheduleEntry => ({
      id, date, end, title, tone: source === "business" ? "work" : "event", time, department, location, resources,
    }));
  const plan = annualSchema.safeParse(official.annual?.document);
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
  const cache = new Map<string, ScheduleEntry[]>();
  return new Map(dates.map((date) => {
    const calendar = publicationAt(publications, "calendar", date);
    const plan = work ? publicationAt(publications, "plans", date) : undefined;
    const available = Boolean(calendar || plan);
    // One calendar view can span several published versions of the same plan.
    const key = `${calendar?.id ?? ""}:${plan?.id ?? ""}`;
    let entries = cache.get(key);
    if (!entries) {
      entries = available ? schoolScheduleEntries(publishedSchoolContext(c, date), start, end, work) : [];
      cache.set(key, entries);
    }
    return [date, { available, entries: entries.filter((item) => item.date <= date && item.end >= date) }];
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
        entry.title, entry.time, entry.department, entry.location, entry.resources]);
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

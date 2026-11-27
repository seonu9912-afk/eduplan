import { addDays } from "./domain";
import type { Context } from "./models";
import { publishedScheduleDays, type ScheduleEntry } from "./school-schedule";

export type ScheduleSearchResult = { entry: ScheduleEntry; from: string; to: string };

/** Search the same effective publications as the calendar, not drafts or superseded records. */
export function buildScheduleSearchIndex(context: Context, start: string, end: string): ScheduleSearchResult[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  const days = publishedScheduleDays(context, dates, true);
  const results: ScheduleSearchResult[] = [];
  const latest = new Map<string, ScheduleSearchResult>();
  for (const date of dates) {
    for (const entry of days.get(date)?.entries ?? []) {
      const key = JSON.stringify([entry.id, entry.date, entry.end, entry.title, entry.tone, entry.department, entry.time,
        entry.location, entry.resources, entry.operationGroup, entry.assignmentText, entry.participants, entry.targetGrades]);
      const previous = latest.get(key);
      if (previous?.to === date) continue;
      if (previous && addDays(previous.to, 1) === date) previous.to = date;
      else {
        const result = { entry, from: date, to: date };
        results.push(result);
        latest.set(key, result);
      }
    }
  }
  return results.sort((a, b) => a.from.localeCompare(b.from) || a.entry.title.localeCompare(b.entry.title, "ko"));
}

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/g, "");
export function searchSchedule(index: ScheduleSearchResult[], query: string) {
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (!terms.length) return [];
  return index.filter(({ entry }) => {
    const value = normalize([entry.title, entry.department, entry.location, entry.assignmentText, entry.participants, entry.operationGroup].filter(Boolean).join(" "));
    return terms.every((term) => value.includes(term));
  });
}

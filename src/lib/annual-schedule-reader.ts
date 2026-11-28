import { academicDays, annualSchema, isTeachingDay, type AcademicDay } from "./academic";
import { addDays, monthRange, moveMonth } from "./domain";
import type { Context } from "./models";
import { publicationAt, publishedSchoolContext } from "./school-publications";
import { calendarWeekLanes, publishedScheduleDays, type ScheduleEntry } from "./school-schedule";

export type AnnualOccurrence = { entry: ScheduleEntry; from: string; to: string };
export type AnnualMonth = {
  month: string; dates: string[]; publishedDays: number; teachingDays: number;
  occurrences: AnnualOccurrence[];
};
export function buildAnnualSchedule(context: Context, year: number) {
  const start = `${year}-03-01`, end = addDays(`${year + 1}-03-01`, -1);
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  const schedule = publishedScheduleDays(context, dates, false);
  const publications = context.schoolPublications ?? [];
  const byRelease = new Map<string, Map<string, AcademicDay>>();
  const academic = new Map<string, AcademicDay>();
  for (const date of dates) {
    const release = publicationAt(publications, "calendar", date);
    if (!release) continue;
    let days = byRelease.get(release.id);
    if (!days) {
      const official = publishedSchoolContext(context, date);
      const parsed = annualSchema.safeParse(official.annual?.document);
      days = new Map(parsed.success ? academicDays(year, parsed.data, official.semesters ?? []).map(day => [day.date, day]) : []);
      byRelease.set(release.id, days);
    }
    const day = days.get(date);
    if (day) academic.set(date, day);
  }
  const teaching = [...academic.values()].filter(isTeachingDay);
  const months: AnnualMonth[] = Array.from({length:12}, (_, i) => {
    const month = moveMonth(start.slice(0,7), i);
    const range = monthRange(month);
    const monthDates = dates.filter(day => day >= range.start && day <= range.end);
    const occurrences = calendarWeekLanes(monthDates, schedule).flat().map(({entry,start,end}) => ({
      entry, from: monthDates[start], to: monthDates[end],
    })).sort((a,b) => a.from.localeCompare(b.from) || (a.entry.time ?? "").localeCompare(b.entry.time ?? "") || a.entry.title.localeCompare(b.entry.title, "ko"));
    return { month, dates:monthDates, publishedDays:monthDates.filter(day=>schedule.get(day)?.available).length,
      teachingDays:teaching.filter(day=>day.date.startsWith(month)).length, occurrences };
  });
  return { dates, months, schedule, academic, publishedDays:dates.filter(day=>schedule.get(day)?.available).length,
    teachingDays:teaching.length, semesters:[1,2].map(n=>teaching.filter(day=>day.semester===n).length) };
}
export type AnnualScheduleModel = ReturnType<typeof buildAnnualSchedule>;
// No inferred importance ranking: this preset includes objective school-wide period/closure/term markers.
export function isAnnualMilestone(item: AnnualOccurrence) {
  return item.entry.tone === "break" || item.entry.date !== item.entry.end || /^[12]학기 (시작|종료)$/.test(item.entry.title);
}

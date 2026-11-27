import { addDays } from "./domain";
import type { Context } from "./models";
import { publicationAt } from "./school-publications";
import { createLessonResolver, myTeacherIds, publishedTimetable, type DatedLesson } from "./school-operations";
import type { ScheduleEntry } from "./school-schedule";

export type EventLessonImpact = { lesson: DatedLesson; status: "affected" | "normal" | "check" };
export function classifyEventLesson(lesson: DatedLesson, eventId: string): EventLessonImpact | null {
  if (!lesson.relatedEventIds?.includes(eventId)) return null;
  return { lesson, status: lesson.blockedByEventIds?.includes(eventId) ? "affected" : lesson.blockedBy.length ? "check" : "normal" };
}

/** Only use linked teaching-period allocations and the same published resolver as today's lessons. */
export function eventLessonImpacts(c: Context, entry: ScheduleEntry): EventLessonImpact[] {
  if (entry.tone !== "event" || !c.year || !c.schoolPublications?.length || !c.operations?.effectiveTimetables?.length) return [];
  if (!c.operations.directory.some(t => t.user_id === c.userId && t.active)) return [];
  const doc = publishedTimetable(c);
  if (!doc) return [];
  const start = `${c.year.year}-03-01`, end = addDays(`${c.year.year+1}-03-01`, -1);
  const resolve = createLessonResolver(c, doc), mine = myTeacherIds(c);
  const rows: EventLessonImpact[] = [];
  for (let date = entry.date < start ? start : entry.date; date <= entry.end && date <= end; date = addDays(date, 1)) {
    if (!publicationAt(c.schoolPublications, "calendar", date)) continue;
    for (const lesson of resolve(date)) {
      if (!mine.has(lesson.teacherId)) continue;
      const impact = classifyEventLesson(lesson, entry.id);
      if (impact) rows.push(impact);
    }
  }
  return rows;
}

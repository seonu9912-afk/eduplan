import { academicDays, annualSchema, isTeachingDay } from "./academic";
import { addDays, weekRange } from "./domain";
import type { Context } from "./models";
import { publicationAt, publishedSchoolContext } from "./school-publications";
import { createLessonResolver, dailyOperationNotice, publishedTimetable } from "./school-operations";
import { timetableDocumentSchema, type TimetableDocument } from "./timetable-bridge";

export type TimetableAudience = "mine" | "teacher" | "class" | "all";
export type TimetableMode = "basic" | "weekly";
export type TimetableCell = {
  id: string;
  period: number;
  subject: string;
  kind: string;
  teacher: string;
  teacherId: string;
  classes: string;
  classIds: string[];
  changed?: boolean;
  blocked?: string;
  start?: string | null;
  end?: string | null;
  room?: string;
};
type TimetableColumn = {
  date: string;
  periodCount: number;
  teaching: boolean;
  notice: string;
  cells: TimetableCell[];
};

export function timetableModeForWeek(c: Context, date: string): TimetableMode {
  if (!c.schoolPublications) return annualSchema.safeParse(c.annual?.document).success ? "weekly" : "basic";
  const friday = addDays(weekRange(date).start, 4);
  return publicationAt(c.schoolPublications, "calendar", friday) ? "weekly" : "basic";
}

export function timetableAt(c: Context, date: string) {
  const versions = c.operations?.effectiveTimetables;
  if (!versions)
    return { document: publishedTimetable(c), startsOn: "", endsOn: "", publishedAt: c.operations?.publication?.published_at };
  const dates = [...versions].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const idx = dates.findLastIndex((entry) => entry.starts_on <= date);
  if (idx < 0) return { document: null, startsOn: "", endsOn: "", publishedAt: undefined };
  const entry = dates[idx];
  const parsed = timetableDocumentSchema.safeParse(entry.document);
  return {
    document: parsed.success ? parsed.data : null,
    startsOn: entry.starts_on,
    endsOn: dates[idx + 1] ? addDays(dates[idx + 1].starts_on, -1) : addDays(`${parsed.success ? parsed.data.year + 1 : Number(date.slice(0, 4)) + 1}-03-01`, -1),
    publishedAt: entry.published_at,
  };
}

function basicCells(document: TimetableDocument, weekday: number): TimetableCell[] {
  return document.weekly.filter((slot) => slot.weekday === weekday).map((slot) => {
    const classIds = slot.scope === "class" ? [slot.scopeId] :
      document.groups.find((g) => g.id === slot.scopeId)?.classIds ?? [];
    const subject = document.subjects.find((s) => s.id === slot.subjectId);
    return {
      id: slot.id,
      period: slot.period,
      subject: subject?.label ?? "미등록 과목",
      kind: subject?.kind ?? "subject",
      teacherId: slot.teacherId,
      teacher: document.teachers.find((t) => t.id === slot.teacherId)?.label ?? "",
      classIds,
      classes: classIds.map((id) => document.classes.find((cls) => cls.id === id)?.label ?? "미등록 학급").join(", "),
    };
  });
}

export function timetableWeek(c: Context, date: string, mode: TimetableMode) {
  const schedule = timetableAt(c, date);
  const anchor = publishedTimetable(c);
  const resolve = mode === "weekly" && anchor ? createLessonResolver(c, anchor) : null;
  const monday = weekRange(date).start;
  const weekdays: TimetableColumn[] = Array.from({ length: 5 }, (_, index) => {
    const dayDate = addDays(monday, index);
    const weekday = index + 1;
    const applicable = mode === "basic" ? schedule.document : timetableAt(c, dayDate).document;
    let appliedWeekday = weekday;
    let cells: TimetableCell[] = [];
    let notice = "";
    let teaching = mode === "basic" && !!applicable;
    if (applicable && mode === "basic") cells = basicCells(applicable, weekday);
    if (mode === "weekly") {
      const official = publishedSchoolContext(c, dayDate);
      const annual = annualSchema.safeParse(official.annual?.document);
      const schoolDay = annual.success && c.year
        ? academicDays(c.year.year, annual.data, official.semesters).find((day) => day.date === dayDate)
        : undefined;
      appliedWeekday = schoolDay?.weekday ?? weekday;
      if (!applicable) notice = "적용 시간표 없음";
      else if (!annual.success || (c.schoolPublications && !official.hasOfficialCalendar)) notice = "공개 학사일정 없음";
      else if (!schoolDay || !isTeachingDay(schoolDay)) notice = schoolDay?.name || "수업일 아님";
      else {
        notice = dailyOperationNotice(c, dayDate);
        teaching = !!resolve;
        cells = (resolve?.(dayDate) ?? []).map((lesson) => ({
          id: lesson.id,
          period: lesson.period,
          subject: lesson.subject,
          kind: applicable.subjects.find((s) => s.id === lesson.subjectId)?.kind ?? "subject",
          teacherId: lesson.teacherId,
          teacher: applicable.teachers.find((t) => t.id === lesson.teacherId)?.label ?? c.operations?.directory.find((t) => t.id === lesson.teacherId)?.display_name ?? "",
          classes: lesson.classes,
          classIds: lesson.classIds,
          changed: lesson.changed,
          start: lesson.start, end: lesson.end, room: lesson.room,
          blocked: lesson.blockedBy.join(" · "),
        }));
      }
    }
    const periodCount = Math.max(applicable?.timetableConfig?.periods[String(appliedWeekday)] ?? 0,
      ...cells.map((cell) => cell.period));
    return { date: dayDate, periodCount, notice, cells, teaching };
  });
  return { weekdays, schedule, rows: Math.max(...weekdays.map((column) => column.periodCount)) };
}

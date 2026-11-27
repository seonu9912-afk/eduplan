import { academicDays, annualSchema } from "./academic";
import type { Context } from "./models";
import { buildTeachingCalendarGrid } from "./teaching-calendar-grid";
import type { TeachingWeek } from "./teaching-calendar-grid";

export type LinkedCalendar = { weeks: TeachingWeek[]; issue: string | null };
export function linkedTeachingCalendar(
  context: Pick<Context, "year" | "annual" | "semesters" | "events">,
  semester: number,
  grade: number,
): LinkedCalendar {
  if (!context.year || !context.annual)
    return { weeks: [], issue: "저장된 학사일정이 없습니다. 학사일정을 편성하면 주차가 표시됩니다." };
  if (!context.semesters.some(term => semester === 0 || term.number === semester))
    return { weeks: [], issue: "학기 시작일과 종료일을 확인해 주세요." };
  const annual = annualSchema.safeParse(context.annual.document);
  if (!annual.success)
    return { weeks: [], issue: "저장된 학사일정 형식을 확인할 수 없습니다." };
  const days = academicDays(context.year.year, annual.data, context.semesters);
  const references = new Set(context.events.map(event => event.id));
  const additional = annual.data.allocations.filter(allocation =>
    (!allocation.eventId || !references.has(allocation.eventId)) &&
    Object.entries(allocation.areas).some(([key, area]) => Number(key) === grade && area !== "없음"),
  ).map(allocation => ({
    id: allocation.id, title: allocation.title, start_date: allocation.date,
    end_date: allocation.date, target_grades: [grade],
  }));
  const weeks = buildTeachingCalendarGrid(days, [...context.events, ...additional], semester, grade);
  return { weeks, issue: weeks.length ? null : "선택한 학기에 수업일이 있는 주차가 없습니다." };
}

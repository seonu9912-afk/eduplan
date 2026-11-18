// Production adapter for the Q1–Q55 Workspace calendar. The server's existing
// annual plan and events remain the source of truth; no browser-only plan exists.
import { z } from "zod";
import { annualSchema, academicDays, operatingPeriodRange, type AnnualPlan } from "./academic";
import { addDays, eventSchema, monthRange, isoDate } from "./domain";
import type { Context, Row } from "./models";

export const calendarTabs = ["연간 학사력", "행사 편성", "시수 확인", "편성 점검", "Excel 출력"] as const;
/** Displays single-day events once, and multi-day events as explicit ranges. */
export function formatCalendarEventPeriod(startDate: string, endDate: string): string {
  const display = (date: string) => {
    const [, month, day] = date.split("-").map(Number);
    const weekday = "일월화수목금토"[new Date(`${date}T12:00:00Z`).getUTCDay()];
    return `${month}월 ${day}일(${weekday})`;
  };
  return startDate === endDate ? display(startDate) : `${display(startDate)}~${display(endDate)}`;
}

/** Copy before sorting; existing events and server-derived arrays must remain unchanged. */
export function sortCalendarEvents<T extends Pick<CalendarEvent, "start_date" | "end_date" | "title" | "id">>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => a.start_date.localeCompare(b.start_date)
    || a.end_date.localeCompare(b.end_date)
    || a.title.localeCompare(b.title, "ko")
    || a.id.localeCompare(b.id));
}

export type Area = AnnualPlan["allocations"][number]["areas"][string];
export type CalendarEvent = Row<"events"> & { target_class_ids?: string[] };
export type EventDraft = {
  event: CalendarEvent;
  // Scope -> date -> period. Class allocations override the corresponding grade hours.
  slots: Record<string, Record<string, Record<number, Area>>>;
};
export const calendarChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("day"), date: isoDate,
    before: annualSchema.shape.days.valueType.nullable(), value: annualSchema.shape.days.valueType.nullable() }),
  z.object({ kind: z.literal("holidays"), before: annualSchema.shape.holidays, value: annualSchema.shape.holidays }),
  z.object({ kind: z.literal("event"), id: z.uuid(), version: z.number().int().min(0),
    value: z.object(eventSchema.shape).omit({ id: true, version: true, workspace_id: true, academic_year_id: true })
      .extend({ target_class_ids: z.array(z.uuid()).max(300) })
      .refine((v) => v.start_date <= v.end_date, "행사 기간을 확인해 주세요.").nullable(),
    beforeAllocations: annualSchema.shape.allocations, allocations: annualSchema.shape.allocations }),
]);
export type CalendarChange = z.infer<typeof calendarChangeSchema>;
export type CalendarHistory = {
  id: number; item_key: string; before_value: unknown; after_value: unknown;
  actor_id: string; created_at: string; operation: string;
};
export type CalendarState = Pick<Context, "annual" | "events"> & { history: CalendarHistory[] };
export type CalendarConflict = { key: string; saved: unknown; incoming: unknown };
export type CalendarSaveResult = { ok: boolean; conflicts?: CalendarConflict[]; state?: CalendarState };

export function calendarDates(year: number, start: string, end: string) {
  if (!isoDate.safeParse(start).success || !isoDate.safeParse(end).success || start > end ||
    start < `${year}-03-01` || end > monthRange(`${year + 1}-02`).end) return [];
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function eventDraft(event: CalendarEvent, plan: AnnualPlan): EventDraft {
  const slots: EventDraft["slots"] = {};
  for (const row of plan.allocations.filter((row) => row.eventId === event.id)) {
    for (const [grade, area] of Object.entries(row.areas)) {
      const dates = slots[row.classId ? `c:${row.classId}` : `g:${grade}`] ??= {};
      const periods = dates[row.date] ??= {};
      for (let p = row.start; p <= row.end; p++) {
        // Preserve conflicting legacy records instead of silently selecting a winner.
        if (periods[p] && periods[p] !== area)
          throw Error(`${row.date} ${p}교시에 서로 다른 기존 배정이 있습니다. 기본 운영·자료 관리에서 중복을 확인해 주세요.`);
        periods[p] = area;
      }
    }
  }
  // Materialize the inherited part of old sparse class exceptions only in the draft.
  for (const c of Object.keys(slots).filter((key) => key.startsWith("c:"))) {
    const rows = plan.allocations.filter((row) => `c:${row.classId}` === c && row.eventId === event.id);
    for (const date of Object.keys(slots[c])) {
      const grade = Object.keys(rows.find((row) => row.date === date)!.areas)[0];
      slots[c][date] = { ...slots[`g:${grade}`]?.[date], ...slots[c][date] };
    }
  }
  return { event: { ...event, target_class_ids: event.target_class_ids ?? [] }, slots };
}

export function eventAllocations(draft: EventDraft, context: Pick<Context, "year" | "grades" | "classes">,
  makeId: () => string): AnnualPlan["allocations"] {
  if (!context.year) return [];
  const event = draft.event;
  const allowed = event.target_grades.length ? event.target_grades : context.grades;
  const targets = event.target_class_ids ?? [];
  const knownClasses = new Set(context.classes.map((c) => c.id));
  if (targets.some((id) => !knownClasses.has(id)) || Object.keys(draft.slots).some((key) => key.startsWith("c:") && !knownClasses.has(key.slice(2))))
    throw Error("보관된 학급의 예외 편성이 있습니다. 학급 연결을 확인하기 전에는 기존 편성을 바꾸지 않습니다.");
  const output: AnnualPlan["allocations"] = [];
  const dates = calendarDates(context.year.year, event.start_date, event.end_date);
  if (!dates.length) throw Error("행사 기간을 해당 학년도 안에서 선택해 주세요.");
  for (const date of dates) {
    for (const grade of allowed) {
      const common = draft.slots[`g:${grade}`]?.[date] ?? {};
      const commonClasses = context.classes.filter((c) => c.grade === grade && (!targets.length || targets.includes(c.id)));
      const scopes = targets.length ? commonClasses.map((c) => c.id) : [undefined,
        ...commonClasses.filter((c) => draft.slots[`c:${c.id}`]?.[date]).map((c) => c.id)];
      for (const classId of scopes) {
        const periods = classId ? draft.slots[`c:${classId}`]?.[date] ?? common : common;
        let last: AnnualPlan["allocations"][number] | undefined;
        for (let p = 1; p <= 12; p++) {
          // A new event occupies only the periods explicitly chosen in the grid.
          // Existing allocations are materialized by eventDraft and round-trip unchanged.
          const area = periods[p];
          if (!area || area === "없음") continue;
          if (last?.end === p - 1 && last.areas[grade] === area) last.end = p;
          else {
            last = { id: makeId(), eventId: event.id, ...(classId ? { classId } : {}),
              date, title: event.title.slice(0, 100), department: event.department,
              start: p, end: p, areas: { [grade]: area } };
            output.push(last);
          }
        }
      }
    }
  }
  return output;
}

export function eventChange(draft: EventDraft, context: Context, basePlan: AnnualPlan, remove = false): CalendarChange {
  const e = draft.event;
  return calendarChangeSchema.parse({ kind: "event", id: e.id, version: e.version,
    value: remove ? null : { title: e.title, start_date: e.start_date, end_date: e.end_date,
      target_grades: e.target_grades, target_class_ids: e.target_class_ids ?? [],
      department: e.department, description: e.description, event_type: e.event_type, activity_area: e.activity_area },
    beforeAllocations: basePlan.allocations.filter((row) => row.eventId === e.id),
    allocations: remove ? [] : eventAllocations(draft, context, () => crypto.randomUUID()) });
}

export function calendarDayRule(date: string, plan: AnnualPlan, context: Context): AnnualPlan["days"][string] {
  if (plan.days[date]) return structuredClone(plan.days[date]);
  const day = academicDays(context.year!.year, plan, context.semesters).find((day) => day.date === date)!;
  return { type: day.type, name: day.name, enabled: day.enabled,
    weekday: day.weekday > 0 && day.weekday < 6 ? day.weekday : 1 };
}


/** Show the configured timetable period span plus any existing assigned periods.
 * An unconfigured date defaults to 1–6; the user can opt into all 12. */
export function eventVisiblePeriods(
  ranges: ReadonlyArray<{ start: number; end: number } | undefined>,
  assigned: readonly number[],
  showAll = false,
): number[] {
  if (showAll) return Array.from({ length: 12 }, (_, index) => index+1);
  const valid = (period: number) => Number.isInteger(period) && period >= 1 && period <= 12;
  const bounds = ranges.flatMap((range) =>
    range && valid(range.start) && valid(range.end) && range.start <= range.end
      ? [range.start, range.end] : []);
  const used = [...bounds, ...assigned.filter(valid)];
  const first = used.length ? Math.min(...used) : 1;
  const last = used.length ? Math.max(...used) : 6;
  return Array.from({ length: last-first+1 }, (_, index) => first+index);
}

export function availablePeriods(date: string, grade: number, plan: AnnualPlan, context: Context) {
  const day = academicDays(context.year!.year, plan, context.semesters).find((d) => d.date === date);
  return day ? operatingPeriodRange(day, plan, grade) : undefined;
}

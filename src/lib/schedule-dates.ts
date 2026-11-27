import { addDays, calendarDays, monthRange, moveMonth, weekRange } from "./domain";

export type CalendarPeriod = "month" | "week";

export function scheduleDates(date: string, period: CalendarPeriod): string[] {
  if (period === "week") {
    const { start } = weekRange(date);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }
  const month = date.slice(0, 7);
  const days = calendarDays(month);
  const last = days.indexOf(monthRange(month).end);
  return days.slice(0, Math.ceil((last + 1) / 7) * 7);
}

export function shiftScheduleDate(date: string, period: CalendarPeriod, step: number) {
  if (period === "week") return addDays(date, 7 * step);
  const month = moveMonth(date.slice(0, 7), step);
  const candidate = `${month}-${date.slice(8)}`;
  const { end } = monthRange(month);
  return candidate <= end ? candidate : end;
}

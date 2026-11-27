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

/** Keep the date in the same Monday–Sunday week when weekends are hidden. */
export function visibleWeekDate(date: string, showWeekends: boolean, start?: string) {
  if (showWeekends) return date;
  const friday = addDays(weekRange(date).start, 4);
  return date > friday && (!start || friday >= start) ? friday : date;
}
export function visibleWeekDates(date: string, showWeekends: boolean, start?: string) {
  const dates = scheduleDates(date, "week");
  // If an academic year begins on a weekend, do not hide its only valid dates.
  return showWeekends || (start && dates[4] < start) ? dates : dates.slice(0, 5);
}

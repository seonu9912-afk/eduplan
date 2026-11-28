import { addDays, calendarDays, monthRange, moveMonth } from "./domain";

export type CalendarPeriod = "month" | "week";

/** Display calendars start on Sunday; instructional timetable weeks remain Monday-based. */
export function calendarWeekRange(date: string) {
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  const start = addDays(date, -weekday);
  return { start, end: addDays(start, 6) };
}

export function scheduleDates(date: string, period: CalendarPeriod): string[] {
  if (period === "week") {
    const { start } = calendarWeekRange(date);
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

/** Keep the selection within the same Sunday–Saturday week. */
export function visibleWeekDate(date: string, showWeekends: boolean, start?: string, end?: string) {
  const dates = visibleWeekDates(date, showWeekends, start, end);
  if (dates.includes(date)) return date;
  return date < dates[0] ? dates[0] : dates[dates.length - 1];
}
export function visibleWeekDates(date: string, showWeekends: boolean, start?: string, end?: string) {
  const dates = scheduleDates(date, "week");
  const weekdays = dates.slice(1, 6);
  // A boundary week containing only valid weekend days must remain accessible.
  return showWeekends || !weekdays.some(day => (!start || day >= start) && (!end || day <= end))
    ? dates : weekdays;
}

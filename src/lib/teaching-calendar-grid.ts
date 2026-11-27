import type { TeachingUnit } from "./teaching";

export type GridDay = {
  date: string;
  type: string;
  name: string;
  enabled: boolean;
  semester: number;
};
export type GridEvent = {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  target_grades: readonly number[] | null;
};
export type TeachingWeek = {
  anchor: string;
  month: string;
  week: string;
  day: string;
  period: string;
  start: string;
  end: string;
  calendarNotes: string[];
};

const dayMilliseconds = 86_400_000;
const parse = (date: string) => Date.parse(date + "T12:00:00Z");
const asDate = (stamp: number) => new Date(stamp).toISOString().slice(0, 10);
function dayNumber(date: string) {
  return new Date(parse(date)).getUTCDay();
}
export function mondayOf(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parse(date)) || asDate(parse(date)) !== date) return null;
  return asDate(parse(date) - ((dayNumber(date) + 6) % 7) * dayMilliseconds);
}
const shortDate = (day: string) =>
  Number(day.slice(5, 7)) + "." + Number(day.slice(8, 10)) + ".";
const dateText = (first: string, last: string) =>
  first === last ? shortDate(first) : shortDate(first) + "~" + shortDate(last);
const closed = new Set(["holiday", "vacation", "discretionary"]);
const working = new Set(["instructional", "swap"]);
const generic = new Map([
  ["holiday", "공휴일"],
  ["vacation", "방학"],
  ["discretionary", "재량휴업일"],
]);

export function buildTeachingCalendarGrid(
  days: readonly GridDay[],
  events: readonly GridEvent[],
  semester: number,
  grade: number,
): TeachingWeek[] {
  const groups = new Map<string, GridDay[]>();
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.semester === 0 || semester && day.semester !== semester) continue;
    const stamp = mondayOf(day.date);
    if (!stamp) continue;
    if (!groups.has(stamp)) groups.set(stamp, []);
    groups.get(stamp)!.push(day);
  }
  const eligible = events.filter(e => !e.target_grades?.length || e.target_grades.includes(grade));
  const monthRows = new Map<string, number>();
  return Array.from(groups).flatMap(([anchor, group]) => {
    const activeDays = group.filter(d => {
      const weekday = dayNumber(d.date);
      return (weekday >= 1 && weekday <= 5) ||
        (d.enabled && working.has(d.type));
    });
    if (activeDays.length === 0) return [];
    const start = activeDays[0].date;
    const end = activeDays.at(-1)!.date;
    const monthKey = start.slice(0, 7);
    const month = String(Number(start.slice(5, 7)));
    const index = (monthRows.get(monthKey) ?? 0) + 1;
    monthRows.set(monthKey, index);
    // Keep calendar week numbering stable, but never generate a teaching row
    // for a week without an enabled instructional or swapped school day.
    if (!group.some(day => day.enabled && working.has(day.type))) return [];
    const lastInWeek = group.at(-1)!.date;
    const firstInWeek = group[0].date;
    const notes = new Set<string>();
    for (const d of group) {
      if (!d.enabled || closed.has(d.type)) {
        notes.add((d.name || generic.get(d.type) || "휴업일") + "(" + shortDate(d.date) + ")");
      }
    }
    for (const e of eligible) {
      const eventEnd = e.end_date || e.start_date;
      if (e.start_date <= lastInWeek && eventEnd >= firstInWeek) {
        notes.add(e.title + "(" + dateText(e.start_date, eventEnd) + ")");
      }
    }
    return [{
      anchor, month, week: String(index), day: dateText(start, end),
      period: month + "월 " + index + "주", start, end, calendarNotes: [...notes],
    }];
  });
}

export function bindTeachingCalendarGrid(
  weeks: readonly TeachingWeek[],
  units: readonly TeachingUnit[],
) {
  const byMonday = new Map<string, TeachingUnit>();
  for (const unit of units) {
    const key = mondayOf(unit.start);
    const endKey = unit.end ? mondayOf(unit.end) : key;
    if (key && key === endKey && !byMonday.has(key)) byMonday.set(key, unit);
  }
  const assigned = new Set<string>();
  const rows = weeks.map(week => {
    const unit = byMonday.get(week.anchor);
    if (unit) assigned.add(unit.id);
    return { week, unit };
  });
  return { rows, unattached: units.filter(u => !assigned.has(u.id)) };
}

export function formatProjectedUnits(
  weeks: readonly TeachingWeek[],
  units: readonly TeachingUnit[],
  showBlankWeeks = false,
): TeachingUnit[] {
  const { rows, unattached } = bindTeachingCalendarGrid(weeks, units);
  const projected = rows.flatMap(({ week, unit }) => {
    if (!unit && !showBlankWeeks) return [];
    const automatic = week.calendarNotes.join("\n");
    const content = {
      start: week.start, end: week.end, month: week.month, week: week.week,
      day: week.day, period: week.period,
      note: [automatic, unit?.note].filter(Boolean).join("\n"),
    };
    return unit ? [{ ...unit, ...content }] : [{
      id: week.anchor, title: "", content: "", standard_ids: [], lessons: null,
      method: "", alignment: "", ...content,
    }];
  });
  return [...projected, ...unattached];
}

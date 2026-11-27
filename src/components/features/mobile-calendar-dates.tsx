import { useRef } from "react";
import { compactCalendarWeek, type ScheduleEntry } from "@/lib/school-schedule";
import { dateLabel } from "@/lib/domain";
import { scheduleDates, type CalendarPeriod } from "@/lib/schedule-dates";
import "./mobile-calendar-dates.css";
import { scheduleDepartmentColor } from "@/lib/department-badge";
import "./department-badge.css";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
export type CalendarTone = "event" | "work" | "break";
export type CalendarCellItem = { tone: CalendarTone; title: string; department?: string; end?: string };

export function MobileCalendarDates({ date, today, start, end, period, items, onSelect, onNavigate, showWeekends = true, emphasizeToday = false, compactRows = false, spanDays }: {
  date: string;
  today: string;
  start: string;
  end: string;
  period: CalendarPeriod;
  showWeekends?: boolean;
  emphasizeToday?: boolean;
  compactRows?: boolean;
  spanDays?: ReadonlyMap<string, { entries: ScheduleEntry[] }>;
  items: (day: string) => CalendarCellItem[];
  onSelect: (day: string) => void;
  onNavigate: (step: number) => void;
}) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const weekdaysOnly = period === "week" && !showWeekends;
  const days = weekdaysOnly ? scheduleDates(date, period).slice(0, 5) : scheduleDates(date, period);
  const month = date.slice(0, 7);
  const labels = period === "week" ? [...weekdays.slice(1), weekdays[0]].slice(0, weekdaysOnly ? 5 : 7) : weekdays;
  return (
    <div className="mobile-calendar-dates" data-emphasize-today={emphasizeToday ? "" : undefined} data-compact-rows={compactRows ? "" : undefined} data-weekdays-only={weekdaysOnly ? "" : undefined} role="group" aria-label={period === "week" ? "주간 날짜 선택" : "월간 날짜 선택"}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStart.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchCancel={() => { touchStart.current = null; }}
      onTouchEnd={(event) => {
        const first = touchStart.current;
        touchStart.current = null;
        if (!first || event.touches.length) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - first.x;
        const dy = touch.clientY - first.y;
        if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.5) onNavigate(dx < 0 ? 1 : -1);
      }}>
      <div className="mobile-calendar-weekdays" aria-hidden="true">
        {labels.map((day) => <span key={day} data-weekday={day}>{day}</span>)}
      </div>
      {spanDays ? <div className="mobile-calendar-span-grid">
        {Array.from({length: days.length / labels.length}, (_, index) => {
          const week = days.slice(index * labels.length, (index + 1) * labels.length);
          const { lanes, hidden } = compactCalendarWeek(week, spanDays);
          return <div className="mobile-calendar-span-week" key={week[0]} data-lanes={lanes.filter(lane=>lane.length>0).length} data-overflow={hidden.some(count=>count>0) ? "" : undefined} style={{gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))`}}>
            {week.map((day, col) => {
              const enabled = day >= start && day <= end;
              const entries = enabled ? spanDays.get(day)?.entries ?? [] : [];
              return <button key={day} type="button" className="mobile-calendar-span-day" data-date={day} data-weekday={labels[col]}
                data-adjacent={period === "month" && !day.startsWith(month) ? "" : undefined}
                aria-label={`${Number(day.slice(0,4))}년 ${dateLabel(day)} ${labels[col]}요일, 일정 ${entries.length}건`}
                disabled={!enabled} aria-pressed={day === date} aria-current={day === today ? "date" : undefined}
                style={{gridColumn: col+1, gridRow: "1 / -1"}} onClick={() => onSelect(day)}><time dateTime={day}>{Number(day.slice(8))}</time></button>;
            })}
            {lanes.flatMap((lane, row) => lane.map(({entry,start: first,end: last}) => <span key={`${entry.id}:${first}:${row}`} className="mobile-calendar-span-event mobile-calendar-cell-entry"
              data-tone={entry.tone} data-past={entry.end < today ? "" : undefined} data-department-color={scheduleDepartmentColor(entry.department,entry.tone)}
              style={{gridColumn: `${first+1} / ${last+2}`, gridRow: row+2}} aria-hidden="true"><span>{entry.title}</span></span>))}
            {hidden.map((count,col) => count > 0 ? <small key={col} className="mobile-calendar-span-more" style={{gridColumn:col+1,gridRow:4}} aria-hidden="true">+{count}</small> : null)}
          </div>;
        })}
      </div> : <div className="mobile-calendar-day-grid">
        {days.map((day, index) => {
          const enabled = day >= start && day <= end;
          const entries = enabled ? items(day) : [];
          const first = entries[0];
          const weekday = labels[index % 7];
          return <button key={day} type="button" data-date={day} data-weekday={weekday}
            data-adjacent={period === "month" && !day.startsWith(month) ? "" : undefined}
            aria-label={`${Number(day.slice(0, 4))}년 ${dateLabel(day)} ${weekday}요일${first ? `, 일정 ${entries.length}건, ${first.title}` : ""}`}
            disabled={!enabled} aria-pressed={day === date} aria-current={day === today ? "date" : undefined}
            onClick={() => onSelect(day)}>
            <time dateTime={day}>{Number(day.slice(8))}</time>
            {first && <span className="mobile-calendar-cell-entry" data-past={emphasizeToday && first.end && first.end < today ? "" : undefined} data-tone={first.tone} data-department-color={scheduleDepartmentColor(first.department, first.tone)} aria-hidden="true">
              <span>{first.title}</span>{entries.length > 1 && <small>+{entries.length - 1}</small>}
            </span>}
          </button>;
        })}
      </div>}
    </div>
  );
}

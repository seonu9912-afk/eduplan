import { dateLabel } from "@/lib/domain";
import { dailyLessonStatus } from "@/lib/school-operations";
import type { timetableWeek, TimetableAudience, TimetableCell, TimetableMode } from "@/lib/timetable-view";
import "./official-timetable.css";

const days = ["월", "화", "수", "목", "금"];

export function TimetableGrid({ week, mode, audience, label, visible, compact = false, today, currentMinutes, showFreePeriods = false }: {
  week: ReturnType<typeof timetableWeek>;
  mode: TimetableMode;
  audience: TimetableAudience;
  label: string;
  visible: (cell: TimetableCell) => boolean;
  compact?: boolean;
  today?: string;
  currentMinutes?: number;
  showFreePeriods?: boolean;
}) {
  const columns = week.weekdays.map((column) => ({ ...column, allCells: column.cells, cells: column.cells.filter(visible) }));
  const current = (cell: TimetableCell, date: string) => mode === "weekly" && date === today && currentMinutes !== undefined && dailyLessonStatus({ start: cell.start ?? null, end: cell.end ?? null, blockedBy: cell.blocked ? [cell.blocked] : [] }, currentMinutes) === "current";
  return (
    <div className={`official-timetable-scroll${compact ? " timetable-compact" : ""}`}
      tabIndex={0} role="region" aria-label={label}>
      <table className="official-timetable-grid">
        <caption className="sr-only">{label}</caption>
        <thead><tr>
          <th scope="col">교시</th>
          {columns.map((column, index) => (
            <th scope="col" key={column.date} data-today={mode === "weekly" && column.date === today ? "" : undefined}>{days[index]}
              {mode === "weekly" && <time dateTime={column.date} aria-current={column.date === today ? "date" : undefined}>{dateLabel(column.date)}</time>}
              {column.notice && <small className="timetable-day-notice">{column.notice}</small>}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {Array.from({ length: week.rows }, (_, index) => {
            const period = index + 1;
            return <tr key={period}>
              <th scope="row">{period}교시</th>
              {columns.map((column) => {
                const cells = column.cells.filter((cell) => cell.period === period);
                const active = column.allCells.some((cell) => cell.period === period && current(cell, column.date));
                const free = showFreePeriods && column.teaching && period <= column.periodCount && !cells.length && (audience === "mine" || audience === "teacher" || audience === "class");
                return <td key={column.date} data-today={mode === "weekly" && column.date === today ? "" : undefined}
                  data-current-period={active ? "" : undefined} className={period > column.periodCount || !column.teaching ? "timetable-nonperiod" : undefined}>
                  {free && <span className="timetable-free-period">{audience === "class" ? "수업 없음" : "공강"}</span>}
                  {cells.map((cell) => (
                    <div className="official-lesson" data-kind={cell.kind}
                      data-blocked={cell.blocked ? "" : undefined} data-current={current(cell, column.date) ? "" : undefined} key={cell.id}>
                      {audience === "class" ? <>
                        <strong>{cell.subject}</strong>
                        <span>{cell.teacher}</span>
                      </> : <>
                        <strong>{cell.classes.replace(/(\d+)학년\s+(\d+)반/g, "$1-$2")}</strong>
                        <span>{cell.subject}</span>
                        {audience === "all" && cell.teacher && <small>{cell.teacher}</small>}
                      </>}
                      {showFreePeriods && cell.room && <small>{cell.room}</small>}
                      {current(cell, column.date) && <small className="timetable-current-label">진행 중</small>}
                      {(cell.blocked || cell.changed) && <small>{cell.blocked || "변경 수업"}</small>}
                    </div>
                  ))}
                </td>;
              })}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

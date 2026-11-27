import { dateLabel } from "@/lib/domain";
import { dailyLessonStatus } from "@/lib/school-operations";
import { commonPeriodTime, lessonTime } from "@/lib/timetable-display";
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
      <table className="official-timetable-grid" data-audience={audience}>
        <caption className="sr-only">{label}</caption>
        <thead><tr>
          <th scope="col">교시</th>
          {columns.map((column, index) => (
            <th scope="col" key={column.date} data-today={mode === "weekly" && column.date === today ? "" : undefined}><span className="timetable-weekday-label">{days[index]}</span>
              {mode === "weekly" && <time dateTime={column.date} aria-current={column.date === today ? "date" : undefined}><span className="timetable-date-full">{dateLabel(column.date)}</span><span className="timetable-date-short" aria-hidden="true">{Number(column.date.slice(8))}일</span></time>}
              {column.notice && <small className="timetable-day-notice">{column.notice}</small>}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {Array.from({ length: week.rows }, (_, index) => {
            const period = index + 1;
            const time = mode === "weekly" ? commonPeriodTime(columns, period) : null;
            return <tr key={period}>
              <th scope="row"><strong>{period}교시</strong>{time && <small className="timetable-period-time" title={time.start+"~"+time.end}>{time.start}<span className="timetable-period-end">{time.end}</span></small>}</th>
              {columns.map((column) => {
                const cells = column.cells.filter((cell) => cell.period === period);
                const active = column.allCells.some((cell) => cell.period === period && current(cell, column.date));
                const free = showFreePeriods && column.teaching && period <= column.periodCount && !cells.length && (audience === "mine" || audience === "teacher" || audience === "class");
                return <td key={column.date} data-today={mode === "weekly" && column.date === today ? "" : undefined}
                  data-current-period={active ? "" : undefined} className={period > column.periodCount || !column.teaching ? "timetable-nonperiod" : undefined}>
                  {free && <span className="timetable-free-period" aria-label={audience === "class" ? "수업 없음" : "공강"}>{audience === "class" ? "—" : "공강"}</span>}
                  {cells.map((cell) => {
                    const classLabel = cell.classes.replace(/(\d+)학년\s+(\d+)반/g, "$1-$2");
                    const classFirst = (audience === "mine" || audience === "teacher") && !!classLabel.trim();
                    const grades = [...new Set(Array.from(classLabel.matchAll(/(?:^|[,\s])(\d+)-\d+(?=$|[,\s])/g), (match) => match[1]))];
                    return <div className="official-lesson" data-kind={cell.kind} data-grade={classFirst && grades.length === 1 ? grades[0] : undefined}
                      data-blocked={cell.blocked ? "" : undefined} data-current={current(cell, column.date) ? "" : undefined} key={cell.id}>
                      <strong className="timetable-lesson-subject">{classFirst ? classLabel : cell.subject}</strong>
                      {audience === "class" ? (cell.teacher && <span className="timetable-lesson-secondary">{cell.teacher}</span>) : <>
                        <span className="timetable-lesson-secondary">{classFirst ? cell.subject : classLabel}</span>
                        {audience === "all" && cell.teacher && <small className="timetable-lesson-meta">{cell.teacher}</small>}
                      </>}
                      {showFreePeriods && cell.room && <small className="timetable-lesson-meta">{cell.room}</small>}
                      {mode === "weekly" && !time && lessonTime(cell) && <small className="timetable-lesson-meta timetable-varying-time">{cell.start}~{cell.end}</small>}
                      {current(cell, column.date) && <small className="timetable-current-label">진행 중</small>}
                      {(cell.blocked || cell.changed) && <small className="timetable-lesson-state">{cell.blocked || "변경 수업"}</small>}
                    </div>;
                  })}
                </td>;
              })}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

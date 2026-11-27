import { dateLabel } from "@/lib/domain";
import type { timetableWeek, TimetableAudience, TimetableCell, TimetableMode } from "@/lib/timetable-view";
import "./official-timetable.css";

const days = ["월", "화", "수", "목", "금"];

export function TimetableGrid({ week, mode, audience, label, visible, compact = false }: {
  week: ReturnType<typeof timetableWeek>;
  mode: TimetableMode;
  audience: TimetableAudience;
  label: string;
  visible: (cell: TimetableCell) => boolean;
  compact?: boolean;
}) {
  const columns = week.weekdays.map((column) => ({ ...column, cells: column.cells.filter(visible) }));
  return (
    <div className={`official-timetable-scroll${compact ? " timetable-compact" : ""}`}
      tabIndex={0} role="region" aria-label={label}>
      <table className="official-timetable-grid">
        <caption className="sr-only">{label}</caption>
        <thead><tr>
          <th scope="col">교시</th>
          {columns.map((column, index) => (
            <th scope="col" key={column.date}>{days[index]}
              {mode === "weekly" && <small>{dateLabel(column.date)}</small>}
              {column.notice && <small className="timetable-day-notice">{column.notice}</small>}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {Array.from({ length: week.rows }, (_, index) => {
            const period = index + 1;
            return <tr key={period}>
              <th scope="row">{period}교시</th>
              {columns.map((column) => (
                <td key={column.date} className={period > column.periodCount ? "timetable-nonperiod" : undefined}>
                  {column.cells.filter((cell) => cell.period === period).map((cell) => (
                    <div className="official-lesson" data-kind={cell.kind}
                      data-blocked={cell.blocked ? "" : undefined} key={cell.id}>
                      {audience === "class" ? <>
                        <strong>{cell.subject}</strong>
                        <span>{cell.teacher}</span>
                      </> : <>
                        <strong>{cell.classes.replace(/(\d+)학년\s+(\d+)반/g, "$1-$2")}</strong>
                        <span>{cell.subject}</span>
                        {audience === "all" && cell.teacher && <small>{cell.teacher}</small>}
                      </>}
                      {(cell.blocked || cell.changed) && <small>{cell.blocked || "변경 수업"}</small>}
                    </div>
                  ))}
                </td>
              ))}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

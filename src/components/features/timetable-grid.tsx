"use client";

import { useState } from "react";
import { Modal } from "@/components/common";
import { dateLabel } from "@/lib/domain";
import { dailyLessonStatus } from "@/lib/school-operations";
import { commonPeriodTime, lessonTime } from "@/lib/timetable-display";
import { visibleTimetableCell, type timetableWeek, type TimetableAudience, type TimetableCell, type TimetableMode } from "@/lib/timetable-view";
import "./official-timetable.css";

const days = ["월", "화", "수", "목", "금"];

export function TimetableGrid({ week, mode, audience, label, visible, compact = false, today, currentMinutes, showFreePeriods = false, showChangeBadges = false }: {
  week: ReturnType<typeof timetableWeek>;
  mode: TimetableMode;
  audience: TimetableAudience;
  label: string;
  visible: (cell: TimetableCell) => boolean;
  compact?: boolean;
  today?: string;
  currentMinutes?: number;
  showFreePeriods?: boolean;
  showChangeBadges?: boolean;
}) {
  const [detail, setDetail] = useState<{ cell?: TimetableCell; date: string; notice?: string } | null>(null);
  const columns = week.weekdays.map((column) => ({ ...column, allCells: column.cells, cells: column.cells.filter(cell => visible(cell) && visibleTimetableCell(cell, audience)) }));
  const current = (cell: TimetableCell, date: string) => mode === "weekly" && date === today && currentMinutes !== undefined && dailyLessonStatus({ start: cell.start ?? null, end: cell.end ?? null, blockedBy: cell.blocked ? [cell.blocked] : [] }, currentMinutes) === "current";
  return (
    <>
    <div className={`official-timetable-scroll${compact ? " timetable-compact" : ""}`}
      tabIndex={0} role="region" aria-label={label}>
      <table className="official-timetable-grid" data-audience={audience} data-change-badges={showChangeBadges ? "" : undefined}>
        <caption className="sr-only">{label}</caption>
        <colgroup><col className="timetable-period-col"/>{columns.map(column=><col key={column.date}/>)}</colgroup>
        <thead><tr>
          <th scope="col">교시</th>
          {columns.map((column, index) => (
            <th scope="col" key={column.date} data-today={mode === "weekly" && column.date === today ? "" : undefined}><span className="timetable-weekday-label">{days[index]}</span>
              {mode === "weekly" && (showChangeBadges && column.noticeLabel === "단축" ? <button type="button" className="timetable-date-detail" aria-label={dateLabel(column.date) + " 일과 운영 상세 보기"} onClick={() => setDetail({date: column.date, notice: column.notice})}><time dateTime={column.date} aria-current={column.date === today ? "date" : undefined}><span className="timetable-date-full">{dateLabel(column.date)}</span><span className="timetable-date-short" aria-hidden="true">{Number(column.date.slice(8))}</span></time></button> : <time dateTime={column.date} aria-current={column.date === today ? "date" : undefined}><span className="timetable-date-full">{dateLabel(column.date)}</span><span className="timetable-date-short" aria-hidden="true">{Number(column.date.slice(8))}</span></time>)}
              {column.notice && !(showChangeBadges && column.noticeLabel === "단축") && (showChangeBadges ? <button type="button" className="timetable-day-badge" aria-label={dateLabel(column.date) + " " + column.notice} onClick={() => setDetail({ date: column.date, notice: column.notice })}>{column.noticeLabel ?? (/방학/.test(column.notice) ? "방학" : /수업일 아님|휴업|공휴일/.test(column.notice) || !column.teaching && column.cells.length ? "휴업" : "안내")}</button> : <small className="timetable-day-notice">{column.notice}</small>)}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {Array.from({ length: week.rows }, (_, index) => {
            const period = index + 1;
            const time = mode === "weekly" ? commonPeriodTime(columns, period) : null;
            return <tr key={period}>
              <th scope="row"><strong>{period}교시</strong>{!showChangeBadges && time && <small className="timetable-period-time" title={time.start+"~"+time.end}>{time.start}<span className="timetable-period-end">{time.end}</span></small>}</th>
              {columns.map((column) => {
                const cells = column.cells.filter((cell) => cell.period === period);
                const active = column.allCells.some((cell) => cell.period === period && current(cell, column.date));
                const free = showFreePeriods && column.teaching && period <= column.periodCount && !cells.length;
                return <td key={column.date} data-today={mode === "weekly" && column.date === today ? "" : undefined}
                  data-current-period={active ? "" : undefined} className={period > column.periodCount || !column.teaching ? "timetable-nonperiod" : undefined}>
                  {free && <span className="timetable-free-period" aria-label={audience === "class" ? "수업 없음" : "공강"}>{audience === "class" ? "—" : "공강"}</span>}
                  {cells.map((cell) => {
                    const classLabel = cell.classes.replace(/(\d+)학년\s+(\d+)반/g, "$1-$2");
                    const classFirst = (audience === "mine" || audience === "teacher") && !!classLabel.trim();
                    const grades = [...new Set(Array.from(classLabel.matchAll(/(?:^|[,\s])(\d+)-\d+(?=$|[,\s])/g), (match) => match[1]))];
                    const badges = cell.badges ?? [];
                    const content = <>
                      {showChangeBadges && <span className="timetable-badges" aria-hidden="true">{badges.slice(0, 1).map(badge => <small key={badge} className="timetable-status-badge" data-status={badge}>{badge === "확인 필요" ? "확인" : badge}{badges.length > 1 && <span className="timetable-extra-status">+{badges.length - 1}</span>}</small>)}</span>}
                      <strong className="timetable-lesson-subject">{classFirst ? classLabel : cell.subject}</strong>
                      {audience === "class" ? (cell.teacher && <span className="timetable-lesson-secondary">{cell.teacher}</span>) : <>
                        <span className="timetable-lesson-secondary">{classFirst ? cell.subject : classLabel}</span>
                      </>}
                      {!showChangeBadges && showFreePeriods && cell.room && <small className="timetable-lesson-meta">{cell.room}</small>}
                      {!showChangeBadges && mode === "weekly" && !time && lessonTime(cell) && <small className="timetable-lesson-meta timetable-varying-time">{cell.start}~{cell.end}</small>}
                      {!showChangeBadges && current(cell, column.date) && <small className="timetable-current-label">진행 중</small>}
                      {!showChangeBadges && (cell.blocked || cell.changed) && <small className="timetable-lesson-state">{cell.blocked || "변경 수업"}</small>}
                    </>;
                    const attributes = { className: "official-lesson", "data-kind": cell.kind, "data-grade": classFirst && grades.length === 1 ? grades[0] : undefined, "data-blocked": cell.blocked ? "" : undefined, "data-current": current(cell, column.date) ? "" : undefined, "data-cancelled": badges.includes("미실시") ? "" : undefined, "data-changed": cell.changed || badges.length > 0 ? "" : undefined };
                    return showChangeBadges ? <button type="button" {...attributes} key={cell.id} aria-label={[dateLabel(column.date), period + "교시", cell.classes, cell.subject, ...badges, "상세 보기"].join(" ")} onClick={() => setDetail({ cell, date: column.date, notice: column.notice })}>{content}</button> : <div {...attributes} key={cell.id}>{content}</div>;
                  })}
                </td>;
              })}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    {showChangeBadges && detail && <Modal open={true} onOpenChange={open => { if (!open) setDetail(null); }} title={detail.cell ? detail.cell.subject + " · " + detail.cell.period + "교시" : "일과 운영 안내"} description={dateLabel(detail.date)}>
      {detail.cell && <dl className="timetable-lesson-detail">
        <dt>학급</dt><dd>{detail.cell.classes || "—"}</dd>
        <dt>교사</dt><dd>{detail.cell.teacher || "—"}</dd>
        <dt>수업 시간</dt><dd>{detail.cell.start && detail.cell.end ? detail.cell.start + "–" + detail.cell.end : "미설정"}</dd>
        {detail.cell.room && <><dt>장소</dt><dd>{detail.cell.room}</dd></>}
        {!!detail.cell.badges?.length && <><dt>상태</dt><dd>{detail.cell.badges.join(" · ")}</dd></>}
        {detail.cell.blocked && <><dt>사유</dt><dd>{detail.cell.blocked}</dd></>}
      </dl>}
      {detail.notice && <p className="timetable-detail-notice">{detail.notice}</p>}
    </Modal>}
    </>
  );
}

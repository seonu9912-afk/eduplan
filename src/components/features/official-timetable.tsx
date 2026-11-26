"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, dateLabel } from "@/lib/domain";
import type { Context } from "@/lib/models";
import { timetableWeek, type TimetableAudience, type TimetableCell } from "@/lib/timetable-view";
import "./official-timetable.css";

const days = ["월", "화", "수", "목", "금"];
const audiences: Record<TimetableAudience, string> = {
  mine: "나의 시간표",
  teacher: "교사별",
  class: "학급별",
  all: "전체 시간표",
};

export function OfficialTimetable({ context: c, today }: { context: Context; today: string }) {
  if (!c.year) return <p>학년도를 선택하세요.</p>;
  return <TimetableSheet context={c} today={today} year={c.year.year} />;
}

function TimetableSheet({ context: c, today, year }: { context: Context; today: string; year: number }) {
  const start = `${year}-03-01`;
  const end = addDays(`${year + 1}-03-01`, -1);
  const thisYear = today >= start && today <= end;
  const initialDate = thisYear ? today : c.semesters[0]?.start_date ?? c.operations?.effectiveTimetables?.[0]?.starts_on ?? start;
  const clamp = (value: string) => value < start ? start : value > end ? end : value;
  const [date, setDate] = useState(initialDate);
  const [mode, setMode] = useState<"basic" | "weekly">(c.annual ? "weekly" : "basic");
  const [audience, setAudience] = useState<TimetableAudience>("mine");
  const [teacher, setTeacher] = useState("");
  const [classId, setClassId] = useState("");
  const week = useMemo(() => timetableWeek(c, date, mode), [c, date, mode]);
  const document = week.schedule.document;
  const teachers = new Map([
    ...(c.operations?.directory ?? []).filter((t) => t.active).map((t) => [t.id, t.display_name] as const),
    ...(document?.teachers ?? []).map((t) => [t.id, t.label] as const),
  ]);
  const classes = new Map([
    ...c.classes.map((cls) => [cls.id, `${cls.grade}학년 ${cls.class_number}반`] as const),
    ...(document?.classes ?? []).map((cls) => [cls.id, cls.label] as const),
  ]);
  const mine = c.operations?.directory.find((t) => t.user_id === c.userId && t.active);
  const selectedTeacher = teachers.has(teacher) ? teacher : teachers.keys().next().value ?? "";
  const selectedClass = classes.has(classId) ? classId : classes.keys().next().value ?? "";
  const term = c.semesters.find((s) => date >= s.start_date && date <= s.end_date);
  const visible = (cell: TimetableCell) => {
    switch (audience) {
      case "mine": return cell.teacherId === mine?.id || (!!mine && cell.teacherId === c.userId);
      case "teacher": return cell.teacherId === selectedTeacher;
      case "class": return cell.classIds.includes(selectedClass);
      default: return true;
    }
  };
  const available = week.rows > 0;
  const label = audience === "teacher" ? teachers.get(selectedTeacher) :
    audience === "class" ? classes.get(selectedClass) : audiences[audience];
  return (
    <section className="official-timetable">
      <div className="official-timetable-controls no-print">
        <div className="official-timetable-tabs" aria-label="시간표 조회 대상">
          {Object.entries(audiences).map(([id, name]) => (
            <Button key={id} variant={audience === id ? "secondary" : "ghost"}
              aria-pressed={audience === id} onClick={() => setAudience(id as TimetableAudience)}>
              {name}
            </Button>
          ))}
        </div>
        <div className="official-timetable-filters">
          {audience === "teacher" && (
            <label>교사
              <select value={selectedTeacher} onChange={(e) => setTeacher(e.target.value)}>
                {[...teachers].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          )}
          {audience === "class" && (
            <label>학급
              <select value={selectedClass} onChange={(e) => setClassId(e.target.value)}>
                {[...classes].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          )}
          {c.semesters.length > 0 && (
            <label>학기
              <select value={term?.number ?? ""} onChange={(e) => {
                const chosen = c.semesters.find((s) => s.number === Number(e.target.value));
                if (chosen) setDate(chosen.start_date);
              }}>
                {!term && <option value="" disabled>학기 선택</option>}
                {c.semesters.map((s) => <option key={s.number} value={s.number}>{s.number}학기</option>)}
              </select>
            </label>
          )}
          <label>보기
            <select value={mode} onChange={(e) => setMode(e.target.value === "basic" ? "basic" : "weekly")}>
              <option value="basic">기본 시간표</option>
              <option value="weekly">주간 시간표</option>
            </select>
          </label>
          <div className="official-timetable-date">
            {mode === "weekly" && <Button variant="ghost" size="icon" aria-label="이전 주"
              disabled={addDays(week.weekdays[0].date, -1) < start} onClick={() => setDate(clamp(addDays(date, -7)))}><ChevronLeft /></Button>}
            <label>
              <span className="sr-only">기준 날짜</span>
              <input type="date" value={date} min={start} max={end} onChange={(e) => {
                if (e.target.value) setDate(clamp(e.target.value));
              }} />
            </label>
            {mode === "weekly" && <>
              <Button variant="ghost" size="icon" aria-label="다음 주"
                disabled={addDays(week.weekdays[0].date, 7) > end} onClick={() => setDate(clamp(addDays(date, 7)))}><ChevronRight /></Button>
              <Button variant="outline" disabled={!thisYear} onClick={() => setDate(today)}>이번 주</Button>
            </>}
          </div>
          <Button variant="outline" disabled={!available} onClick={() => window.print()}>
            <Printer /> 인쇄·PDF 저장
          </Button>
        </div>
      </div>
      <header className="official-timetable-caption">
        <h2>{label} · {mode === "basic" ? "기본" : "주간"}</h2>
        {mode === "weekly" && <p>{dateLabel(week.weekdays[0].date)} – {dateLabel(week.weekdays[4].date)}</p>}
        {mode === "basic" && week.schedule.startsOn && (
          <p>적용 {week.schedule.startsOn} ~ {week.schedule.endsOn}
            {week.schedule.publishedAt && ` · 공개 ${week.schedule.publishedAt.slice(0, 10)}`}
          </p>
        )}
      </header>
      {audience === "mine" && !mine ? (
        <p className="panel official-timetable-empty">교원 명부에 계정이 연결되면 나의 시간표를 볼 수 있습니다. 학교 관리자에게 연결을 요청하세요.</p>
      ) : !available ? (
        <p className="panel official-timetable-empty">
          {mode === "weekly" && !c.annual ? "주간 시간표에는 공개 학사일정이 필요합니다. 기본 시간표를 확인해 주세요." : "선택한 기간에 공개된 시간표가 없습니다."}
        </p>
      ) : (
        <div className="official-timetable-scroll" tabIndex={0} role="region" aria-label="요일별 시간표">
          <table className="official-timetable-grid" aria-label={label}>
            <thead><tr>
              <th scope="col">교시</th>
              {week.weekdays.map((column, ix) => (
                <th scope="col" key={column.date}>{days[ix]}
                  {mode === "weekly" && <small>{dateLabel(column.date)}</small>}
                  {column.notice && <small className="timetable-day-notice">{column.notice}</small>}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {Array.from({ length: week.rows }, (_, index) => (
                <tr key={index}>
                  <th scope="row">{index + 1}교시</th>
                  {week.weekdays.map((column) => (
                    <td key={column.date} className={index + 1 > column.periodCount ? "timetable-nonperiod" : undefined}>
                      {column.cells.filter((cell) => cell.period === index + 1 && visible(cell)).map((cell) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

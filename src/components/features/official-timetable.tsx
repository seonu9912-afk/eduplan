"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Ellipsis, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/common";
import { addDays, dateLabel } from "@/lib/domain";
import type { Context } from "@/lib/models";
import { myTeacherIds, seoulClock } from "@/lib/school-operations";
import { timetableModeForWeek, timetableWeek, type TimetableAudience, type TimetableCell, type TimetableMode } from "@/lib/timetable-view";
import { TimetableGrid } from "./timetable-grid";
import "./official-timetable.css";
import { ReaderPeriodNavigator, ReaderViewSegment } from "./reader-controls";
import "./reader-controls.css";

const audiences: Record<TimetableAudience, string> = {
  mine: "나의 시간표",
  teacher: "교사별",
  class: "학급별",
};

export function OfficialTimetable({ context: c, today, actions, initialDate }: { context: Context; today: string; actions?: ReactNode; initialDate?: string }) {
  if (!c.year) return <p>학년도를 선택하세요.</p>;
  return <TimetableSheet context={c} today={today} year={c.year.year} actions={actions} requestedDate={initialDate} />;
}

function TimetableSheet({ context: c, today, year, actions, requestedDate }: { context: Context; today: string; year: number; actions?: ReactNode; requestedDate?: string }) {
  const start = `${year}-03-01`;
  const end = addDays(`${year + 1}-03-01`, -1);
  const [clock, setClock] = useState<ReturnType<typeof seoulClock> | null>(null);
  useEffect(() => {
    const tick = () => setClock(seoulClock(new Date()));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 10_000);
    window.document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); };
  }, []);
  const liveToday = clock?.date ?? today;
  const thisYear = liveToday >= start && liveToday <= end;
  const initialDate = thisYear ? today : c.operations?.effectiveTimetables?.[0]?.starts_on ?? c.semesters[0]?.start_date ?? start;
  const clamp = (value: string) => value < start ? start : value > end ? end : value;
  const validDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && !Number.isNaN(Date.parse(requestedDate));
  const [date, setDate] = useState(validDate ? clamp(requestedDate!) : clamp(initialDate));
  const [selectedMode, setMode] = useState<TimetableMode | null>(validDate ? "weekly" : null);
  const [audience, setAudience] = useState<TimetableAudience>("mine");
  const [teacher, setTeacher] = useState("");
  const [classId, setClassId] = useState("");
  const [teacherQuery, setTeacherQuery] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const defaultMode = timetableModeForWeek(c, date);
  const mode = selectedMode ?? defaultMode;
  const week = useMemo(() => timetableWeek(c, date, mode, true), [c, date, mode]);
  const firstDate = week.weekdays[0].date;
  const lastDate = week.weekdays[4].date;
  const endLabel = firstDate.slice(0, 7) === lastDate.slice(0, 7)
    ? `${Number(lastDate.slice(8))}일` : dateLabel(lastDate);
  const document = week.schedule.document;
  const teachers = new Map<string, string>([
    ...week.weekdays.flatMap((day) => day.cells.filter((cell) => cell.teacherId && cell.teacher).map((cell) => [cell.teacherId, cell.teacher] as const)),
    ...(c.operations?.directory ?? []).filter((t) => t.active).map((t) => [t.id, t.display_name] as const),
    ...(document?.teachers ?? []).map((t) => [t.id, t.label] as const),
  ]);
  const classes = new Map([
    ...c.classes.map((cls) => [cls.id, `${cls.grade}학년 ${cls.class_number}반`] as const),
    ...(document?.classes ?? []).map((cls) => [cls.id, cls.label] as const),
  ]);
  const mine = c.operations?.directory.find((t) => t.user_id === c.userId && t.active);
  const myIds = myTeacherIds(c);
  const selectedTeacher = teachers.has(teacher) ? teacher : teachers.keys().next().value ?? "";
  const selectedClass = classes.has(classId) ? classId : classes.keys().next().value ?? "";
  const normalized = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko");
  const sortedTeachers = [...teachers].sort((a, b) => a[1].localeCompare(b[1], "ko"));
  const matchingTeachers = sortedTeachers.filter(([, name]) => normalized(name).includes(normalized(teacherQuery)));
  const teacherOptions = matchingTeachers.some(([id]) => id === selectedTeacher) ? matchingTeachers : [...sortedTeachers.filter(([id]) => id === selectedTeacher), ...matchingTeachers];
  const term = c.semesters.find((s) => date >= s.start_date && date <= s.end_date);
  const visible = (cell: TimetableCell) => {
    switch (audience) {
      case "mine": return myIds.has(cell.teacherId);
      case "teacher": return cell.teacherId === selectedTeacher;
      case "class": return cell.classIds.includes(selectedClass);
    }
  };
  const available = week.rows > 0;
  const label = audience === "teacher" ? teachers.get(selectedTeacher) :
    audience === "class" ? classes.get(selectedClass) : audiences[audience];
  return (
    <section className="official-timetable reader-surface">
      <Modal open={dateOpen} onOpenChange={setDateOpen} title="날짜 이동" description="조회할 날짜를 선택하세요.">
        <label className="field reader-date-dialog-field">기준 날짜
          <input type="date" aria-label="기준 날짜" value={date} min={start} max={end} onChange={e => { if (e.target.value) { setDate(clamp(e.target.value)); setDateOpen(false); } }} />
        </label>
      </Modal>
      <div className="official-timetable-controls no-print">
        <ReaderPeriodNavigator title={mode === "weekly" ? `${dateLabel(firstDate)} – ${dateLabel(lastDate)}` : dateLabel(date)} subtitle={term ? `${term.number}학기` : undefined}
          onTitleClick={() => { setMoreOpen(false); setDateOpen(true); }}
          previousLabel="이전 주" nextLabel="다음 주"
          previous={mode === "weekly" && addDays(firstDate, -1) >= start ? () => setDate(clamp(addDays(date, -7))) : undefined}
          next={mode === "weekly" && addDays(firstDate, 7) <= end ? () => setDate(clamp(addDays(date, 7))) : undefined}
          todayDisabled={!thisYear} today={() => { setDate(liveToday); setMode("weekly"); }} />
        <div className="timetable-view-toolbar reader-timetable-view">
          <ReaderViewSegment<TimetableMode> options={[{value:"weekly",label:"주간"},{value:"basic",label:"기본"}]} value={mode} onChange={setMode} label="시간표 보기 방식" />
          <Button type="button" className="reader-more-toggle" variant="outline" size="icon" aria-label="시간표 더보기" aria-expanded={moreOpen} aria-controls="timetable-secondary-controls" onClick={() => setMoreOpen(open => !open)}><Ellipsis size={20} /></Button>
          {moreOpen && <div id="timetable-secondary-controls" className="reader-secondary-controls">
                <label className="reader-desktop-date">날짜 이동
                  <input type="date" aria-label="기준 날짜" value={date} min={start} max={end} onChange={(e) => {
                    if (e.target.value) { setDate(clamp(e.target.value)); setMoreOpen(false); }
                  }} />
                </label>
                {c.semesters.length > 0 && <label>학기 이동
                  <select value={term?.number ?? ""} onChange={(e) => {
                    const chosen = c.semesters.find((s) => s.number === Number(e.target.value));
                    if (chosen) { setDate(chosen.start_date); setMoreOpen(false); }
                  }}>
                    {!term && <option value="" disabled>학기 선택</option>}
                    {c.semesters.map((s) => <option key={s.number} value={s.number}>{s.number}학기</option>)}
                  </select>
                </label>}
                <Button variant="outline" disabled={!available} onClick={() => window.print()}><Printer size={16} /> 인쇄·PDF 저장</Button>
                {mode === "basic" && (week.schedule.startsOn || week.schedule.publishedAt) && <details className="timetable-publication-info"><summary>시간표 정보</summary><dl>{week.schedule.startsOn && <><dt>적용 기간</dt><dd>{week.schedule.startsOn} ~ {week.schedule.endsOn}</dd></>}{week.schedule.publishedAt && <><dt>공개일</dt><dd>{week.schedule.publishedAt.slice(0,10)}</dd></>}</dl></details>}
                {actions}
          </div>}
        </div>
        <ReaderViewSegment<TimetableAudience> className="official-timetable-tabs reader-audience" options={Object.entries(audiences).map(([value, label]) => ({ value: value as TimetableAudience, label }))} value={audience} label="시간표 조회 대상" onChange={(value) => { setAudience(value); setTeacherQuery(""); }} />
        {(audience === "teacher" || audience === "class") && <div className="official-timetable-filters reader-target-filters">
          {audience === "teacher" && (
            <div className="timetable-teacher-picker">
              <label className="timetable-teacher-search"><Search size={16} aria-hidden="true" /><input type="search" value={teacherQuery} placeholder="교사 이름 검색" aria-label="교사 이름 검색" onChange={(e) => setTeacherQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && matchingTeachers.length === 1) { e.preventDefault(); setTeacher(matchingTeachers[0][0]); setTeacherQuery(""); } }} /></label>
              <label>교사
                <select value={selectedTeacher} onChange={(e) => { setTeacher(e.target.value); setTeacherQuery(""); }}>
                  {teacherOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              {!!teacherQuery.trim() && <span className="timetable-teacher-matches" role="status">{matchingTeachers.length ? `검색 결과 ${matchingTeachers.length}명` : "일치하는 교사가 없습니다."}</span>}
              {!!teacherQuery.trim() && matchingTeachers.length === 1 && matchingTeachers[0][0] !== selectedTeacher && <Button variant="outline" size="sm" onClick={() => { setTeacher(matchingTeachers[0][0]); setTeacherQuery(""); }}>{matchingTeachers[0][1]} 시간표 보기</Button>}
            </div>
          )}
          {audience === "class" && (
            <label>학급
              <select value={selectedClass} onChange={(e) => setClassId(e.target.value)}>
                {[...classes].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          )}
        </div>}
      </div>
      <header className="official-timetable-caption timetable-print-only" data-mode={mode}>
        <strong className="timetable-print-title">{label}</strong>
        {mode === "weekly" && <p>{dateLabel(firstDate)} – {endLabel}</p>}
        {mode === "basic" && week.schedule.startsOn && (
          <p>적용 {week.schedule.startsOn} ~ {week.schedule.endsOn}
            {week.schedule.publishedAt && ` · 공개 ${week.schedule.publishedAt.slice(0, 10)}`}
          </p>
        )}
      </header>
      {defaultMode === "basic" && week.schedule.document && (audience !== "mine" || mine) && (
        <div className="timetable-calendar-note">
          <p>이 주에 적용되는 공개 학사일정이 없습니다. {mode === "basic" && "기본 시간표를 표시합니다."}</p>
          {mode === "weekly" && <Button variant="outline" onClick={() => setMode("basic")}>기본 시간표 보기</Button>}
        </div>
      )}
      {audience === "mine" && !mine ? (
        <p className="panel official-timetable-empty">교원 명부에 계정이 연결되면 나의 시간표를 볼 수 있습니다. 학교 관리자에게 연결을 요청하세요.</p>
      ) : !available ? (
        <p className="panel official-timetable-empty">선택한 기간에 공개된 시간표가 없습니다.</p>
      ) : (
        <TimetableGrid week={week} mode={mode} audience={audience} label={label ?? "요일별 시간표"} visible={visible} today={liveToday} currentMinutes={clock?.minutes} showFreePeriods showChangeBadges />
      )}
    </section>
  );
}

"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal, Notice } from "@/components/common";
import { annualSchema, calculateAcademic, defaultAnnual, dayTypes, isTeachingDay, summarizeAcademicDays, type AnnualPlan } from "@/lib/academic";
import { calendarTabs, calendarDayRule, calendarChangeSchema, eventDraft, eventChange, type CalendarChange, type CalendarEvent, type CalendarHistory, type CalendarState, type CalendarConflict, type EventDraft } from "@/lib/academic-calendar";
import { curriculumTargets, datePeriod, hoursRange } from "@/lib/academic-rebuild";
import { sameAnnualValue } from "@/lib/academic-revisions";
import { parseAcademicConfirmation } from "@/lib/academic-confirmation";
import { loadCalendarState, saveCalendarChanges, confirmAcademicCalendar, previewHolidays } from "@/app/actions";
import type { Context } from "@/lib/models";
import { AnnualAcademic } from "./annual-academic";
import { AcademicWorkbookPanel } from "./academic-workbook-panel";
import { DateFields, EventFields } from "./academic-calendar-editors";
import "./academic-calendar.css";

type DayEdit = { kind: "day"; date: string; before: AnnualPlan["days"][string] | null; value: AnnualPlan["days"][string]; initial: AnnualPlan["days"][string] };
type EventEdit = { kind: "event"; value: EventDraft; initial: EventDraft; base: AnnualPlan };
type RangeEdit = { kind: "range"; from: string; to: string; rule: AnnualPlan["days"][string]; replace: string[]; base: AnnualPlan };
type Edit = DayEdit | EventEdit | RangeEdit;
const weekdays = ["일","월","화","수","목","금","토"];
const json = (value: unknown) => JSON.stringify(value, null, 2);

export function AcademicCalendar({ context, today, onDirtyChange, preview = false }: {
  context: Context; today: string; onDirtyChange?: (value: boolean) => void; preview?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof calendarTabs)[number]>("연간 학사력");
  const [local, setLocal] = useState<CalendarState | null>(null);
  const [history, setHistory] = useState<CalendarHistory[]>([]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);
  const [message, setMessage] = useState({ text: "", error: false });
  const [next, setNext] = useState<(() => void) | null>(null);
  const [conflict, setConflict] = useState<{ changes: CalendarChange[]; rows: CalendarConflict[] } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restore, setRestore] = useState<CalendarHistory | null>(null);
  const [tools, setTools] = useState(false);
  const [toolsDirty, setToolsDirty] = useState(false);
  const [date, setDate] = useState(context.year && today >= `${context.year.year}-03-01` && today < `${context.year.year+1}-03-01` ? today : `${context.year?.year ?? 2027}-03-01`);
  const [month, setMonth] = useState(date.slice(0,7));
  const [semester, setSemester] = useState(0);
  const [grade, setGrade] = useState(context.grades[0]);
  const useLocal = !!local && (local.annual?.version ?? 0) > (context.annual?.version ?? 0);
  const c = useMemo(() => useLocal && local ? { ...context, annual: local.annual, events: local.events } : context, [context, local, useLocal]);
  const parsed = useMemo(() => annualSchema.safeParse(c.annual?.document ?? defaultAnnual()), [c.annual?.document]);
  const plan = parsed.success ? parsed.data : defaultAnnual();
  const year = c.year?.year ?? 2027;
  const report = useMemo(() => calculateAcademic(year, plan, c.grades, c.semesters, c.classes), [year, plan, c.grades, c.semesters, c.classes]);
  const eventTitlesByDate = useMemo(() => {
    const byDate = new Map<string, string[]>();
    for (const day of report.days) {
      const titles = c.events
        .filter((event) => event.start_date <= day.date && event.end_date >= day.date)
        .map((event) => event.title.trim())
        .filter(Boolean);
      if (titles.length) byDate.set(day.date, [...new Set(titles)]);
    }
    return byDate;
  }, [report.days, c.events]);
  const days = new Map(report.days.map((d) => [d.date,d]));
  const months = [...new Set(report.days.map((d) => d.date.slice(0,7)))];
  const counts = summarizeAcademicDays(report.days,plan);
  const targets = curriculumTargets(year,c);
  const admin = c.role === "admin" && !preview;
  const confirmation = parseAcademicConfirmation(c.annual?.calendar_confirmation);
  const sourceChanged = confirmation && (!sameAnnualValue(confirmation.source.events,c.events) ||
    !sameAnnualValue(confirmation.source.classes ?? [],c.classes) || !sameAnnualValue(confirmation.source.semesters,c.semesters) ||
    !sameAnnualValue(confirmation.source.hours,c.hours) || !sameAnnualValue(confirmation.source.plans,c.plans));
  const status = !confirmation ? "초안" : confirmation.version === c.annual?.version && !sourceChanged ? "확정" : "재확인 필요";
  const sinceConfirmed = confirmation ? history.filter((h) => h.created_at > confirmation.at) : [];
  const summer = plan.vacations.some((v) => /여름|하계/.test(v.name)) || Object.values(plan.days).some((d) => d.type === "vacation" && d.enabled && /여름|하계/.test(d.name));
  const dirty = toolsDirty || !!edit && (edit.kind === "range" || !sameAnnualValue(edit.value,edit.initial));
  const editable = admin && parsed.success;

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty,onDirtyChange]);
  const revision = context.events.map((e) => `${e.id}:${e.version}`).join(",");
  useEffect(() => {
    if (preview || !context.year) return;
    let active = true;
    startTransition(async () => {
      const result = await loadCalendarState(context.workspace.id,context.year!.id);
      if (!active) return;
      if (result.ok) { setHistory(result.data.history); setLocal(result.data); }
      else setMessage({ text: `저장 이력을 불러오지 못했습니다. ${result.error}`, error: true });
    });
    return () => { active = false; };
  }, [context.workspace.id,context.year,context.annual?.version,revision,preview]);

  function move(action: () => void) {
    if (saving.current) return;
    if (dirty) setNext(() => action); else action();
  }
  function openDate(value: string) { move(() => {
    setDate(value); setMonth(value.slice(0,7));
    const rule = calendarDayRule(value,plan,c);
    setEdit({ kind: "day", date: value, value: rule, initial: structuredClone(rule), before: plan.days[value] ?? null });
  }); }
  function openEvent(event?: CalendarEvent) { move(() => {
    try {
      const value = eventDraft(event ?? { id: crypto.randomUUID(), workspace_id: c.workspace.id, school_id: null,
        academic_year_id: c.year!.id, title: "", start_date: date, end_date: date, event_type: "school", target_grades: [grade],
        department: "", description: "", activity_area: "없음", version: 0, created_by: c.userId,
        updated_at: "", target_class_ids: [] },plan);
      if (!value.event.target_grades.length) value.event.target_grades = [...c.grades];
      setTab("행사 편성"); setEdit({ kind: "event", value, initial: structuredClone(value), base: structuredClone(plan) });
    } catch (error) { setMessage({ text: (error as Error).message, error: true }); }
  }); }
  function changesFor(current: Edit): CalendarChange[] {
    if (current.kind === "day") return [{ kind: "day", date: current.date, before: current.before, value: current.value }];
    if (current.kind === "event") return [eventChange(current.value,c,current.base)];
    return datePeriod(year,current.from,current.to,current.base).filter((d) => !d.conflict || current.replace.includes(d.date))
      .map((d) => ({ kind: "day", date: d.date, before: current.base.days[d.date] ?? null, value: current.rule }));
  }
  async function commit(changes: CalendarChange[], operation = "수정"): Promise<boolean> {
    if (saving.current || !editable || !c.year) return false;
    if (!changes.length) { setMessage({ text: "적용할 날짜를 선택해 주세요.", error: true }); return false; }
    for (const change of changes) {
      const valid = calendarChangeSchema.safeParse(change);
      if (!valid.success) { setMessage({ text: valid.error.issues[0].message, error: true }); return false; }
    }
    saving.current = true; setMessage({ text: "", error: false });
    try {
      const result = await saveCalendarChanges({ workspaceId: c.workspace.id, yearId: c.year.id, changes, operation });
      if (!result.ok) { setMessage({ text: result.error, error: true }); return false; }
      if (result.data.state) { setLocal(result.data.state); setHistory(result.data.state.history); }
      if (!result.data.ok) { setConflict({ changes, rows: result.data.conflicts ?? [] }); return false; }
      setConflict(null); setMessage({ text: "서버에 저장했습니다.", error: false });
      const latest = result.data.state;
      setEdit((old) => {
        if (!old) return null;
        if (old.kind === "day") return { ...old, before: old.value, initial: structuredClone(old.value) };
        if (old.kind === "event" && latest?.annual) {
          const savedEvent = latest.events.find((e) => e.id === old.value.event.id);
          if (!savedEvent) return null;
          const savedPlan = annualSchema.parse(latest.annual.document), value = eventDraft(savedEvent,savedPlan);
          return { kind: "event", value, initial: structuredClone(value), base: savedPlan };
        }
        return null;
      });
      router.refresh(); return true;
    } catch (error) { setMessage({ text: `저장하지 못했습니다. 입력 내용을 유지합니다. ${(error as Error).message}`, error: true }); return false; }
    finally { saving.current = false; }
  }
  async function saveEdit() {
    if (!edit) return true;
    try { return await commit(changesFor(edit)); }
    catch (error) { setMessage({ text: (error as Error).message, error: true }); return false; }
  }
  function retryChanges() {
    if (!conflict) return;
    const changes = conflict.changes.map((change) => {
      const key = change.kind === "day" ? `day:${change.date}` : change.kind === "event" ? `event:${change.id}` : "holidays";
      const row = conflict.rows.find((r) => r.key === key);
      if (!row) return change;
      if (change.kind === "event") {
        const saved = row.saved as { event: CalendarEvent | null; allocations: AnnualPlan["allocations"] };
        return { ...change, version: saved.event?.version ?? 0, beforeAllocations: saved.allocations };
      }
      return { ...change, before: row.saved } as CalendarChange;
    });
    startTransition(async () => { await commit(changes,"충돌 확인 후 저장"); });
  }
  function restoreChange(row: CalendarHistory): CalendarChange {
    if (row.item_key.startsWith("day:")) {
      const d = row.item_key.slice(4);
      return { kind: "day", date: d, before: plan.days[d] ?? null, value: row.before_value as DayEdit["before"] };
    }
    if (row.item_key === "holidays") return { kind: "holidays", before: plan.holidays, value: row.before_value as AnnualPlan["holidays"] };
    const id = row.item_key.slice(6), saved = c.events.find((e) => e.id === id);
    const before = row.before_value as { event: CalendarEvent | null; allocations: AnnualPlan["allocations"] };
    return calendarChangeSchema.parse({ kind: "event", id, version: saved?.version ?? 0,
      value: before.event ? { ...before.event, target_class_ids: before.event.target_class_ids ?? [] } : null,
      beforeAllocations: plan.allocations.filter((a) => a.eventId === id), allocations: before.allocations });
  }
  if (!c.year) return <div className="ar"><p className="ar-callout">학교 설정에서 학년도를 생성하면 연간 학사력을 바로 편성할 수 있습니다.</p></div>;
  if (tools) return <div><div className="ar ar-entry"><button onClick={() => move(() => { setTools(false); setToolsDirty(false); })}>← 공식 학사일정으로 돌아가기</button></div><AnnualAcademic context={c} today={today} onDirtyChange={setToolsDirty}/>
    <Modal open={!!next} onOpenChange={() => setNext(null)} title="저장하지 않은 변경 내용" description="기본 운영·자료 관리 화면의 저장 버튼으로 먼저 저장하거나 변경을 취소할 수 있습니다."><button onClick={() => { const action = next; setNext(null); action?.(); }}>변경 취소 후 이동</button></Modal></div>;
  const monthly = c.events.filter((e) => e.start_date.slice(0,7) <= month && e.end_date.slice(0,7) >= month);
  const rangeRows = edit?.kind === "range" ? datePeriod(year,edit.from,edit.to,edit.base) : [];
  const projected = edit?.kind === "range" ? { ...plan, days: { ...plan.days, ...Object.fromEntries(rangeRows.filter((r) => !r.conflict || edit.replace.includes(r.date)).map((r) => [r.date,edit.rule])) } } : plan;
  const projectedReport = edit?.kind === "range" ? calculateAcademic(year,projected,c.grades,c.semesters,c.classes) : report;
  const changedDays = projectedReport.days.filter(isTeachingDay).length-counts.total;
  return <div className="ar">
    <header className="ar-line"><div><h2>{year}학년도 학사일정</h2><p className="ar-muted">{c.workspace.name} · {status}{!admin ? " · 조회 전용" : ""}</p></div>
      <div className="ar-tools"><button onClick={() => move(() => { setEdit(null); setHistoryOpen(true); })}>{confirmation ? `확정 후 변경 ${sinceConfirmed.length}건` : "수정 이력"}</button>
        <button onClick={() => move(() => { setEdit(null); setTools(true); })}>기본 운영·자료 관리</button>
        {admin && <button disabled={!c.annual || pending || dirty} onClick={() => setConfirmOpen(true)}>편성안 확정</button>}
      </div></header>
    <Notice message={message.text} error={message.error}/>
    {!parsed.success && <p role="alert" className="ar-callout">기존 자료 형식을 확인해야 합니다. 원본을 보존하고 편집을 중지했습니다. 기본 운영·자료 관리에서 백업을 확인하세요.</p>}
    <nav className="ar-tabs" data-arrow-axis="horizontal" aria-label="학사일정 메뉴">{calendarTabs.map((t) => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => move(() => { setTab(t); setEdit(null); })}>{t}</button>)}</nav>
    {tab === "연간 학사력" && <>
      <div className="ar-line"><div className="ar-tools"><span className="ar-legend ar-day-weekend">주말</span><span className="ar-legend ar-day-holiday">공휴일</span><span className="ar-legend ar-day-vacation">방학</span><span className="ar-legend ar-day-closed">휴업일</span><span>↔ 요일교체</span></div>
        {editable && <div className="ar-tools"><button disabled={pending} onClick={() => move(() => setEdit({ kind: "range", from: date, to: date, rule: { type: "vacation", name: "여름방학", enabled: true, weekday: 1 }, replace: [], base: structuredClone(plan) }))}>기간 설정</button>
          <button disabled={pending || dirty} onClick={() => startTransition(async () => {
            const before = plan.holidays;
            const result = await previewHolidays(c.workspace.id,year);
            if (!result.ok || !result.data.ok) { setMessage({ text: "공휴일을 불러오지 못했습니다. 기존 일정은 유지됩니다. 다시 시도해 주세요.", error: true }); return; }
            await commit([{ kind: "holidays", before, value: { ...before,...result.data.days } }],"공휴일 갱신");
          })}>공휴일 불러오기·재시도</button></div>}
      </div>
      {!summer && <p className="ar-callout">여름방학이 미설정되어 학기별 수업일수는 잠정값입니다. 여름방학 이후 첫 수업일로 2학기 시작일을 계산합니다.</p>}
      <div className="ar-scroll"><table className="ar-annual"><caption className="sr-only">{year}학년도 3월부터 다음 해 2월까지 연간 학사력</caption><thead><tr><th>일</th>{months.map((m) => <th key={m}>{Number(m.slice(5))}월</th>)}</tr></thead>
        <tbody>{Array.from({ length: 31 },(_,i) => <tr key={i}><th>{i+1}</th>{months.map((m) => {
          const d = days.get(`${m}-${String(i+1).padStart(2,"0")}`);
          if (!d) return <td key={m} className="ar-empty-day" />;
          const notes = [...new Set([
            ...(d.name.trim() ? [d.name.trim()] : d.type === "swap" ? ["요일 교체"] : []),
            ...(eventTitlesByDate.get(d.date) ?? []),
          ])];
          const weekday = weekdays[new Date(d.date+"T12:00:00Z").getUTCDay()];
          const fullLabel = `${d.date} ${dayTypes[d.type]}${notes.length ? ` · ${notes.join(" · ")}` : ""}`;
          return <td key={m}>
            <button data-arrow-activate="date" aria-label={fullLabel} aria-pressed={date === d.date} className={`ar-day-${d.type === "discretionary" ? "closed" : d.type}`}
              title={fullLabel} onClick={() => openDate(d.date)}>
              <span className="ar-cell-top">
                <span className="ar-cell-weekday">{weekday}{d.type === "swap" ? `↔${weekdays[d.weekday]}` : ""}{!d.enabled ? " ×" : ""}</span>
                {notes.length > 2 && <span className="ar-cell-more">+{notes.length - 2}</span>}
              </span>
              {notes.slice(0, 2).map((note, index) =>
                <span className="ar-cell-note" key={`${index}-${note}`}>{note}</span>
              )}
            </button>
          </td>;
        })}</tr>)}</tbody></table></div>
      <details className="ar-panel"><summary>수업일수 확인 · 연간 {counts.total}일</summary><p>1학기 {counts.semesters[0]}일 · 2학기 {summer ? `${counts.semesters[1]}일` : "미확정"}</p></details>
    </>}
    {tab === "행사 편성" && <>
      <div className="ar-line"><label>조회 월 <select value={month} onChange={(e) => move(() => { setMonth(e.target.value); setDate(e.target.value+"-01"); setEdit(null); })}>{months.map((m) => <option key={m}>{m}</option>)}</select></label>
        <div className="ar-tools"><button onClick={() => move(() => { setTab("연간 학사력"); setEdit(null); })}>선택 날짜의 학사력</button>{editable && <button className="ar-primary" onClick={() => openEvent()}>행사 등록</button>}</div></div>
      <div className="ar-duo"><section className="ar-panel"><h3>{month} 월간 달력</h3><div className="ar-month" data-arrow-columns="7" aria-label="월간 달력, 방향키로 이동">{weekdays.map((w) => <strong key={w}>{w}</strong>)}
        {Array.from({ length: new Date(month+"-01T12:00:00Z").getUTCDay() },(_,i) => <span key={`blank${i}`}/>)}
        {report.days.filter((d) => d.date.startsWith(month)).map((d) => <button key={d.date} aria-label={`${d.date} 선택`} aria-pressed={date === d.date} onClick={() => move(() => { setDate(d.date); setEdit(null); })}>{Number(d.date.slice(8))}{monthly.some((e) => e.start_date <= d.date && d.date <= e.end_date) && <sup>●</sup>}</button>)}</div></section>
        <section className="ar-panel"><h3>월 전체 행사 · {monthly.length}건</h3>{monthly.length ? monthly.map((e) => <div className={`ar-event-summary ${e.start_date <= date && date <= e.end_date ? "ar-focus" : ""}`} key={e.id}>
          <button onClick={() => openEvent(e)}>{e.title}</button><p>{e.start_date}~{e.end_date} · {e.target_grades.join(", ")}학년</p></div>) : <p>등록된 행사가 없습니다.</p>}</section></div>
    </>}
    {edit?.kind === "event" && tab === "행사 편성" && <section className="ar-panel"><div className="ar-line"><h3>{edit.value.event.version ? "행사 편집" : "행사 등록"}</h3><button onClick={() => move(() => setEdit(null))}>닫기</button></div>
      <EventFields key={edit.value.event.id} value={edit.value} onChange={(value) => setEdit({ ...edit,value })} context={c} plan={plan} disabled={!editable || pending}/>
      {editable && <div className="ar-tools"><button className="ar-primary" disabled={pending} onClick={() => startTransition(async () => { await saveEdit(); })}>{pending ? "저장 중…" : "행사·교시 편성 저장"}</button>
        {!!edit.value.event.version && <button onClick={() => setRestore({ id: -1,item_key: "delete",before_value: null,after_value: null,actor_id: "",created_at: "",operation: "행사 삭제" })}>행사 삭제</button>}
      </div>}</section>}
    {(tab === "시수 확인" || tab === "편성 점검") && <>
      <div className="ar-tools"><label>집계 범위 <select value={semester} onChange={(e) => setSemester(Number(e.target.value))}><option value={0}>연간</option><option value={1}>1학기</option><option value={2}>2학기</option></select></label>
        <label>상세 학년 <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>{c.grades.map((g) => <option key={g} value={g}>{g}학년</option>)}</select></label></div>
      <Hours context={c} plan={plan} semester={semester} grade={grade}/>
      {tab === "편성 점검" && <section className="ar-panel"><h3>확인 필요 항목 · {report.warnings.length}건</h3>{report.warnings.length ? report.warnings.map((w) => <p key={w}>{w}</p>) : <p>저장된 배정에서 교시 중복이나 운영 범위 이탈이 확인되지 않았습니다.</p>}
        {!summer && <p>여름방학 미설정: 학기 경계 확인 필요</p>}{targets.some((t) => t.subject == null) && <p>교육과정 편성의 교과 목표 시수 설정 필요</p>}
        <p className="ar-muted">개별 교과의 시간표 배치는 이 단계의 오류로 처리하지 않습니다.</p></section>}
    </>}
    {tab === "Excel 출력" && <AcademicWorkbookPanel year={year} plan={plan} context={c} currentStatus={status} confirmed={confirmation}/>}
    {edit?.kind === "day" && tab === "연간 학사력" && <section className="ar-popup ar-panel" role="dialog" aria-label="날짜 편집" aria-modal={false} onKeyDown={(e) => { if (e.key === "Escape") move(() => setEdit(null)); }}>
      <div className="ar-line"><h3>{edit.date}</h3><button aria-label="날짜 편집 닫기" onClick={() => move(() => setEdit(null))}>닫기</button></div>
      <DateFields value={edit.value} onChange={(value) => setEdit({ ...edit,value })} context={c} disabled={!editable || pending}/>
      <div className="ar-date-actions">
        {editable && <button className="ar-primary" disabled={pending} onClick={() => startTransition(async () => { await saveEdit(); })}>{pending ? "저장 중…" : "저장"}</button>}
      </div>{dirty && <p className="ar-muted">저장하지 않은 변경 내용</p>}
    </section>}
    <Modal open={edit?.kind === "range"} onOpenChange={(open) => { if (!open) move(() => setEdit(null)); }} title="기간 설정 · 변경 미리보기" description="기존 공휴일과 개별 설정은 기본적으로 유지합니다. 변경할 충돌 날짜만 선택하세요." wide>
      {edit?.kind === "range" && <div className="ar"><div className="ar-fields"><label>시작일<input type="date" value={edit.from} onChange={(e) => setEdit({ ...edit,from:e.target.value })}/></label><label>종료일<input type="date" value={edit.to} onChange={(e) => setEdit({ ...edit,to:e.target.value })}/></label></div>
        <DateFields value={edit.rule} onChange={(rule) => setEdit({ ...edit,rule })} context={c} disabled={pending}/>
        <p>전체 {rangeRows.length}일 · 변경 {rangeRows.filter((r) => !r.conflict || edit.replace.includes(r.date)).length}일 · 수업일수 {changedDays >= 0 ? "+" : ""}{changedDays}일</p>
        <p>{c.grades.map((g) => `${g}학년 운영 시수 ${projectedReport.totals.filter((t) => t.grade===g).reduce((n,t) => n+t.hours,0)-report.totals.filter((t) => t.grade===g).reduce((n,t) => n+t.hours,0)}`).join(" · ")}</p>
        <div className="ar-range-rows">{rangeRows.map((r) => <div key={r.date}>{r.conflict && <input aria-label={`${r.date} 기존 설정 변경`} type="checkbox" checked={edit.replace.includes(r.date)} onChange={(e) => setEdit({ ...edit, replace: e.target.checked ? [...edit.replace,r.date] : edit.replace.filter((d) => d!==r.date) })}/>} {r.date} · {r.conflict || dayTypes[days.get(r.date)!.type]} → {r.conflict && !edit.replace.includes(r.date) ? "기존 유지" : `${dayTypes[edit.rule.type]} ${edit.rule.name}`}</div>)}</div>
        <button className="ar-primary" disabled={pending || !rangeRows.length} onClick={() => startTransition(async () => { await saveEdit(); })}>미리본 변경 적용</button></div>}
    </Modal>
    <Modal open={!!next} onOpenChange={() => setNext(null)} title="저장하지 않은 변경 내용" description="입력 내용을 저장한 뒤 이동하거나 변경을 취소할 수 있습니다."><div className="ar ar-tools">
      <button disabled={pending} className="ar-primary" onClick={() => startTransition(async () => { if (await saveEdit()) { const action = next; setNext(null); action?.(); } })}>저장 후 이동</button>
      <button disabled={pending} onClick={() => { const action = next; setNext(null); action?.(); }}>변경 취소 후 이동</button><button onClick={() => setNext(null)}>이동 취소</button></div></Modal>
    <Modal open={!!conflict} onOpenChange={() => setConflict(null)} title="같은 항목의 저장 충돌" description="다른 관리자의 저장본과 현재 입력을 모두 보존했습니다. 비교한 후 처리 방법을 선택하세요." wide><div className="ar">
      {conflict?.rows.map((row) => <div key={row.key}><strong>{row.key}</strong><div className="ar-duo"><div><h3>서버 저장본</h3><pre>{json(row.saved)}</pre></div><div><h3>내 입력 내용</h3><pre>{json(row.incoming)}</pre></div></div></div>)}
      <div className="ar-tools"><button onClick={() => { setConflict(null); setEdit(null); router.refresh(); }}>저장본 불러오기</button><button disabled={pending} onClick={retryChanges}>비교 완료 · 내 입력으로 저장</button><button onClick={() => setConflict(null)}>내 입력 유지하며 닫기</button></div></div></Modal>
    <Modal open={confirmOpen} onOpenChange={setConfirmOpen} title="현재 편성안 확정" description="현재 날짜·행사·기준 정보를 함께 보존합니다. 확정 후에도 수정할 수 있으며, 변경하면 재확인 필요 상태로 표시됩니다."><div className="ar"><p>편성 경고 {report.warnings.length}건 · {summer ? "학기 경계 설정됨" : "학기 경계 미확정"}</p><button className="ar-primary" disabled={pending || dirty} onClick={() => startTransition(async () => {
      const result = await confirmAcademicCalendar({ workspaceId: c.workspace.id,yearId:c.year!.id,version:c.annual?.version });
      setMessage({ text: result.ok ? "확정본을 보존했습니다." : result.error,error:!result.ok }); if(result.ok) { setConfirmOpen(false); router.refresh(); }
    })}>현재 저장본 확정</button></div></Modal>
    <Modal open={historyOpen} onOpenChange={setHistoryOpen} title="날짜·행사 수정 이력" description="최근 200건입니다. 이전 형식의 저장 이력은 기본 운영·자료 관리에서 확인할 수 있습니다." wide><div className="ar"><div className="ar-range-rows">{history.length ? history.map((h) => <details key={h.id}><summary>{h.item_key} · {new Date(h.created_at).toLocaleString("ko-KR")} · {h.operation}{confirmation && h.created_at>confirmation.at ? " · 재확인 전" : ""}</summary><p>작성자 {c.members.find((m) => m.user_id === h.actor_id)?.display_name ?? h.actor_id}</p><div className="ar-duo"><pre>{json(h.before_value)}</pre><pre>{json(h.after_value)}</pre></div>{editable && <button onClick={() => setRestore(h)}>변경 전 상태 복원</button>}</details>) : <p>이 화면에서 저장한 항목별 변경 이력이 없습니다.</p>}</div></div></Modal>
    <Modal open={!!restore} onOpenChange={() => setRestore(null)} title={restore?.item_key === "delete" ? "행사 삭제" : "변경 전 상태 복원"} description="현재 저장본을 확인한 뒤 새 변경 이력으로 기록합니다. 다른 관리자가 동시에 수정하면 충돌을 확인합니다."><div className="ar"><pre>{restore?.item_key === "delete" ? edit?.kind === "event" && edit.value.event.title : json(restore?.before_value)}</pre><button disabled={pending} onClick={() => startTransition(async () => {
      if (!restore) return;
      try { const change = restore.item_key === "delete" && edit?.kind === "event" ? eventChange(edit.value,c,edit.base,true) : restoreChange(restore);
        if(await commit([change],restore.item_key === "delete" ? "삭제" : "복원")) setRestore(null);
      } catch(error) { setMessage({ text:(error as Error).message,error:true }); }
    })}>{restore?.item_key === "delete" ? "행사와 교시 배정 삭제" : "복원 저장"}</button></div></Modal>
  </div>;
}

function Hours({ context: c, plan, semester, grade }: { context: Context; plan: AnnualPlan; semester: number; grade: number }) {
  const report = calculateAcademic(c.year!.year,plan,c.grades,c.semesters,c.classes);
  const targets = curriculumTargets(c.year!.year,c);
  const byGrade = c.grades.map((g) => {
    const goalRows = targets.filter((t) => t.grade === g && (!semester || t.semester === semester));
    const goal = goalRows.every((t) => t.subject != null) ? goalRows.reduce((n,t) => n+t.subject!,0) : null;
    const classes = c.classes.filter((cl) => cl.grade === g);
    const scopes = classes.length ? classes.map((cl) => ({ name: `${g}학년 ${cl.class_number}반`,rows:report.classTotals.filter((r) => r.classId === cl.id && (!semester || r.semester === semester)) })) : [{ name:`${g}학년 공통`, rows:report.totals.filter((r) => r.grade===g && (!semester || r.semester===semester)) }];
    return { grade:g,goal,rows:scopes.map(({ name,rows }) => {
      const counts = Object.fromEntries(["교과","자율","자율·자치","동아리","진로","봉사","학교자율시간"].map((a) => [a,rows.reduce((n,r) => n+(r.counts[a]??0),0)]));
      return { name,counts,hours:rows.reduce((n,r) => n+r.hours,0),conflicts:rows.reduce((n,r) => n+r.conflicts,0),unconfigured:rows.some((r) => r.unconfigured>0) };
    }) };
  });
  return <><div className="ar-scroll"><table className="ar-hours"><thead><tr><th>학년</th><th>운영 가능</th><th>창체 배정</th><th>교과 확보</th><th>교과 필요</th><th>차이</th><th>점검</th></tr></thead><tbody>{byGrade.map((g) => {
    const pending = g.rows.some((r) => r.unconfigured),conflicts=g.rows.some((r) => r.conflicts);
    return <tr key={g.grade}><th>{g.grade}학년</th><td>{hoursRange(g.rows.map((r) => r.hours))}</td><td>{hoursRange(g.rows.map((r) => ["자율","자율·자치","동아리","진로","봉사"].reduce((n,a) => n+r.counts[a],0)))}</td><td>{hoursRange(g.rows.map((r) => r.counts["교과"]))}{(pending||conflicts)&&" (잠정)"}</td><td>{g.goal??"미설정"}</td><td>{g.goal==null||pending||conflicts ? "—" : hoursRange(g.rows.map((r) => r.counts["교과"]-g.goal!))}</td><td>{pending ? "운영 교시 설정 필요" : conflicts ? "중복 확인 필요" : g.goal==null ? "목표 설정 필요" : Math.min(...g.rows.map((r) => r.counts["교과"]))<g.goal ? "교과 총시수 부족" : "총시수 확보"}</td></tr>;
  })}</tbody></table></div><section className="ar-panel"><h3>{grade}학년 교과·창체 상세</h3><div className="ar-scroll"><table className="ar-hours"><thead><tr><th>학급</th>{["교과","자율","자율·자치","동아리","진로","봉사","학교자율시간"].map((a) => <th key={a}>{a}</th>)}</tr></thead><tbody>{byGrade.find((g) => g.grade===grade)?.rows.map((r) => <tr key={r.name}><th>{r.name}</th>{Object.entries(r.counts).map(([a,n]) => <td key={a}>{n}</td>)}</tr>)}</tbody></table></div></section></>;
}

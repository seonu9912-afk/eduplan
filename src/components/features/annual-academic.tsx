"use client";
import { SemesterSettings } from "./semester-settings";
import { useState, useRef, useMemo } from "react";
import { AcademicEventPeriods } from "./academic-event-periods";
import { Calendar } from "./calendar";
import { AcademicWorkbookPanel } from "./academic-workbook-panel";
import { parseAcademicConfirmation } from "@/lib/academic-confirmation";
import { curriculumTargets, datePeriod } from "@/lib/academic-rebuild";
import { Button } from "@/components/ui/button";
import {
  Empty,
  InlineNotice,
  PrintButton,
  useMutation,
  Notice,
} from "@/components/common";
import {
  annualSchema,
  defaultAnnual,
  calculateAcademic,
  academicDays,
  isTeachingDay,
  effectiveAcademicTerms,
  dayTypes,
  areas,
  type AnnualPlan,
} from "@/lib/academic";
import { monthRange } from "@/lib/domain";
import { saveAnnual, confirmAcademicCalendar, previewHolidays, previewWeather } from "@/app/actions";
import {
  downloadBlob,
  exportAcademic,
  importLegacyEvents,
} from "@/lib/academic-files";
import type { Context } from "@/lib/models";
import type { HolidayResult } from "@/lib/public-data";
import {
  AnnualCalendar,
  TeachingSummary,
  VacationSettings,
} from "./annual-calendar";
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
function Input({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="annual-field">
      {label}
      <input {...props} />
    </label>
  );
}
function Select({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="annual-field">
      {label}
      <select {...props}>{children}</select>
    </label>
  );
}
function fillActivityForm(
  form: HTMLFormElement | null,
  values: Record<string, unknown>,
) {
  if (!form) return;
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
      field.value = String(value);
  }
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}
export function AnnualAcademic({
  context: c,
  today,
  onDirtyChange,
}: {
  context: Context;
  today: string;
  onDirtyChange: (v: boolean) => void;
}) {
  const [plan, setPlan] = useState<AnnualPlan>(() =>
    c.annual ? annualSchema.parse(c.annual.document) : defaultAnnual(c.grades),
  );
  const confirmed = parseAcademicConfirmation(c.annual?.calendar_confirmation);
  const confirmAvailable = c.annual?.calendar_confirmation !== undefined;
  const [version, setVersion] = useState(c.annual?.version ?? 0);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("연간 기본안");
  const [selected, setSelected] = useState(() => {
    const initialYear = c.year?.year ?? Number(today.slice(0, 4));
    const first = `${initialYear}-03-01`;
    return today >= first && today < `${initialYear + 1}-03-01` ? today : first;
  });
  const [periodMode, setPeriodMode] = useState(false);
  const [dateDraft, setDateDraft] = useState(false);
  const [periodPreview, setPeriodPreview] = useState<{
    days: ReturnType<typeof datePeriod>;
    rule: AnnualPlan["days"][string];
    selected: string[];
  } | null>(null);
  const [holiday, setHoliday] = useState<{
    ok: boolean;
    days: Record<string, string>;
    responses: HolidayResult[];
  } | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<AnnualPlan | null>(null);
  const [weather, setWeather] = useState<Awaited<
    ReturnType<typeof previewWeather>
  > | null>(null);
  const m = useMutation();
  const holidayMutation = useMutation();
  const dayTrigger = useRef<HTMLButtonElement>(null);
  const recurringForm = useRef<HTMLFormElement>(null);
  const allocationForm = useRef<HTMLFormElement>(null);
  const editable = c.role === "admin";
  const year = c.year?.year ?? 2026;
  const start = `${year}-03-01`,
    end = monthRange(`${year + 1}-02`).end;
  const result = useMemo(
    () => calculateAcademic(year, plan, c.grades, c.semesters),
    [year, plan, c.grades, c.semesters],
  );
  const targets = useMemo(() => curriculumTargets(year, c), [year, c]);
  const termDates = effectiveAcademicTerms(year, plan, c.semesters);
  const confirmedEvents = new Map(confirmed?.source.events.map((event) => [event.id, event.version]));
  let changedEvents = 0;
  if (confirmed) {
    changedEvents = c.events.filter((event) => confirmedEvents.get(event.id) !== event.version).length +
      confirmed.source.events.filter((event) => !c.events.some((e) => e.id === event.id)).length;
  }
  const revisionCount = confirmed ? Math.max(version - confirmed.version, 0) : 0;
  const status = confirmed ? dirty || revisionCount || changedEvents ? "재확인 필요" : "확정" : "초안";
  function closeDateEditor() {
    setDayOpen(false);
    setDateDraft(false);
    setPeriodPreview(null);
    onDirtyChange(dirty);
  }
  function mayLeaveDateEditor() {
    return !dateDraft || window.confirm("날짜 편집창에 저장하지 않은 변경이 있습니다. 이동할까요?");
  }
  function openDateEditor(date: string, period: boolean) {
    if (!mayLeaveDateEditor()) return;
    setSelected(date);
    setDateDraft(false);
    setPeriodMode(period);
    setPeriodPreview(null);
    setDayOpen(true);
    onDirtyChange(dirty);
  }
  function showTab(next: string) {
    if (!mayLeaveDateEditor()) return;
    closeDateEditor();
    setTab(next);
  }
  const update = (next: AnnualPlan | ((current: AnnualPlan) => AnnualPlan)) => {
    setPlan(next);
    setDirty(true);
    onDirtyChange(true);
  };
  if (!c.year)
    return (
      <Empty
        title="학년도를 먼저 설정해 주세요"
        description="작업공간 설정에서 학년도와 학급을 만든 뒤 연간 기본안을 편성합니다."
      />
    );
  const chosen = result.days.find((d) => d.date === selected)!;
  function applyDay(form: FormData) {
    const first = periodMode ? String(form.get("first")) : selected;
    const last = periodMode ? String(form.get("last")) : selected;
    const rows = datePeriod(year, first, last, plan);
    const rule = {
      type: String(form.get("type")) as keyof typeof dayTypes,
      name: String(form.get("name")),
      enabled: form.get("enabled") === "on",
      weekday: Number(form.get("weekday")),
      start: Number(form.get("start")),
      end: Number(form.get("end")),
    };
    if (!rows.length || !annualSchema.safeParse({
      ...plan, days: { ...plan.days, [rows[0].date]: rule },
    }).success) {
      setMessage("날짜 범위와 교시를 확인해 주세요.");
      return;
    }
    if (periodMode) {
      setPeriodPreview({ days: rows, rule, selected: rows.filter((r) => !r.conflict).map((r) => r.date) });
      return;
    }
    update({ ...plan, days: { ...plan.days, [selected]: rule } });
    setDateDraft(false);
    setMessage("날짜 설정을 적용했습니다. 연간 계획을 저장해 주세요.");
  }
  function confirmPeriod() {
    if (!periodPreview?.selected.length) return;
    const days = {
      ...plan.days, ...Object.fromEntries(periodPreview.selected.map((date) => [date, periodPreview.rule])),
    };
    closeDateEditor();
    update({ ...plan, days });
    setMessage(`${periodPreview.selected.length}일에 적용했습니다. 연간 계획을 저장해 주세요.`);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ANNUAL SCHOOL PLAN</span>
          <h1>{year}학년도 학사일정</h1>
          <p>3월부터 다음 해 2월까지, 한 해의 기본안을 편성하고 변경합니다.</p>
        </div>
        <div className="heading-actions">
          <PrintButton />
          {editable && (
            <Button
              disabled={
                m.pending || holidayMutation.pending || dateDraft || (!dirty && version > 0)
              }
              onClick={() =>
                m.execute(
                  () =>
                    saveAnnual({
                      workspaceId: c.workspace.id,
                      yearId: c.year!.id,
                      version,
                      document: plan,
                    }),
                  (v) => {
                    setVersion(v);
                    setDirty(false);
                    onDirtyChange(false);
                    setMessage("");
                  },
                  "연간 계획을 저장했습니다.",
                )
              }
            >
              {m.pending ? "저장 중…" : "연간 계획 저장"}
            </Button>
          )}
        </div>
      </div>
      <div className="annual-status no-print">
        {dirty
          ? "저장하지 않은 변경사항이 있습니다."
          : version
            ? `${status} · 저장본 v${version}`
            : "요일별 1~6교시 초안 · 방학과 실제 교시를 확인해 주세요."}
      </div>
      <InlineNotice mutation={m} />
      <InlineNotice mutation={holidayMutation} />
      <Notice message={message} />
      <TeachingSummary days={result.days} plan={plan} />
      <nav className="annual-tabs no-print" aria-label="학사일정 편집">
        <>
          {[
            "연간 기본안",
            "수업·창체",
            "행사 일정",
            "집계·점검",
            "통합 Excel",
            "자료·이력",
            "날씨",
          ].map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => showTab(t)}>
              {t}
            </button>
          ))}
        </>
      </nav>
      {tab === "연간 기본안" && (
        <>
          <div className="annual-plan-tools no-print">
            <div>
              <strong>
                {start} ~ {end}
              </strong>
              <p>
                {termDates
                  .map((s) => `${s.number}학기 ${s.start_date} ~ ${s.end_date}`)
                  .join(" · ")}
              </p>
              {!Object.keys(plan.holidays).length && (
                <p className="holiday-reminder">
                  공휴일을 먼저 불러오고 방학·휴업일을 정하면 수업일수가
                  갱신됩니다.
                </p>
              )}
            </div>
            {editable && (
              <Button
                variant="outline"
                disabled={m.pending || holidayMutation.pending}
                onClick={() =>
                  holidayMutation.execute(
                    () => previewHolidays(c.workspace.id, year),
                    (data) => {
                      setHoliday(data);
                      if (data.ok) {
                        update((current) => ({
                          ...current,
                          holidays: { ...current.holidays, ...data.days },
                        }));
                        setMessage(
                          `${year}학년도 공휴일 ${Object.keys(data.days).length}일을 반영했습니다. 방학·수동 수정은 유지됩니다. 연간 계획을 저장해 주세요.`,
                        );
                      } else
                        setMessage(
                          "공휴일 전체 조회에 실패했습니다. 기존 계획은 유지됩니다. 잠시 후 다시 불러와 주세요.",
                        );
                    },
                    "",
                  )
                }
              >
                {holidayMutation.pending
                  ? "공휴일 불러오는 중…"
                  : "공휴일 불러오기"}
              </Button>
            )}
          </div>
          {holiday && (
            <details className="annual-api no-print">
              <summary>
                {holiday.ok
                  ? `공휴일 ${Object.keys(holiday.days).length}일 반영 · 조회 내역`
                  : "공휴일 조회 오류 상세"}
              </summary>
              {holiday.ok ? (
                <ul>
                  {Object.entries(holiday.days)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([d, n]) => (
                      <li key={d}>
                        {d} {n}
                        {plan.days[d] ? " · 수동 수정 유지" : ""}
                      </li>
                    ))}
                </ul>
              ) : (
                holiday.responses.map((r, i) => (
                  <div key={i}>
                    <p>
                      {year + i}년: HTTP {r.http} · resultCode=
                      {r.resultCode || "없음"} · {r.resultMsg} ·
                      returnReasonCode={r.returnReasonCode || "없음"}
                    </p>
                    {!r.ok && <pre>{r.url + "\n" + r.raw}</pre>}
                  </div>
                ))
              )}
            </details>
          )}
          <SemesterSettings key={c.year!.version} context={c} plan={plan} />
          <VacationSettings
            year={year}
            plan={plan}
            editable={editable}
            onChange={update}
            onMessage={setMessage}
          />
          <div className="heading-actions no-print">
            {editable && <Button variant="outline" onClick={() => openDateEditor(selected, true)}>기간 설정</Button>}
            <Button variant="outline" onClick={() => showTab("행사 일정")}>선택 날짜의 행사 편성</Button>
          </div>
          {dayOpen && editable && (
            <section className="panel annual-section academic-date-editor no-print"
              aria-label={periodMode ? "기간 설정" : selected + " 날짜 설정"}>
              <div className="academic-date-heading">
                <h3>{periodMode ? "기간 설정" : selected + " 날짜 설정"}</h3>
                <Button type="button" variant="outline" onClick={() => {
                  if (mayLeaveDateEditor()) { closeDateEditor(); dayTrigger.current?.focus(); }
                }}>닫기</Button>
              </div>
              <form key={selected + String(periodMode)} className="annual-editor"
                onChange={() => { setDateDraft(true); setPeriodPreview(null); onDirtyChange(true); }}
                onSubmit={(e) => { e.preventDefault(); applyDay(new FormData(e.currentTarget)); }}>
                <div className="annual-form-grid">
                  {periodMode && <>
                    <Input label="적용 시작일" name="first" type="date" min={start} max={end} defaultValue={selected} required />
                    <Input label="적용 종료일" name="last" type="date" min={start} max={end} defaultValue={selected} required />
                  </>}
                  <Select label="학사일 유형" name="type" defaultValue={periodMode ? "vacation" : chosen?.type}>
                    {Object.entries(dayTypes).map(([key, name]) =>
                      <option key={key} value={key}>{name}</option>)}
                  </Select>
                  <Input label="명칭" name="name" defaultValue={periodMode ? "" : chosen?.name} maxLength={100} />
                </div>
                <details>
                  <summary>고급 설정</summary>
                  <div className="annual-form-grid">
                    <Select label="교체 대상 요일" name="weekday" defaultValue={
                      chosen?.weekday && chosen.weekday <= 5 ? chosen.weekday : 1}>
                      {[1, 2, 3, 4, 5].map((w) => <option value={w} key={w}>{weekdays[w]}요일</option>)}
                    </Select>
                    <Input label="시작교시" name="start" type="number" min={1} max={12} defaultValue={chosen?.start ?? 1} required />
                    <Input label="종료교시" name="end" type="number" min={1} max={12} defaultValue={chosen?.end ?? 6} required />
                    <label><input type="checkbox" name="enabled" defaultChecked={periodMode || chosen?.enabled} /> 사용</label>
                  </div>
                </details>
                <div className="heading-actions">
                  <Button type="submit">{periodMode ? "변경 미리보기" : "날짜 설정 적용"}</Button>
                  {!periodMode && plan.days[selected] &&
                    <Button type="button" variant="outline" onClick={() => {
                      const days = { ...plan.days };
                      delete days[selected];
                      closeDateEditor();
                      update({ ...plan, days });
                    }}>개별 설정 해제</Button>}
                </div>
              </form>
              {periodPreview && <div className="info-box">
                <p>선택 {periodPreview.selected.length}일 / 전체 {periodPreview.days.length}일</p>
                <p>수업일수 {result.days.filter(isTeachingDay).length}일 → {
                  academicDays(year, { ...plan, days: {
                    ...plan.days, ...Object.fromEntries(periodPreview.selected.map((date) => [date, periodPreview.rule])),
                  } }, c.semesters).filter(isTeachingDay).length
                }일</p>
                {periodPreview.days.filter((item) => item.conflict).map(({ date, conflict }) =>
                  <label className="academic-period-conflict" key={date}>
                    <input type="checkbox" checked={periodPreview.selected.includes(date)} onChange={(e) =>
                      setPeriodPreview({ ...periodPreview, selected: e.target.checked
                        ? [...periodPreview.selected, date] : periodPreview.selected.filter((d) => d !== date) })} />
                    {date} · {conflict} 변경
                  </label>)}
                <Button type="button" disabled={!periodPreview.selected.length} onClick={confirmPeriod}>선택 날짜에 적용</Button>
              </div>}
            </section>
          )}
          <AnnualCalendar days={result.days} plan={plan} selected={selected}
            onSelect={(date, button) => {
              dayTrigger.current = button;
              if (editable) openDateEditor(date, false);
              else setSelected(date);
            }} />
        </>
      )}
      {tab === "수업·창체" && (
        <section className="panel annual-section">
          <h2>요일별 기본 교시</h2>
          <p>
            학년별 월~금 교시를 정합니다. 날짜별 변동 교시는 연간 기본안에서
            지정합니다.
          </p>
          <div className="table-scroll">
            <table className="plan-table">
              <thead>
                <tr>
                  <th>학년</th>
                  {[1, 2, 3, 4, 5].map((w) => (
                    <th key={w}>{weekdays[w]}요일 시작 / 종료</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.grades.map((g) => (
                  <tr key={g}>
                    <th>{g}학년</th>
                    {[1, 2, 3, 4, 5].map((w) => {
                      const t = plan.timetable.find(
                        (t) => t.grade === g && t.weekday === w,
                      );
                      return (
                        <td key={w}>
                          {(["start", "end"] as const).map((k) => (
                            <input
                              key={k}
                              aria-label={`${g}학년 ${weekdays[w]}요일 ${k === "start" ? "시작" : "종료"}교시`}
                              disabled={!editable}
                              type="number"
                              min={1}
                              max={12}
                              value={t?.[k] ?? 1}
                              onChange={(e) =>
                                update({
                                  ...plan,
                                  timetable: plan.timetable.map((t) =>
                                    t.grade === g && t.weekday === w
                                      ? { ...t, [k]: Number(e.target.value) }
                                      : t,
                                  ),
                                })
                              }
                            />
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>반복 창체·학교자율시간</h2>
          <p>
            행사 배정이 있는 교시는 행사 영역을 우선합니다. 같은 종류의 배정이
            겹치면 중복으로 표시하고 영역 합계에서 제외합니다.
          </p>
          <ul>
            {plan.recurring.map((r) => (
              <li key={r.id}>
                {r.grade}학년 {r.semester}학기 {weekdays[r.weekday]} {r.start}~
                {r.end}교시 · {r.name} ({r.area}) · 제외{" "}
                {r.exclude.join(", ") || "없음"}{" "}
                {editable && (
                  <button
                    onClick={() =>
                      fillActivityForm(recurringForm.current, {
                        ...r,
                        exclude: r.exclude.join(","),
                      })
                    }
                  >
                    수정
                  </button>
                )}
                {editable && (
                  <button
                    onClick={() =>
                      update({
                        ...plan,
                        recurring: plan.recurring.filter((v) => v.id !== r.id),
                      })
                    }
                  >
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <form
              ref={recurringForm}
              className="annual-form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const row = {
                  id: String(f.get("id") || crypto.randomUUID()),
                  name: String(f.get("name")),
                  area: String(f.get("area")),
                  grade: Number(f.get("grade")),
                  semester: Number(f.get("semester")),
                  weekday: Number(f.get("weekday")),
                  start: Number(f.get("start")),
                  end: Number(f.get("end")),
                  exclude: String(f.get("exclude"))
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                };
                const v = annualSchema.safeParse({
                  ...plan,
                  recurring: [
                    ...plan.recurring.filter((r) => r.id !== row.id),
                    row,
                  ],
                });
                if (v.success) {
                  update(v.data);
                  e.currentTarget.reset();
                } else
                  setMessage(
                    "활동의 교시와 제외일 형식(YYYY-MM-DD)을 확인해 주세요.",
                  );
              }}
            >
              <input type="hidden" name="id" defaultValue="" />
              <Input label="반복 활동명" name="name" required />
              <Select label="활동 학년" name="grade">
                {c.grades.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
              <Select label="활동 학기" name="semester">
                <option>1</option>
                <option>2</option>
              </Select>
              <Select label="반복 요일" name="weekday">
                {[1, 2, 3, 4, 5].map((w) => (
                  <option value={w} key={w}>
                    {weekdays[w]}
                  </option>
                ))}
              </Select>
              <Select label="활동 영역" name="area">
                {areas
                  .filter((a) => a !== "교과" && a !== "없음")
                  .map((a) => (
                    <option key={a}>{a}</option>
                  ))}
              </Select>
              <Input
                label="반복 시작교시"
                name="start"
                type="number"
                min={1}
                max={12}
                defaultValue={1}
              />
              <Input
                label="반복 종료교시"
                name="end"
                type="number"
                min={1}
                max={12}
                defaultValue={1}
              />
              <Input
                label="제외일 (쉼표 구분)"
                name="exclude"
                placeholder="2026-05-04,2026-05-11"
              />
              <Button>반복 활동 적용</Button>
            </form>
          )}
          <h2>행사 교시 배정</h2>
          <p>
            학년별로 다른 활동 영역을 배정할 수 있습니다. 학교 공통 행사·일정은
            ‘행사 일정’에서 관리합니다.
          </p>
          <ul>
            {plan.allocations.map((a) => (
              <li key={a.id}>
                {a.date} {a.start}~{a.end}교시 · {a.title} ·{" "}
                {Object.entries(a.areas)
                  .map(([g, area]) => `${g}학년 ${area}`)
                  .join(" / ")}{" "}
                {editable && (
                  <button
                    onClick={() =>
                      fillActivityForm(allocationForm.current, {
                        ...a,
                        ...Object.fromEntries(
                          Object.entries(a.areas).map(([g, area]) => [
                            "area-" + g,
                            area,
                          ]),
                        ),
                      })
                    }
                  >
                    수정
                  </button>
                )}
                {editable && (
                  <button
                    onClick={() =>
                      update({
                        ...plan,
                        allocations: plan.allocations.filter(
                          (v) => v.id !== a.id,
                        ),
                      })
                    }
                  >
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <form
              ref={allocationForm}
              className="annual-form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const row = {
                  id: String(f.get("id") || crypto.randomUUID()),
                  eventId: String(f.get("eventId") || ""),
                  date: String(f.get("date")),
                  title: String(f.get("title")),
                  department: String(f.get("department")),
                  start: Number(f.get("start")),
                  end: Number(f.get("end")),
                  areas: Object.fromEntries(
                    c.grades.map((g) => [g, String(f.get("area-" + g))]),
                  ),
                };
                const v = annualSchema.safeParse({
                  ...plan,
                  allocations: [
                    ...plan.allocations.filter((a) => a.id !== row.id),
                    row,
                  ],
                });
                if (v.success) {
                  update(v.data);
                  e.currentTarget.reset();
                } else setMessage("행사 교시와 입력값을 확인해 주세요.");
              }}
            >
              <input type="hidden" name="id" defaultValue="" />
              <label>
                등록 행사에서 가져오기
                <select
                  name="eventId"
                  defaultValue=""
                  onChange={(e) => {
                    const event = c.events.find((v) => v.id === e.target.value);
                    if (event)
                      fillActivityForm(allocationForm.current, {
                        eventId: event.id,
                        id: "",
                        date: event.start_date,
                        title: event.title,
                        department: event.department,
                        ...Object.fromEntries(
                          c.grades.map((g) => [
                            "area-" + g,
                            event.target_grades.includes(g)
                              ? event.activity_area
                              : "없음",
                          ]),
                        ),
                      });
                  }}
                >
                  <option value="">직접 입력</option>
                  {c.events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.start_date} · {event.title} · {event.activity_area}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="교시 배정 날짜"
                name="date"
                type="date"
                min={start}
                max={end}
                required
              />
              <Input label="교시 행사명" name="title" required />
              <Input label="교시 담당부서" name="department" />
              <Input
                label="행사 시작교시"
                name="start"
                type="number"
                min={1}
                max={12}
                defaultValue={1}
              />
              <Input
                label="행사 종료교시"
                name="end"
                type="number"
                min={1}
                max={12}
                defaultValue={1}
              />
              {c.grades.map((g) => (
                <Select
                  key={g}
                  label={`${g}학년 행사 영역`}
                  name={"area-" + g}
                  defaultValue="없음"
                >
                  {areas.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </Select>
              ))}
              <Button>교시 행사 적용</Button>
            </form>
          )}
        </section>
      )}
      {tab === "행사 일정" && <>
        <Calendar context={c} today={today} focusDate={selected} onFocusDate={setSelected} />
        <AcademicEventPeriods key={selected} context={c} plan={plan} focusDate={selected}
          onChange={update} onMessage={setMessage} />
      </>}
      {tab === "집계·점검" && (
        <section className="panel annual-section">
          <div className="academic-date-heading">
            <h2>수업일수·시수 집계</h2>
            {editable && confirmAvailable && <Button disabled={!version || dirty || m.pending}
              onClick={() => {
                if (window.confirm("저장된 편성안과 행사·시수 기준을 확정본으로 저장할까요?"))
                  m.execute(() => confirmAcademicCalendar({ workspaceId: c.workspace.id,
                    yearId: c.year!.id, version }), undefined, "현재 편성안을 확정했습니다.");
              }}>저장된 편성안 확정</Button>}
          </div>
          {confirmed && <p>확정본 이후 저장 {revisionCount}건 · 추가·변경·삭제된 행사 {changedEvents}건</p>}
          <p>
            학교의 교육과정 편성표에 입력한 교과·창체 시수를 목표로 비교합니다.
          </p>
          <div className="table-scroll">
            <table className="plan-table">
              <thead>
                <tr>
                  {[
                    "학년",
                    "학기",
                    "수업일수",
                    "전체 시수",
                    "중복 교시",
                    "교과 목표",
                    "창체 목표",
                    "교과 시수 차이",
                    ...areas.filter((a) => a !== "없음"),
                  ].map((a) => (
                    <th key={a}>{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.totals.map((t) => {
                  const goal = targets.find((item) => item.grade === t.grade && item.semester === t.semester);
                  return <tr key={`${t.grade}-${t.semester}`}>
                    <th>{t.grade}학년</th>
                    <td>{t.semester}학기</td>
                    <td>{t.days}</td>
                    <td>{t.hours}</td>
                    <td>{t.conflicts}</td>
                    <td>{goal?.subject ?? "미설정"}</td>
                    <td>{goal?.creative ?? "미설정"}</td>
                    <td>{goal?.subject == null || t.conflicts ? "—" : (t.counts["교과"] ?? 0) - goal.subject}</td>
                    {areas
                      .filter((a) => a !== "없음")
                      .map((a) => (
                        <td key={a}>{t.counts[a] ?? 0}</td>
                      ))}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <h3>배정 점검 {result.warnings.length}건</h3>
          {result.warnings.length ? (
            <ul>
              {result.warnings.slice(0, 100).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p>교시 중복·범위 오류가 없습니다.</p>
          )}
        </section>
      )}
      {tab === "통합 Excel" &&
        <AcademicWorkbookPanel year={year} plan={plan} context={c}
          currentStatus={status} confirmed={confirmed} />}
      {tab === "자료·이력" && (
        <section className="panel annual-section">
          <h2>Excel · 백업 · 변경 이력</h2>
          <Button
            onClick={() =>
              m.execute(async () => {
                await exportAcademic(
                  year,
                  plan,
                  c.grades,
                  c.semesters,
                  c.events,
                );
                return { ok: true, data: undefined };
              })
            }
          >
            학사일정 Excel 내보내기
          </Button>{" "}
          <Button
            variant="outline"
            onClick={() =>
              downloadBlob(
                JSON.stringify({ year, document: plan }, null, 2),
                `${year}_학사일정_백업.json`,
                "application/json",
              )
            }
          >
            연간 계획 백업
          </Button>
          {editable && (
            <>
              <Input
                label="백업 JSON 가져오기 (미리보기)"
                type="file"
                accept=".json"
                onChange={async (e) => {
                  try {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1500000) throw Error();
                    const data = JSON.parse(await file.text());
                    if (data.year !== year) throw Error();
                    setPreview(annualSchema.parse(data.document));
                  } catch {
                    setMessage("현재 학년도에 맞는 백업 JSON을 선택해 주세요.");
                  }
                }}
              />
              <Input
                label="기존 행사목록 Excel 가져오기 (미리보기)"
                type="file"
                accept=".xlsx"
                onChange={async (e) => {
                  try {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5000000) throw Error();
                    const rows = await importLegacyEvents(file, c.grades);
                    setPreview(
                      annualSchema.parse({
                        ...plan,
                        allocations: [...plan.allocations, ...rows],
                      }),
                    );
                  } catch {
                    setMessage(
                      "행사목록 Excel의 날짜·시작·종료 교시·학년 영역을 확인해 주세요. 교시가 없는 행사는 행사 일정에서 등록합니다.",
                    );
                  }
                }}
              />
            </>
          )}
          {preview && (
            <div className="info-box">
              가져오기 미리보기: 방학 {preview.vacations.length}구간 · 수동
              학사일 {Object.keys(preview.days).length}일 · 반복 활동{" "}
              {preview.recurring.length}개 · 교시 행사{" "}
              {preview.allocations.length}개{" "}
              <Button
                onClick={() => {
                  update({
                    ...preview,
                    business: plan.business,
                    departments: plan.departments,
                    workSettings: plan.workSettings,
                  });
                  setPreview(null);
                  setMessage(
                    "가져온 자료를 적용했습니다. 연간 계획 저장을 눌러 주세요.",
                  );
                }}
              >
                미리보기 적용
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)}>
                취소
              </Button>
            </div>
          )}
          <h3>이전 저장본 (최대 30개)</h3>
          {(
            (c.annual?.history ?? []) as unknown as {
              version: number;
              at: string;
              document: AnnualPlan;
            }[]
          ).map((h) => (
            <p key={h.version}>
              v{h.version} ·{" "}
              {new Date(h.at).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}{" "}
              {editable && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      window.confirm(
                        "현재 편집 내용을 이 저장본으로 바꿀까요? 적용 후 저장해야 반영됩니다.",
                      )
                    )
                      update({
                        ...annualSchema.parse(h.document),
                        business: plan.business,
                        departments: plan.departments,
                        workSettings: plan.workSettings,
                      });
                  }}
                >
                  이 저장본 복원
                </Button>
              )}
            </p>
          ))}
        </section>
      )}
      {tab === "날씨" && (
        <section className="panel annual-section">
          <h2>야외활동 준비를 위한 기상청 예보</h2>
          <p>
            단기 예보는 가까운 체험학습·체육행사 준비에, 중기 예보는 다음 주
            행사 일정 검토에 활용합니다. 연간 기본안의 날짜를 날씨로 자동
            변경하지 않습니다.
          </p>
          <p className="field-hint">
            기본 위치는 서울입니다. 학교의 기상청 격자와 중기 예보 구역 코드를
            입력한 뒤 저장하세요.
          </p>
          <div className="annual-form-grid">
            {(["nx", "ny", "landCode", "tempCode"] as const).map((k) => (
              <Input
                key={k}
                label={
                  {
                    nx: "학교 격자 X",
                    ny: "학교 격자 Y",
                    landCode: "중기 육상 구역",
                    tempCode: "중기 기온 구역",
                  }[k]
                }
                disabled={!editable}
                type={k === "nx" || k === "ny" ? "number" : "text"}
                value={plan.weather[k]}
                onChange={(e) =>
                  update({
                    ...plan,
                    weather: {
                      ...plan.weather,
                      [k]:
                        k === "nx" || k === "ny"
                          ? Number(e.target.value)
                          : e.target.value,
                    },
                  })
                }
              />
            ))}
          </div>
          <Button
            disabled={m.pending}
            onClick={() =>
              m.execute(
                () => previewWeather(c.workspace.id, plan.weather),
                (data) => setWeather({ ok: true, data }),
                "예보 응답을 확인했습니다.",
              )
            }
          >
            예보 조회
          </Button>
          {weather?.ok &&
            weather.data.map((r) => (
              <div key={r.name}>
                <h3>{r.name}</h3>
                <p>{r.message}</p>
                {r.ok ? (
                  <ForecastCards name={r.name} items={r.items} />
                ) : (
                  <p>실제 예보를 불러오지 못했습니다.</p>
                )}
              </div>
            ))}
        </section>
      )}
    </>
  );
}

function ForecastCards({
  name,
  items,
}: {
  name: string;
  items: Record<string, string | number>[];
}) {
  if (name === "단기예보") {
    const groups = new Map<string, Record<string, string | number>>();
    for (const row of items) {
      const key = String(row.fcstDate) + " " + String(row.fcstTime);
      const g = groups.get(key) ?? {
        date: String(row.fcstDate),
        time: String(row.fcstTime),
      };
      g[String(row.category)] = row.fcstValue;
      groups.set(key, g);
    }
    return (
      <div className="forecast-cards">
        {[...groups.values()]
          .filter((g) => g.TMP !== undefined)
          .slice(0, 12)
          .map((g) => (
            <div className="info-box" key={String(g.date) + String(g.time)}>
              <strong>
                {String(g.date).slice(4, 6)}/{String(g.date).slice(6)}{" "}
                {String(g.time).slice(0, 2)}시
              </strong>
              <p>
                {g.TMP}℃ · 강수확률 {g.POP ?? "—"}%
              </p>
              <p>
                {{ "1": "맑음", "3": "구름 많음", "4": "흐림" }[
                  String(g.SKY)
                ] ?? ""}
                {String(g.PTY) !== "0" && g.PTY !== undefined
                  ? " · 강수 예보"
                  : ""}
              </p>
            </div>
          ))}
      </div>
    );
  }
  const row = items[0];
  if (!row) return <p>표시할 예보가 없습니다.</p>;
  return (
    <div className="forecast-cards">
      {[3, 4, 5, 6, 7, 8, 9, 10]
        .filter((day) =>
          [
            "wf" + day + "Am",
            "wf" + day + "Pm",
            "wf" + day,
            "taMin" + day,
            "taMax" + day,
          ].some((k) => row[k] !== undefined),
        )
        .map((day) => (
          <div className="info-box" key={day}>
            <strong>{day}일 후</strong>
            <p>
              {row["wf" + day + "Am"] ?? row["wf" + day] ?? ""}{" "}
              {row["wf" + day + "Pm"] ?? ""}
            </p>
            {row["taMin" + day] !== undefined && (
              <p>
                최저 {row["taMin" + day]}℃ / 최고 {row["taMax" + day]}℃
              </p>
            )}
            {row["rnSt" + day + "Am"] !== undefined && (
              <p>
                강수확률 오전 {row["rnSt" + day + "Am"]}% / 오후{" "}
                {row["rnSt" + day + "Pm"]}%
              </p>
            )}
          </div>
        ))}
    </div>
  );
}

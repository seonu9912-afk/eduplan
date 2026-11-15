"use client";
import { SemesterSettings } from "./semester-settings";
import { useState, useRef, useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  Modal,
  InlineNotice,
  PrintButton,
  useMutation,
  Notice,
} from "@/components/common";
import {
  annualSchema,
  defaultAnnual,
  calculateAcademic,
  dayTypes,
  areas,
  type AnnualPlan,
} from "@/lib/academic";
import { addDays, monthRange } from "@/lib/domain";
import { saveAnnual, previewHolidays, previewWeather } from "@/app/actions";
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
  children,
  onDirtyChange,
}: {
  context: Context;
  children: ReactNode;
  onDirtyChange: (v: boolean) => void;
}) {
  const [plan, setPlan] = useState<AnnualPlan>(() =>
    c.annual ? annualSchema.parse(c.annual.document) : defaultAnnual(c.grades),
  );
  const [version, setVersion] = useState(c.annual?.version ?? 0);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("연간 기본안");
  const [selected, setSelected] = useState(`${c.year?.year ?? 2026}-03-01`);
  const [until, setUntil] = useState(selected);
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
  const editable = c.role !== "viewer";
  const year = c.year?.year ?? 2026;
  const start = `${year}-03-01`,
    end = monthRange(`${year + 1}-02`).end;
  const result = useMemo(
    () => calculateAcademic(year, plan, c.grades, c.semesters),
    [year, plan, c.grades, c.semesters],
  );
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
    if (
      !selected ||
      !until ||
      until < selected ||
      selected < start ||
      until > end
    ) {
      setMessage("학년도 안의 날짜 범위를 선택해 주세요.");
      return;
    }
    const days = { ...plan.days };
    for (let d = selected; d <= until; d = addDays(d, 1))
      days[d] = {
        type: String(form.get("type")) as keyof typeof dayTypes,
        name: String(form.get("name")),
        enabled: form.get("enabled") === "on",
        weekday: Number(form.get("weekday")),
        start: Number(form.get("start")),
        end: Number(form.get("end")),
      };
    const check = annualSchema.safeParse({ ...plan, days });
    if (!check.success) {
      setMessage("교시와 날짜를 확인해 주세요.");
      return;
    }
    update(check.data);
    setDayOpen(false);
    setMessage("선택한 기간에 적용했습니다. 연간 계획 저장을 눌러 주세요.");
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
                m.pending || holidayMutation.pending || (!dirty && version > 0)
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
            ? `저장본 v${version}`
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
            "자료·이력",
            "날씨",
          ].map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
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
                {c.semesters
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
          <AnnualCalendar
            days={result.days}
            plan={plan}
            events={c.events}
            selected={selected}
            onSelect={(date, button) => {
              dayTrigger.current = button;
              setSelected(date);
              setUntil(date);
              setDayOpen(true);
            }}
          />
          <Modal
            open={dayOpen}
            onOpenChange={setDayOpen}
            title="날짜·기간 편집"
            description="선택한 날짜 또는 기간의 학사일 유형과 교시를 설정합니다."
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              dayTrigger.current?.focus({ preventScroll: true });
            }}
          >
            <div className="annual-editor">
              <form
                key={selected}
                onSubmit={(e) => {
                  e.preventDefault();
                  applyDay(new FormData(e.currentTarget));
                }}
              >
                <Input
                  label="적용 시작일"
                  type="date"
                  min={start}
                  max={end}
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setUntil(e.target.value);
                  }}
                  required
                />
                <Input
                  label="적용 종료일"
                  type="date"
                  min={selected}
                  max={end}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  required
                />
                <fieldset disabled={!editable}>
                  <Select
                    label="학사일 유형"
                    name="type"
                    defaultValue={chosen?.type}
                  >
                    {Object.entries(dayTypes).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="명칭"
                    name="name"
                    defaultValue={chosen?.name}
                    maxLength={100}
                  />
                  <Select
                    label="적용 수업 요일"
                    name="weekday"
                    defaultValue={
                      chosen?.weekday && chosen.weekday <= 5
                        ? chosen.weekday
                        : 1
                    }
                  >
                    {[1, 2, 3, 4, 5].map((w) => (
                      <option value={w} key={w}>
                        {weekdays[w]}요일
                      </option>
                    ))}
                  </Select>
                  <div className="annual-inline">
                    <Input
                      label="시작교시"
                      name="start"
                      type="number"
                      min={1}
                      max={12}
                      defaultValue={chosen?.start ?? 1}
                    />
                    <Input
                      label="종료교시"
                      name="end"
                      type="number"
                      min={1}
                      max={12}
                      defaultValue={chosen?.end ?? 6}
                    />
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={chosen?.enabled ?? true}
                    />{" "}
                    사용
                  </label>
                  <Button type="submit">선택 기간 적용</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (
                        !selected ||
                        !until ||
                        until < selected ||
                        selected < start ||
                        until > end
                      ) {
                        setMessage("학년도 안의 날짜 범위를 선택해 주세요.");
                        return;
                      }
                      const days = { ...plan.days };
                      for (let d = selected; d <= until; d = addDays(d, 1))
                        delete days[d];
                      update({ ...plan, days });
                      setDayOpen(false);
                    }}
                  >
                    선택 기간 수동 수정 해제
                  </Button>
                </fieldset>
              </form>
              <p className="field-hint">
                수동 수정은 방학·공휴일을 다시 불러와도 보존됩니다. 교시를 직접
                지정한 날에는 요일별 기본 교시보다 우선 적용됩니다.
              </p>
            </div>
          </Modal>
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
      {tab === "행사 일정" && children}
      {tab === "집계·점검" && (
        <section className="panel annual-section">
          <h2>수업일수·시수 집계</h2>
          <p>
            사용 해제일·휴일·방학·학기 밖 날짜를 제외합니다. 영역별 법정 기준은
            제공해 주실 교육과정 총론을 확인한 후 적용합니다.
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
                    ...areas.filter((a) => a !== "없음"),
                  ].map((a) => (
                    <th key={a}>{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.totals.map((t) => (
                  <tr key={`${t.grade}-${t.semester}`}>
                    <th>{t.grade}학년</th>
                    <td>{t.semester}학기</td>
                    <td>{t.days}</td>
                    <td>{t.hours}</td>
                    <td>{t.conflicts}</td>
                    {areas
                      .filter((a) => a !== "없음")
                      .map((a) => (
                        <td key={a}>{t.counts[a] ?? 0}</td>
                      ))}
                  </tr>
                ))}
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

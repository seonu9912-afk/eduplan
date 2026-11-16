"use client";
import Link from "next/link";
import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  Pencil,
  CalendarRange,
  List,
  CalendarCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Confirm,
  Empty,
  Field,
  InlineNotice,
  Modal,
  Notice,
  PrintButton,
  SubmitButton,
  useMutation,
} from "@/components/common";
import { saveEvent, deleteEvent } from "@/app/actions";
import {
  activityAreas,
  addDays,
  calendarDays,
  dateLabel,
  eventTypes,
  monthRange,
  moveMonth,
  overlaps,
  weekRange,
} from "@/lib/domain";
import type { Context, Row } from "@/lib/models";
export function Calendar({
  context: c,
  today,
  plansOnly = false,
  focusDate,
  onFocusDate,
}: {
  context: Context;
  today: string;
  plansOnly?: boolean;
  focusDate?: string;
  onFocusDate?: (date: string) => void;
}) {
  const initialMonth =
    c.year &&
    Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 3 ? 1 : 0) ===
      c.year.year
      ? today.slice(0, 7)
      : `${c.year?.year ?? Number(today.slice(0, 4))}-03`;
  const [month, setMonth] = useState(focusDate?.slice(0, 7) ?? initialMonth);
  const [weekDate, setWeekDate] = useState(
    focusDate ?? (today.startsWith(initialMonth) ? today : `${initialMonth}-01`),
  );
  const [view, setView] = useState<"calendar" | "month" | "week">(
    plansOnly || focusDate ? "month" : "calendar",
  );
  const [type, setType] = useState("all");
  const [grade, setGrade] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Row<"events"> | null>(null);
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState(`${initialMonth}-01`);
  const [message, setMessage] = useState("");
  const editable = c.role === "admin";
  const embedded = focusDate !== undefined;
  const showMonthGrid = view === "calendar" || (embedded && view === "month");
  const start = c.year ? `${c.year.year}-03-01` : "";
  const end = c.year ? monthRange(`${c.year.year + 1}-02`).end : "";
  function selectMonth(nextMonth: string) {
    if (nextMonth < start.slice(0, 7) || nextMonth > end.slice(0, 7)) return;
    if (focusDate && !focusDate.startsWith(nextMonth)) selectDate(`${nextMonth}-01`);
    else setMonth(nextMonth);
  }
  function selectDate(date: string) {
    if (date < start || date > end) return;
    setMonth(date.slice(0, 7));
    setWeekDate(date);
    onFocusDate?.(date);
  }
  const range = view === "week" ? weekRange(weekDate) : monthRange(month);
  const filtered = c.events.filter(
    (e) =>
      (type === "all" || e.event_type === type) &&
      (grade === "all" || !e.target_grades.length || e.target_grades.includes(Number(grade))) &&
      (!query ||
        `${e.title} ${e.department} ${e.description}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())),
  );
  const visible = filtered.filter((e) => overlaps(e, range.start, range.end));
  const changePeriod = (n: number) => {
    if (view === "week") {
      const nextDate = addDays(weekDate, n * 7);
      setWeekDate(nextDate);
      onFocusDate?.(nextDate < start ? start : nextDate > end ? end : nextDate);
    } else {
      selectMonth(moveMonth(month, n));
    }
  };
  const previous =
    view === "week"
      ? weekRange(addDays(weekDate, -7)).end < start
      : moveMonth(month, -1) < start.slice(0, 7);
  const next =
    view === "week"
      ? weekRange(addDays(weekDate, 7)).start > end
      : moveMonth(month, 1) > end.slice(0, 7);
  function edit(event: Row<"events">) {
    setEditing(event);
    setOpen(true);
  }
  function create(date: string) {
    setEditing(null);
    onFocusDate?.(date);
    setNewDate(date);
    setOpen(true);
  }
  if (!c.year)
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">ACADEMIC CALENDAR</span>
            <h1>{plansOnly ? "월중·주간계획" : "학사일정"}</h1>
            <p>학교의 모든 일정을 하나의 흐름으로 관리하세요.</p>
          </div>
        </div>
        <section className="panel">
          <Empty
            icon={<CalendarDays />}
            title="먼저 학년도를 설정해 주세요"
            description="학년도와 학기를 설정하면 일정을 등록할 수 있어요."
            action={
              <Button asChild>
                <Link href={`/app/${c.workspace.id}/settings`}>
                  학년도 설정하기
                </Link>
              </Button>
            }
          />
        </section>
      </>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {plansOnly ? "SCHOOL PLANS" : "ACADEMIC CALENDAR"}
          </span>
          {embedded ? <h2>학교 행사</h2> : <h1>{plansOnly ? "월중·주간계획" : "학사일정"}</h1>}
          <p>
            {plansOnly
              ? "학사일정과 같은 자료로 우리 학교의 계획을 정리합니다."
              : "학교의 모든 일정을 한 번의 입력으로 연결하세요."}
          </p>
        </div>
        <div className="heading-actions">
          <PrintButton />
          {editable ? (
            <Button
              onClick={() =>
                create(focusDate ?? (today >= start && today <= end ? today : `${month}-01`))
              }
              className="no-print"
            >
              <Plus />
              일정 등록
            </Button>
          ) : null}
        </div>
      </div>
      <Notice message={message} />
      <section className="panel calendar-panel">
        <div
          className="tabs-row no-print"
          role="tablist"
          aria-label="일정 보기"
        >
          {(
            [
              { id: "calendar", name: "월간 달력", icon: CalendarDays },
              { id: "month", name: "월별 행사", icon: List },
              { id: "week", name: "주별 행사", icon: CalendarRange },
            ] as const
          )
            .filter((v) => !(plansOnly || embedded) || v.id !== "calendar")
            .map(({ id, name, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={view === id ? "active" : ""}
              >
                <Icon size={16} />
                {name}
              </button>
            ))}
        </div>
        <div className="calendar-toolbar">
          <div className="calendar-title">
            <div className="calendar-nav no-print">
              <button
                aria-label="이전 기간"
                disabled={previous}
                onClick={() => changePeriod(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                aria-label="다음 기간"
                disabled={next}
                onClick={() => changePeriod(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <h2>
              {view === "week"
                ? `${dateLabel(range.start)} – ${dateLabel(range.end)}`
                : `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`}
            </h2>
            <span className="count-chip">{visible.length}건</span>
          </div>
          <div className="calendar-controls no-print">
            <label className="sr-only" htmlFor="period">
              기간 선택
            </label>
            {view === "week" ? (
              <input
                id="period"
                type="date"
                value={weekDate}
                min={start}
                max={end}
                onChange={(e) => {
                  if (!e.target.value || e.target.value < start || e.target.value > end) return;
                  setWeekDate(e.target.value);
                  onFocusDate?.(e.target.value);
                }}
              />
            ) : (
              <input
                id="period"
                type="month"
                value={month}
                min={start.slice(0, 7)}
                max={end.slice(0, 7)}
                onChange={(e) => e.target.value && selectMonth(e.target.value)}
              />
            )}
            <Button
              variant="outline"
              onClick={() => {
                selectMonth(initialMonth);
                setWeekDate(
                  today.startsWith(initialMonth) ? today : `${initialMonth}-01`,
                );
              }}
            >
              이번 {view === "week" ? "주" : "달"}
            </Button>
          </div>
        </div>
        <div className="calendar-filters no-print">
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="일정 검색"
              placeholder="일정명, 담당 부서 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="행사 유형 필터"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">모든 유형</option>
            {Object.entries(eventTypes).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
          <select
            aria-label="대상 학년 필터"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          >
            <option value="all">전체 학년</option>
            {c.grades.map((n) => (
              <option key={n} value={n}>
                {n}학년
              </option>
            ))}
          </select>
          <div className="calendar-legend">
            {Object.entries(eventTypes)
              .slice(0, 4)
              .map(([key, value]) => (
                <span key={key}>
                  <i className={`type-dot type-${key}`} />
                  {value}
                </span>
              ))}
          </div>
        </div>
        <div className="print-only print-context">
          {c.workspace.name} · {c.year.year}학년도 ·{" "}
          {view === "week"
            ? "주별 행사"
            : view === "month"
              ? "월별 행사"
              : "학사력"}
        </div>
        {showMonthGrid && (
          <div className="calendar-scroll">
            <div className="month-grid">
              <div className="weekdays">
                {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="calendar-cells">
                {calendarDays(month).map((date, i) => {
                  const dayEvents = filtered.filter((e) =>
                    overlaps(e, date, date),
                  );
                  return (
                    <div
                      key={date}
                      className={`calendar-cell ${date.slice(0, 7) !== month ? "outside" : ""} ${date === today ? "is-today" : ""} ${date === focusDate ? "calendar-focus" : ""} ${i % 7 === 0 ? "sunday" : i % 7 === 6 ? "saturday" : ""}`}
                    >
                      <button
                        className="day-number"
                        aria-label={`${date} ${embedded ? "날짜 선택" : "일정 등록"}`}
                        aria-pressed={embedded ? date === focusDate : undefined}
                        disabled={(!embedded && !editable) || date < start || date > end}
                        onClick={() => embedded ? selectDate(date) : create(date)}
                      >
                        {Number(date.slice(8, 10))}
                        {date === today ? <small>오늘</small> : null}
                      </button>
                      <div className="cell-events">
                        {dayEvents.map((e) => (
                          <button
                            title={e.title}
                            key={e.id}
                            onClick={() => edit(e)}
                            className={`calendar-event type-${e.event_type}`}
                          >
                            <i />
                            {e.title}
                            {e.activity_area !== "없음"
                              ? ` · ${e.activity_area}`
                              : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {(!showMonthGrid || embedded) && (visible.length ? (
          <div className="table-scroll">
            <table className="plan-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>유형</th>
                  <th>일정명</th>
                  <th>대상</th>
                  <th>담당 부서</th>
                  <th className="no-print">상세</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id} className={focusDate && overlaps(e, focusDate, focusDate) ? "calendar-focus" : undefined}>
                    <td className="nowrap">
                      {dateLabel(e.start_date)}
                      {e.end_date !== e.start_date
                        ? ` ~ ${dateLabel(e.end_date)}`
                        : ""}
                    </td>
                    <td>
                      <span className={`event-label type-${e.event_type}`}>
                        {eventTypes[e.event_type as keyof typeof eventTypes]}
                      </span>
                    </td>
                    <td>
                      <strong>{e.title}</strong>
                      {e.activity_area !== "없음" && (
                        <span className="scope-tag">{e.activity_area}</span>
                      )}
                      {e.description ? (
                        <p className="table-description">{e.description}</p>
                      ) : null}
                    </td>
                    <td>
                      {!e.target_grades.length || e.target_grades.length === c.grades.length
                        ? "전 학년"
                        : `${e.target_grades.join("·")}학년`}
                    </td>
                    <td>{e.department || "—"}</td>
                    <td className="no-print">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${e.title} 상세 보기`}
                        onClick={() => edit(e)}
                      >
                        <Pencil />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<CalendarCheck />}
            title="해당 기간에 일정이 없어요"
            description="일정을 등록하거나 검색 조건을 변경해 주세요."
          />
        ))}
        <div className="calendar-bottom">
          <span>
            <span className="status-dot" />
            학교 행사 일정은 월중·주간 업무계획에서도 함께 표시됩니다.
          </span>
          <span>
            {!editable
              ? "조회 전용"
              : embedded ? "날짜를 선택한 뒤 일정 등록을 누르세요." : "날짜를 클릭해 일정을 추가하세요."}
          </span>
        </div>
      </section>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? (editable ? "일정 수정" : "일정 상세") : "새 학사일정"}
        description={`${c.year.year}학년도 · ${c.workspace.name}`}
        wide
      >
        <EventForm
          key={`${editing?.id ?? newDate}-${editing?.version ?? 0}-${open}`}
          context={c}
          event={editing}
          date={newDate}
          onDone={(msg) => {
            setOpen(false);
            setMessage(msg);
          }}
        />
      </Modal>
    </>
  );
}
function EventForm({
  context: c,
  event,
  date,
  onDone,
}: {
  context: Context;
  event: Row<"events"> | null;
  date: string;
  onDone: (message: string) => void;
}) {
  const m = useMutation();
  const [confirm, setConfirm] = useState(false);
  const editable = c.role === "admin";
  return (
    <>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          m.execute(
            () =>
              saveEvent({
                id: event?.id,
                version: event?.version,
                workspace_id: c.workspace.id,
                academic_year_id: c.year!.id,
                title: f.get("title"),
                start_date: f.get("start_date"),
                end_date: f.get("end_date"),
                event_type: f.get("event_type"),
                activity_area: f.get("activity_area"),
                department: f.get("department"),
                description: f.get("description"),
                target_grades: f.getAll("grade").map(Number),
              }),
            () =>
              onDone(
                event ? "일정이 수정되었습니다." : "일정이 등록되었습니다.",
              ),
          );
        }}
      >
        <fieldset disabled={!editable || m.pending} className="form-stack">
          <Field label="일정명" id="event-title">
            <input
              id="event-title"
              name="title"
              autoFocus
              placeholder="예: 2학기 학부모 공개수업"
              defaultValue={event?.title ?? ""}
              required
              maxLength={120}
            />
          </Field>
          <div className="form-two">
            <Field label="시작일" id="event-start">
              <input
                id="event-start"
                name="start_date"
                type="date"
                defaultValue={event?.start_date ?? date}
                required
              />
            </Field>
            <Field label="종료일" id="event-end">
              <input
                id="event-end"
                name="end_date"
                type="date"
                defaultValue={event?.end_date ?? date}
                required
              />
            </Field>
          </div>
          <div className="form-two">
            <Field label="행사 유형" id="event-type">
              <select
                id="event-type"
                name="event_type"
                defaultValue={event?.event_type ?? "school"}
              >
                {Object.entries(eventTypes).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="담당 부서" id="event-dept">
              <input
                id="event-dept"
                name="department"
                placeholder="예: 교무기획부"
                defaultValue={event?.department ?? ""}
                maxLength={60}
              />
            </Field>
          </div>
          <Field
            label="교육활동 영역"
            id="event-area"
            hint="행사 분류입니다. 시수는 수업·창체에서 교시와 대상 학년을 배정한 뒤 집계됩니다."
          >
            <select
              id="event-area"
              name="activity_area"
              defaultValue={event?.activity_area ?? "없음"}
            >
              {activityAreas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
          <fieldset className="grade-checkboxes">
            <legend>대상 학년</legend>
            {c.grades.map((g) => (
              <label key={g}>
                <input
                  name="grade"
                  type="checkbox"
                  value={g}
                  defaultChecked={
                    event ? event.target_grades.includes(g) : true
                  }
                />
                {g}학년
              </label>
            ))}
          </fieldset>
          <Field label="상세 내용" id="event-description">
            <textarea
              id="event-description"
              name="description"
              rows={3}
              placeholder="준비 사항이나 안내 내용을 기록하세요."
              defaultValue={event?.description ?? ""}
              maxLength={2000}
            />
          </Field>
        </fieldset>
        <InlineNotice mutation={m} />
        {editable ? (
          <div className="form-footer">
            {event ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirm(true)}
                disabled={m.pending}
              >
                <Trash2 />
                삭제
              </Button>
            ) : (
              <span />
            )}
            <SubmitButton pending={m.pending} />
          </div>
        ) : null}
      </form>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="이 일정을 삭제할까요?"
        description="달력과 월중·주간계획에서 함께 삭제됩니다. 삭제한 일정은 복구할 수 없습니다."
        pending={m.pending}
        onConfirm={() =>
          m.execute(
            () => deleteEvent(event!.id, c.workspace.id, event!.version),
            () => {
              setConfirm(false);
              onDone("일정이 삭제되었습니다.");
            },
          )
        }
      />
    </>
  );
}

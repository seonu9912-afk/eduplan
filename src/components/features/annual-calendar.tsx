"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { monthRange } from "@/lib/domain";
import {
  dayTypes,
  isTeachingDay,
  summarizeAcademicDays,
  type AcademicDay,
  type AnnualPlan,
} from "@/lib/academic";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
type Event = {
  id: string;
  start_date: string;
  end_date: string;
  title: string;
  activity_area: string;
};

export function TeachingSummary({
  days,
  plan,
}: {
  days: AcademicDay[];
  plan: AnnualPlan;
}) {
  const summary = summarizeAcademicDays(days, plan);
  return (
    <section className="teaching-summary" aria-label="수업일수 요약">
      <div className="teaching-counts" aria-live="polite" aria-atomic="true">
        {[
          ["연간 수업일수", summary.total],
          ["1학기 수업일수", summary.semesters[0]],
          ["2학기 수업일수", summary.semesters[1]],
        ].map(([label, value], i) => (
          <div className={i === 0 ? "primary" : ""} key={label}>
            <span>{label}</span>
            <strong>
              {value}
              <small>일</small>
            </strong>
          </div>
        ))}
      </div>
      <p>
        학기 안의 수업일·요일 교체를 날짜당 1일로 계산합니다.
        공휴일·방학·휴업일·사용 해제일은 제외합니다.
      </p>
      <div className="annual-break-counts">
        <span>
          공휴일 <b>{summary.holidays}일</b>
        </span>
        <span>
          재량휴업일 <b>{summary.discretionary}일</b>
        </span>
        {summary.vacations.map((v, i) => (
          <span key={i}>
            {v.name} <b>{v.days}일</b>
          </span>
        ))}
        {!!plan.vacations.length && <small>방학 기간은 주말·공휴일 포함</small>}
      </div>
    </section>
  );
}

export function AnnualCalendar({
  days,
  plan,
  events,
  selected,
  onSelect,
}: {
  days: AcademicDay[];
  plan: AnnualPlan;
  events: Event[];
  selected: string;
  onSelect: (date: string, button: HTMLButtonElement) => void;
}) {
  const summary = summarizeAcademicDays(days, plan);
  const byDate = new Map(days.map((d) => [d.date, d]));
  function cell(date: string, compact: boolean) {
    const d = byDate.get(date);
    if (!d) return null;
    const actual = new Date(date + "T12:00:00Z").getUTCDay();
    const titles = [
      ...events
        .filter((e) => e.start_date <= date && e.end_date >= date)
        .map(
          (e) =>
            `${e.title}${e.activity_area !== "없음" ? ` (${e.activity_area})` : ""}`,
        ),
      ...plan.allocations
        .filter(
          (a) => a.date === date && !events.some((e) => e.id === a.eventId),
        )
        .map((a) => a.title),
    ];
    const label = d.name || dayTypes[d.type];
    return (
      <button
        type="button"
        aria-label={`${date} ${label}`}
        aria-pressed={date === selected}
        className={`academic-day ${d.type} ${!d.enabled ? "inactive-day" : ""} ${date === selected ? "selected" : ""} ${!d.semester ? "outside-term" : ""}`}
        title={[
          date,
          label,
          !d.enabled
            ? "사용 해제"
            : isTeachingDay(d)
              ? "수업일"
              : "수업일 제외",
          !d.semester ? "학기 밖" : `${d.semester}학기`,
          ...titles,
        ].join(" · ")}
        onClick={(event) => onSelect(date, event.currentTarget)}
      >
        <span className="day-label">
          {compact ? weekdays[actual] : Number(date.slice(-2))}
          {d.type === "swap" && <b>→{weekdays[d.weekday]}</b>}
        </span>
        {d.name && <small>{d.name}</small>}
        {d.start && d.end && (
          <small>
            {d.start}~{d.end}교시
          </small>
        )}
        {!!titles.length && (
          <small className="day-event">{titles.join(" · ")}</small>
        )}
        {!d.enabled && <small>사용 해제</small>}
      </button>
    );
  }
  return (
    <section className="panel annual-calendar" aria-label="1년 학사일정">
      <div className="annual-calendar-heading">
        <div>
          <h2>연간 학사일정</h2>
          <p>날짜를 선택해 수업일·휴업일·요일 교체를 편집하세요.</p>
        </div>
      </div>
      <div className="annual-legend">
        {Object.entries(dayTypes).map(([key, label]) => (
          <span key={key}>
            <i className={`academic-day ${key}`} />
            {label}
          </span>
        ))}
        <span>
          <i className="academic-day outside-term" />
          학기 밖
        </span>
      </div>
      {
        <div
          className="annual-matrix-scroll"
          tabIndex={0}
          role="region"
          aria-label="3월부터 다음 해 2월까지 연간표"
        >
          <table className="annual-matrix">
            <colgroup>
              <col style={{ width: 42 }} />
              {summary.months.map(({ month }) => (
                <col key={month} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">일</th>
                {summary.months.map(({ month, days }) => (
                  <th scope="col" key={month}>
                    <span>{Number(month.slice(5))}월</span>
                    <small>{days}일 수업</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 31 }, (_, i) => (
                <tr key={i}>
                  <th scope="row">{i + 1}</th>
                  {summary.months.map(({ month }) => (
                    <td key={month}>
                      {cell(`${month}-${String(i + 1).padStart(2, "0")}`, true)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">수업일</th>
                {summary.months.map(({ month, days }) => (
                  <td key={month}>{days}일</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      }
    </section>
  );
}

export function VacationSettings({
  year,
  plan,
  editable,
  onChange,
  onMessage,
}: {
  year: number;
  plan: AnnualPlan;
  editable: boolean;
  onChange: (p: AnnualPlan) => void;
  onMessage: (message: string) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const start = `${year}-03-01`,
    end = monthRange(`${year + 1}-02`).end;
  return (
    <details
      className="panel vacation-settings no-print"
      open={!plan.vacations.length || undefined}
    >
      <summary>
        방학 설정{" "}
        <span>
          {plan.vacations.length
            ? `${plan.vacations.length}개 구간`
            : "여름·겨울·학년말 방학을 설정하세요"}
        </span>
      </summary>
      <div className="vacation-list">
        {plan.vacations.map((v, i) => (
          <div key={i}>
            <strong>{v.name}</strong>
            <span>
              {v.start} ~ {v.end}
            </span>
            {editable && (
              <div>
                <button
                  onClick={() => setEditing(i)}
                  aria-label={`${v.name} 수정`}
                >
                  수정
                </button>
                <button
                  onClick={() => {
                    onChange({
                      ...plan,
                      vacations: plan.vacations.filter((_, j) => j !== i),
                    });
                    setEditing(null);
                  }}
                  aria-label={`${v.name} 삭제`}
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <form
          className="annual-form-grid"
          key={editing ?? "new"}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const v = {
              name: String(f.get("name")).trim(),
              start: String(f.get("start")),
              end: String(f.get("end")),
            };
            if (!v.name || v.start > v.end || v.start < start || v.end > end) {
              onMessage("학년도 안의 방학 시작일과 종료일을 확인해 주세요.");
              return;
            }
            if (
              plan.vacations.some(
                (other, i) =>
                  i !== editing && other.start <= v.end && other.end >= v.start,
              )
            ) {
              onMessage(
                "다른 방학 구간과 날짜가 겹칩니다. 기존 구간을 수정해 주세요.",
              );
              return;
            }
            if (editing === null && plan.vacations.length >= 12) {
              onMessage("방학은 최대 12개 구간까지 설정할 수 있습니다.");
              return;
            }
            onChange({
              ...plan,
              vacations:
                editing === null
                  ? [...plan.vacations, v]
                  : plan.vacations.map((other, i) =>
                      i === editing ? v : other,
                    ),
            });
            e.currentTarget.reset();
            setEditing(null);
            onMessage(
              "방학을 반영했습니다. 수업일수를 확인하고 연간 계획을 저장해 주세요.",
            );
          }}
        >
          <label>
            방학명
            <input
              name="name"
              list="vacation-names"
              required
              maxLength={60}
              defaultValue={
                editing === null ? "" : plan.vacations[editing].name
              }
            />
          </label>
          <datalist id="vacation-names">
            <option>여름방학</option>
            <option>겨울방학</option>
            <option>학년말방학</option>
          </datalist>
          <label>
            방학 시작일
            <input
              type="date"
              name="start"
              min={start}
              max={end}
              required
              defaultValue={
                editing === null ? "" : plan.vacations[editing].start
              }
            />
          </label>
          <label>
            방학 종료일
            <input
              type="date"
              name="end"
              min={start}
              max={end}
              required
              defaultValue={editing === null ? "" : plan.vacations[editing].end}
            />
          </label>
          <Button variant="outline">
            {editing === null ? "방학 추가" : "방학 수정 적용"}
          </Button>
          {editing !== null && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
            >
              수정 취소
            </Button>
          )}
        </form>
      )}
      <p className="field-hint">
        기간 양 끝 날짜를 포함합니다. 날짜별 수동 수정은 방학보다 우선합니다.
      </p>
    </details>
  );
}

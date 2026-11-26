"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { useRef, useState } from "react";
import { areas, dayTypes, type AnnualPlan } from "@/lib/academic";
import { availablePeriods, calendarDates, eventVisiblePeriods, sharedEventArea, type Area, type EventDraft } from "@/lib/academic-calendar";
import type { Context } from "@/lib/models";

export function DateFields({ value, onChange, context, disabled }: {
  value: AnnualPlan["days"][string]; onChange: (v: AnnualPlan["days"][string]) => void; context: Context; disabled: boolean;
}) {
  const patch = (fields: Partial<typeof value>) => onChange({ ...value, ...fields });
  return <fieldset disabled={disabled} className="ar-fieldset ar-date-fields">
    <label>날짜 유형<select value={value.type} onChange={(e) => patch({ type: e.target.value as typeof value.type })}>
      {Object.entries(dayTypes).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
    </select></label>
    {value.type === "swap" && <label className="ar-swap-field">적용할 요일
      <select value={value.weekday} onChange={(e) => patch({ weekday: Number(e.target.value) })}>
        {[1,2,3,4,5].map((day) => <option key={day} value={day}>{"일월화수목금"[day]}요일</option>)}
      </select>
    </label>}
    <label>날짜 설명<input value={value.name} maxLength={100} placeholder="예: 여름방학, 개교기념일" onChange={(e) => patch({ name: e.target.value })}/></label>
    <label className="ar-check"><input type="checkbox" checked={value.enabled} onChange={(e) => patch({ enabled: e.target.checked })}/>이 날짜 설정 사용</label>
    {context.grades.length > 0 && <div className="ar-exceptions">
      <div className="ar-exception-options">
        <strong>운영교시 예외</strong>
        {context.grades.map((grade) => <label key={grade} className="ar-check">
          <input type="checkbox" checked={!!value.gradePeriods?.[grade]} onChange={(e) => {
            const next = { ...value.gradePeriods };
            if (e.target.checked) next[grade] = { start: value.start ?? 1, end: value.end ?? 6 };
            else delete next[grade];
            patch({ gradePeriods: next });
          }}/>{grade}학년
        </label>)}
      </div>
      {context.grades.some((grade) => !!value.gradePeriods?.[grade]) && <div className="ar-exception-ranges">
        {context.grades.filter((grade) => !!value.gradePeriods?.[grade]).map((grade) => <div key={grade} className="ar-exception-range">
          <span>{grade}학년</span>
          <input aria-label={`${grade}학년 시작 교시`} type="number" min={1} max={12} value={value.gradePeriods![grade].start}
            onChange={(e) => patch({ gradePeriods: { ...value.gradePeriods, [grade]: { ...value.gradePeriods![grade], start: Number(e.target.value) } } })}/>
          <span>~</span>
          <input aria-label={`${grade}학년 종료 교시`} type="number" min={1} max={12} value={value.gradePeriods![grade].end}
            onChange={(e) => patch({ gradePeriods: { ...value.gradePeriods, [grade]: { ...value.gradePeriods![grade], end: Number(e.target.value) } } })}/>
          <span>교시</span>
        </div>)}
      </div>}
      {value.start != null && <div className="ar-legacy-period"><span>기존 공통 예외 {value.start}~{value.end}교시</span>
        <button type="button" onClick={() => {
          const next = { ...value }; delete next.start; delete next.end; onChange(next);
        }}>기본 운영 교시 사용</button>
      </div>}
    </div>}
  </fieldset>;
}

export function EventFields({ value, onChange, context, plan, disabled }: {
  value: EventDraft; onChange: (v: EventDraft) => void; context: Context; plan: AnnualPlan; disabled: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [undo, setUndo] = useState<EventDraft["slots"][]>([]);
  const drag = useRef(false);
  const e = value.event;
  const dates = calendarDates(context.year!.year, e.start_date, e.end_date);
  const patch = (fields: Partial<typeof e>) => onChange({ ...value, event: { ...e, ...fields } });
  const selectedGrades = e.target_grades;
  const validScope = selectedGrades.length > 0;
  const periodColors: Record<Area, string> = {
    "교과": "subject", "자율": "autonomy", "자율·자치": "autonomy",
    "동아리": "club", "진로": "career", "봉사": "service",
    "학교자율시간": "school", "없음": "none",
  };
  const periodRanges = dates.flatMap((date) =>
    selectedGrades.map((grade) => availablePeriods(date, grade, plan, context)));
  const assignedPeriods = dates.flatMap((date) =>
    selectedGrades.flatMap((grade) => Object.keys(value.slots[`g:${grade}`]?.[date] ?? {}).map(Number)));
  const periods = eventVisiblePeriods(periodRanges, assignedPeriods);
  const allPeriodKeys = dates.flatMap((date) => periods
    .filter((period) => selectedGrades.every((grade) => {
      const range = availablePeriods(date, grade, plan, context);
      return !!range && period >= range.start && period <= range.end;
    }))
    .map((period) => `${date}/${period}`));
  function displayedArea(date: string, period: number): Area | "mixed" | null {
    return sharedEventArea(selectedGrades.map((grade) => value.slots[`g:${grade}`]?.[date]?.[period]));
  }
  function apply(area: Area) {
    if (!selected.length || disabled || !validScope) return;
    const next = structuredClone(value.slots);
    for (const key of selected) {
      const [date, periodText] = key.split("/");
      const period = Number(periodText);
      for (const grade of selectedGrades) {
        const target = `g:${grade}`;
        const changed = { ...next[target]?.[date] };
        if (area === "없음") delete changed[period];
        else changed[period] = area;
        next[target] ??= {};
        next[target][date] = changed;
      }
    }
    setUndo((old) => [...old.slice(-19), structuredClone(value.slots)]);
    onChange({ ...value, slots: next });
    setSelected([]);
  }
  const overlap = context.events.filter((other) => other.id !== e.id && other.start_date <= e.end_date && other.end_date >= e.start_date &&
    other.target_grades.some((g) => selectedGrades.includes(g)) && (!(e.target_class_ids?.length && other.target_class_ids?.length) || e.target_class_ids.some((id) => other.target_class_ids!.includes(id))));
  return <fieldset disabled={disabled} className="ar-fieldset ar-event">
    <div className="ar-fields ar-event-header">
      <label>행사명<input value={e.title} maxLength={120} onChange={(event) => patch({ title: event.target.value })}/></label>
      <label>담당 부서
        <input required aria-required="true" value={e.department} maxLength={60}
          list={`ar-department-options-${e.id}`} placeholder="담당 부서를 입력하세요"
          onChange={(event) => patch({ department: event.target.value })}/>
        <datalist id={`ar-department-options-${e.id}`}>{plan.departments.map((department) =>
          <option key={department} value={department}/>)}</datalist>
      </label>
      <label>시작일<input type="date" value={e.start_date} onChange={(event) => patch({ start_date: event.target.value, end_date: e.end_date < event.target.value ? event.target.value : e.end_date })}/></label>
      <label>종료일<input type="date" value={e.end_date} onChange={(event) => patch({ end_date: event.target.value })}/></label>
    </div>
    <fieldset className="ar-grade-fieldset"><legend>대상 학년</legend>
      <div className="ar-grade-options">{context.grades.map((g) => <label key={g} className="ar-check ar-grade-option">
        <input type="checkbox" checked={selectedGrades.includes(g)} onChange={(event) => {
          const target_grades = event.target.checked ? [...selectedGrades, g].sort((a,b) => a-b) : selectedGrades.filter((x) => x !== g);
          setSelected([]);
          patch({ target_grades, target_class_ids: (e.target_class_ids ?? []).filter((id) => target_grades.includes(context.classes.find((c) => c.id === id)?.grade ?? 0)) });
        }}/><span>{g}학년</span>
      </label>)}</div>
    </fieldset>
    <section className="ar-event-periods"><h3>행사 교시 지정 · 날짜별 편성</h3>
      <p className="ar-muted">행사가 진행되는 교시를 선택하고 교과·자율·동아리 등의 버튼을 누르세요. 지정하지 않은 교시는 기존 시간표대로 유지됩니다.</p>
      {!validScope ? <p role="status">편성할 대상 학년을 선택해 주세요.</p> : <>
        <div className="ar-period-toolbar">
          <div className="ar-period-toolhead"><strong>{selected.length}교시 선택</strong>
            <button type="button" disabled={!allPeriodKeys.length} onClick={() => setSelected(allPeriodKeys)}>전체 선택</button>
            <button type="button" disabled={!selected.length} onClick={() => setSelected([])}>전체 해제</button>
            <button type="button" disabled={!undo.length} onClick={() => {
              onChange({ ...value, slots: undo.at(-1)! });
              setUndo((old) => old.slice(0,-1));
              setSelected([]);
            }}>실행 취소</button>
          </div>
          <div className="ar-period-area-buttons" aria-label="선택한 교시에 배정할 영역">
            {areas.filter((area) => area !== "없음").map((area) => <button type="button"
              key={area} className="ar-area-action" disabled={!selected.length} onClick={() => apply(area)}>
              <span className={`ar-area-chip ar-area-${periodColors[area]}`}>{area}</span>
            </button>)}
            <button type="button" className="ar-period-clear" disabled={!selected.length}
              onClick={() => apply("없음")}>교시 지정 해제</button>
          </div>
        </div>
        {dates.length > 0 ? <div className="ar-scroll ar-period-scroll" onPointerUp={() => { drag.current = false; }}
          onPointerLeave={() => { drag.current = false; }}>
          <table className="ar-period-grid"><thead><tr><th>날짜</th>{periods.map((period) => <th key={period}>{period}교시</th>)}</tr></thead>
            <tbody>{dates.map((date) => {
              const ranges = selectedGrades.map((g) => availablePeriods(date, g, plan, context));
              return <tr key={date}><th>{date.slice(5)}</th>
                {periods.map((period) => {
                  const key = `${date}/${period}`;
                  const area = displayedArea(date, period);
                  const outside = ranges.some((range) => !range || period < range.start || period > range.end);
                  const label = area === "mixed" ? "학년별 상이" : area ?? "미지정";
                  const selectedNow = selected.includes(key);
                  return <td key={period} className={outside ? "ar-period-outside" : undefined}>
                    <button type="button" className="ar-period-button"
                      aria-label={`${date} ${period}교시 ${label}${outside ? " (일부 또는 전체 학년 운영 교시 범위 밖)" : ""}`}
                      title={outside ? "운영 교시 범위 밖 · 지정 내용은 보존됩니다" : undefined}
                      aria-pressed={selectedNow}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        drag.current = true;
                        setSelected((old) => old.includes(key) ? old.filter((x) => x!==key) : [...old,key]);
                      }}
                      onPointerEnter={() => {
                        if (drag.current) setSelected((old) => [...new Set([...old,key])]);
                      }}
                      onClick={(event) => {
                        drag.current = false;
                        if (event.detail === 0) setSelected((old) => old.includes(key) ? old.filter((x) => x!==key) : [...old,key]);
                      }}>
                      <span className={`ar-area-chip ar-area-${area === "mixed" ? "mixed" : area ? periodColors[area] : "unset"}`}>{label}</span>
                    </button>
                  </td>;
                })}</tr>;
            })}</tbody></table>
        </div> : <p className="ar-muted">행사 기간을 먼저 선택해 주세요.</p>}
        <p className="ar-muted">전체 선택은 모든 대상 학년의 운영 교시에 해당하는 칸을 선택합니다. 노란 칸은 일부 학년의 운영 교시 밖이며, 개별 선택은 가능합니다.</p>
      </>}
    </section>
    <Disclosure compact label="특정 학급만 행사 대상 지정 · 비고">
      <p>학급을 선택하지 않으면 체크한 학년의 모든 학급이 행사 대상입니다. 특정 학급만 참여하는 행사일 때만 선택해 주세요.</p>
      <div className="ar-tools">{context.classes.filter((c) => selectedGrades.includes(c.grade)).map((c) => <label key={c.id} className="ar-check">
        <input type="checkbox" checked={e.target_class_ids?.includes(c.id) ?? false} onChange={(event) => patch({ target_class_ids: event.target.checked ? [...(e.target_class_ids ?? []),c.id] : e.target_class_ids?.filter((id) => id !== c.id) })}/>{c.grade}-{c.class_number}</label>)}</div>
      <label>비고<textarea value={e.description} maxLength={2000} onChange={(event) => patch({ description: event.target.value })}/></label>
    </Disclosure>
    {!!overlap.length && <div className="ar-callout"><strong>기간·대상이 겹치는 행사 {overlap.length}건</strong><p>운영 교시가 겹치면 시수는 중복 합산하지 않고 확인 필요로 표시합니다. 확인한 뒤 저장할 수 있습니다.</p>
      {overlap.map((other) => <p key={other.id}>{other.title} · {other.start_date}~{other.end_date} · {other.target_grades.join(", ")}학년</p>)}</div>}
  </fieldset>;
}

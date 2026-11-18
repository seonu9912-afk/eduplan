"use client";
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
  const [scope, setScope] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [undo, setUndo] = useState<EventDraft["slots"][]>([]);
  const drag = useRef(false);
  const e = value.event;
  const dates = calendarDates(context.year!.year, e.start_date, e.end_date);
  const patch = (fields: Partial<typeof e>) => onChange({ ...value, event: { ...e, ...fields } });
  const grade = scope.startsWith("g:") ? Number(scope.slice(2)) :
    scope.startsWith("c:") ? context.classes.find((c) => c.id === scope.slice(2))?.grade ?? 0 : 0;
  const selectedGrades = e.target_grades;
  const validScope = scope === "all" ? selectedGrades.length > 0 :
    scope.startsWith("g:") ? selectedGrades.includes(grade) :
    context.classes.some((c) => `c:${c.id}` === scope && selectedGrades.includes(c.grade));
  const slots = (date: string) => value.slots[scope]?.[date] ?? value.slots[`g:${grade}`]?.[date] ?? {};
  const periodColors: Record<Area, string> = {
    "교과": "subject", "자율": "autonomy", "자율·자치": "autonomy",
    "동아리": "club", "진로": "career", "봉사": "service",
    "학교자율시간": "school", "없음": "none",
  };
  const activeGrades = scope === "all" ? selectedGrades : [grade];
  const periodRanges = dates.flatMap((date) =>
    activeGrades.map((g) => availablePeriods(date, g, plan, context)));
  const assignedPeriods = dates.flatMap((date) => scope === "all" ?
    selectedGrades.flatMap((g) => Object.keys(value.slots[`g:${g}`]?.[date] ?? {}).map(Number)) :
    Object.keys(slots(date)).map(Number));
  const periods = eventVisiblePeriods(periodRanges, assignedPeriods);
  function displayedArea(date: string, period: number): Area | "mixed" | null {
    if (scope === "all") {
      return sharedEventArea(selectedGrades.map((g) => value.slots[`g:${g}`]?.[date]?.[period]));
    }
    return slots(date)[period] ?? null;
  }
  function apply(area: Area) {
    if (!selected.length || disabled || !validScope) return;
    const next = structuredClone(value.slots);
    for (const key of selected) {
      const [date, period] = key.split("/");
      const targets = scope === "all" ? selectedGrades.map((g) => `g:${g}`) : [scope];
      for (const target of targets) {
        const currentGrade = target.startsWith("g:") ? Number(target.slice(2)) :
          context.classes.find((c) => `c:${c.id}` === target)?.grade ?? 0;
        const previous = next[target]?.[date] ?? { ...value.slots[`g:${currentGrade}`]?.[date] };
        const changed = { ...previous };
        if (area === "없음") delete changed[Number(period)];
        else changed[Number(period)] = area;
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
      <label>담당 부서 <span className="ar-required">필수</span>
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
          setScope("all");
          patch({ target_grades, target_class_ids: (e.target_class_ids ?? []).filter((id) => target_grades.includes(context.classes.find((c) => c.id === id)?.grade ?? 0)) });
        }}/><span>{g}학년</span>
      </label>)}</div>
    </fieldset>
    <details open className="ar-event-periods"><summary>행사 교시 지정 · 날짜별 편성</summary>
      <p className="ar-muted">행사가 진행되는 교시를 선택하고 교과·자율·동아리 등의 버튼을 누르세요. 지정하지 않은 교시는 기존 시간표대로 유지됩니다.</p>
      <div className="ar-scope-row ar-scope-default">
        <div className="ar-scope-current">
          <strong>편성 대상</strong>
          <span>{scope === "all" ? "선택한 학년 전체" :
            scope.startsWith("g:") ? `${grade}학년 별도 편성` :
            `${grade}학년 ${context.classes.find((c) => `c:${c.id}` === scope)?.class_number ?? "-"}반 예외 편성`}</span>
          {scope !== "all" && <button type="button" onClick={() => { setScope("all"); setSelected([]); }}>
            전체 학년 공통으로 돌아가기
          </button>}
        </div>
        <details className="ar-scope-advanced">
          <summary>특정 학급만 다르게 편성</summary>
          <label>세부 편성 대상<select value={scope} onChange={(event) => { setScope(event.target.value); setSelected([]); }}>
            <option value="all">선택한 학년 전체 (공통)</option>
            <optgroup label="특정 학급 예외">
              {context.classes.filter((c) => selectedGrades.includes(c.grade)).map((c) =>
                <option key={c.id} value={`c:${c.id}`}>{c.grade}학년 {c.class_number}반</option>)}
            </optgroup>
            <optgroup label="학년별 개별 편성">
              {selectedGrades.map((g) => <option key={g} value={`g:${g}`}>{g}학년 개별</option>)}
            </optgroup>
          </select></label>
        </details>
      </div>
      {!validScope ? <p role="status">편성할 대상 학년을 선택해 주세요.</p> : <>
        <div className="ar-period-toolbar">
          <div className="ar-period-toolhead"><strong>{selected.length}교시 선택</strong>
            <button type="button" disabled={!selected.length} onClick={() => setSelected([])}>선택 해제</button>
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
            <button type="button" className="ar-period-clear" disabled={!selected.length || scope.startsWith("c:")}
              title={scope.startsWith("c:") ? "학급 예외는 날짜별 공통 사용을 통해 해제할 수 있습니다." : undefined}
              onClick={() => apply("없음")}>교시 지정 해제</button>
          </div>
        </div>
        {dates.length > 0 ? <div className="ar-scroll ar-period-scroll" onPointerUp={() => { drag.current = false; }}
          onPointerLeave={() => { drag.current = false; }}>
          <table className="ar-period-grid"><thead><tr><th>날짜</th>{periods.map((period) => <th key={period}>{period}교시</th>)}</tr></thead>
            <tbody>{dates.map((date) => {
              const ranges = activeGrades.map((g) => availablePeriods(date, g, plan, context));
              return <tr key={date}><th>{date.slice(5)}
                {scope.startsWith("c:") && value.slots[scope]?.[date] && <button type="button"
                  className="ar-use-common" onClick={() => {
                    const next = structuredClone(value.slots);
                    delete next[scope][date];
                    onChange({ ...value, slots: next });
                    setSelected([]);
                  }}>공통 사용</button>}</th>
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
        <p className="ar-muted">대상 학년의 운영 교시 범위와 기존 배정 교시만 표시합니다. 노란 칸은 일부 학년의 운영 교시 범위를 벗어난 시간입니다.</p>
      </>}
    </details>
    <details><summary>특정 학급만 행사 대상 지정 · 비고</summary>
      <p>학급을 선택하지 않으면 체크한 학년의 모든 학급이 행사 대상입니다. 특정 학급만 참여하는 행사일 때만 선택해 주세요.</p>
      <div className="ar-tools">{context.classes.filter((c) => selectedGrades.includes(c.grade)).map((c) => <label key={c.id} className="ar-check">
        <input type="checkbox" checked={e.target_class_ids?.includes(c.id) ?? false} onChange={(event) => patch({ target_class_ids: event.target.checked ? [...(e.target_class_ids ?? []),c.id] : e.target_class_ids?.filter((id) => id !== c.id) })}/>{c.grade}-{c.class_number}</label>)}</div>
      <label>비고<textarea value={e.description} maxLength={2000} onChange={(event) => patch({ description: event.target.value })}/></label>
    </details>
    {!!overlap.length && <div className="ar-callout"><strong>기간·대상이 겹치는 행사 {overlap.length}건</strong><p>운영 교시가 겹치면 시수는 중복 합산하지 않고 확인 필요로 표시합니다. 확인한 뒤 저장할 수 있습니다.</p>
      {overlap.map((other) => <p key={other.id}>{other.title} · {other.start_date}~{other.end_date} · {other.target_grades.join(", ")}학년</p>)}</div>}
  </fieldset>;
}

"use client";
import { useRef, useState } from "react";
import { areas, dayTypes, type AnnualPlan } from "@/lib/academic";
import { availablePeriods, calendarDates, type Area, type EventDraft } from "@/lib/academic-calendar";
import type { Context } from "@/lib/models";

export function DateFields({ value, onChange, context, disabled }: {
  value: AnnualPlan["days"][string]; onChange: (v: AnnualPlan["days"][string]) => void; context: Context; disabled: boolean;
}) {
  const patch = (fields: Partial<typeof value>) => onChange({ ...value, ...fields });
  return <fieldset disabled={disabled} className="ar-fieldset">
    <label>날짜 유형<select value={value.type} onChange={(e) => patch({ type: e.target.value as typeof value.type })}>
      {Object.entries(dayTypes).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
    </select></label>
    <label>날짜 설명<input value={value.name} maxLength={100} placeholder="예: 여름방학, 개교기념일" onChange={(e) => patch({ name: e.target.value })}/></label>
    <label className="ar-check"><input type="checkbox" checked={value.enabled} onChange={(e) => patch({ enabled: e.target.checked })}/>이 날짜 설정 사용</label>
    <details><summary>고급 설정</summary>
      <p>요일교체는 날짜 유형을 ‘요일 교체’로 선택합니다. 운영 교시는 수업일에만 계산됩니다.</p>
      <label>적용할 요일<select disabled={value.type !== "swap"} value={value.weekday} onChange={(e) => patch({ weekday: Number(e.target.value) })}>
        {[1,2,3,4,5].map((day) => <option key={day} value={day}>{"일월화수목금"[day]}요일</option>)}
      </select></label>
      {context.grades.map((grade) => <div key={grade} className="ar-tools">
        <label className="ar-check"><input type="checkbox" checked={!!value.gradePeriods?.[grade]} onChange={(e) => {
          const next = { ...value.gradePeriods };
          if (e.target.checked) next[grade] = { start: value.start ?? 1, end: value.end ?? 1 }; else delete next[grade];
          patch({ gradePeriods: next });
        }}/>{grade}학년 운영 교시 예외</label>
        {value.gradePeriods?.[grade] && <>
          <input aria-label={`${grade}학년 시작 교시`} type="number" min={1} max={12} value={value.gradePeriods[grade].start}
            onChange={(e) => patch({ gradePeriods: { ...value.gradePeriods, [grade]: { ...value.gradePeriods![grade], start: Number(e.target.value) } } })}/>
          <span>~</span><input aria-label={`${grade}학년 종료 교시`} type="number" min={1} max={12} value={value.gradePeriods[grade].end}
            onChange={(e) => patch({ gradePeriods: { ...value.gradePeriods, [grade]: { ...value.gradePeriods![grade], end: Number(e.target.value) } } })}/>
        </>}
      </div>)}
      {value.start != null && <p>기존 공통 예외: {value.start}~{value.end}교시 <button type="button" onClick={() => { const next = { ...value }; delete next.start; delete next.end; onChange(next); }}>기본 운영 교시 사용</button></p>}
    </details>
  </fieldset>;
}

export function EventFields({ value, onChange, context, plan, disabled }: {
  value: EventDraft; onChange: (v: EventDraft) => void; context: Context; plan: AnnualPlan; disabled: boolean;
}) {
  const [scope, setScope] = useState(`g:${value.event.target_grades[0] ?? context.grades[0]}`);
  const [selected, setSelected] = useState<string[]>([]);
  const [undo, setUndo] = useState<EventDraft["slots"][]>([]);
  const drag = useRef(false);
  const e = value.event;
  const dates = calendarDates(context.year!.year, e.start_date, e.end_date);
  const patch = (fields: Partial<typeof e>) => onChange({ ...value, event: { ...e, ...fields } });
  const grade = scope.startsWith("g:") ? Number(scope.slice(2)) : context.classes.find((c) => c.id === scope.slice(2))?.grade ?? 0;
  const selectedGrades = e.target_grades;
  const validScope = scope.startsWith("g:") ? selectedGrades.includes(grade) : context.classes.some((c) => `c:${c.id}` === scope && selectedGrades.includes(c.grade));
  const slots = (date: string) => value.slots[scope]?.[date] ?? value.slots[`g:${grade}`]?.[date] ?? {};
  function apply(area: Area) {
    const next = structuredClone(value.slots);
    for (const key of selected) {
      const [date, period] = key.split("/");
      next[scope] ??= {};
      next[scope][date] ??= { ...slots(date) };
      next[scope][date][Number(period)] = area;
    }
    setUndo((old) => [...old.slice(-19), structuredClone(value.slots)]);
    onChange({ ...value, slots: next });
  }
  const overlap = context.events.filter((other) => other.id !== e.id && other.start_date <= e.end_date && other.end_date >= e.start_date &&
    other.target_grades.some((g) => selectedGrades.includes(g)) && (!(e.target_class_ids?.length && other.target_class_ids?.length) || e.target_class_ids.some((id) => other.target_class_ids!.includes(id))));
  return <fieldset disabled={disabled} className="ar-fieldset ar-event">
    <div className="ar-fields">
      <label>행사명<input value={e.title} maxLength={120} onChange={(event) => patch({ title: event.target.value })}/></label>
      <label>시작일<input type="date" value={e.start_date} onChange={(event) => patch({ start_date: event.target.value, end_date: e.end_date < event.target.value ? event.target.value : e.end_date })}/></label>
      <label>종료일<input type="date" value={e.end_date} onChange={(event) => patch({ end_date: event.target.value })}/></label>
    </div>
    <fieldset><legend>대상 학년</legend><div className="ar-tools">{context.grades.map((g) => <label key={g} className="ar-check"><input type="checkbox" checked={selectedGrades.includes(g)} onChange={(event) => {
      const target_grades = event.target.checked ? [...e.target_grades, g].sort() : e.target_grades.filter((x) => x !== g);
      patch({ target_grades, target_class_ids: (e.target_class_ids ?? []).filter((id) => target_grades.includes(context.classes.find((c) => c.id === id)?.grade ?? 0)) });
    }}/>{g}학년</label>)}</div></fieldset>
    <details open><summary>날짜별·교시별 창체 편성</summary>
      <p>모든 운영 교시는 교과로 시작합니다. 창체로 운영할 교시만 선택하세요. 비연속 교시는 Ctrl/⌘ 또는 개별 클릭으로 함께 선택할 수 있습니다.</p>
      <label>편성 대상<select value={scope} onChange={(event) => { setScope(event.target.value); setSelected([]); }}>
        {selectedGrades.map((g) => <option key={g} value={`g:${g}`}>{g}학년 공통</option>)}
        {context.classes.filter((c) => selectedGrades.includes(c.grade)).map((c) => <option key={c.id} value={`c:${c.id}`}>{c.grade}학년 {c.class_number}반 예외</option>)}
      </select></label>
      {!validScope ? <p role="status">편성할 학년 또는 학급을 선택하세요.</p> : <>
        <div className="ar-tools ar-assignment">{areas.filter((a) => a !== "없음").map((a) => <button type="button" key={a} disabled={!selected.length} onClick={() => apply(a)}>{a}로 변경</button>)}
          <span>{selected.length}교시 선택</span><button type="button" onClick={() => setSelected([])}>선택 해제</button>
          <button type="button" disabled={!undo.length} onClick={() => { onChange({ ...value, slots: undo.at(-1)! }); setUndo((old) => old.slice(0,-1)); }}>실행 취소</button>
        </div>
        <div className="ar-scroll" onPointerUp={() => { drag.current = false; }} onPointerLeave={() => { drag.current = false; }}>
          <table><thead><tr><th>날짜</th>{Array.from({ length: 12 }, (_, i) => <th key={i}>{i+1}교시</th>)}</tr></thead>
            <tbody>{dates.map((date) => {
              const range = availablePeriods(date, grade, plan, context);
              return <tr key={date}><th>{date.slice(5)}{scope.startsWith("c:") && value.slots[scope]?.[date] && <button type="button" onClick={() => {
                const next = structuredClone(value.slots); delete next[scope][date]; onChange({ ...value, slots: next });
              }}>공통 사용</button>}</th>{Array.from({ length: 12 }, (_, index) => {
                const p = index+1, key = `${date}/${p}`, outside = !range || p < range.start || p > range.end;
                return <td key={p} className={outside ? "ar-outside" : ""}><button type="button" aria-label={`${date} ${p}교시 ${slots(date)[p] ?? "교과"}`} aria-pressed={selected.includes(key)}
                  onPointerDown={(event) => { if (event.button !== 0) return; drag.current = true;
                    setSelected((old) => old.includes(key) ? old.filter((x) => x !== key) : [...old,key]); }}
                  onPointerEnter={() => { if (drag.current) setSelected((old) => [...new Set([...old,key])]); }}
                  onClick={(event) => { drag.current = false; if (event.detail === 0) setSelected((old) => old.includes(key) ? old.filter((x) => x !== key) : [...old,key]); }}>
                  {slots(date)[p] ?? "교과"}</button></td>;
              })}</tr>;
            })}</tbody></table>
        </div><p className="ar-muted">노란 칸은 운영 교시 밖이거나 운영 교시가 미설정된 칸입니다. 입력은 보존하며 시수 계산에서는 제외됩니다.</p>
      </>}
    </details>
    <details><summary>대상 학급·부서·비고</summary>
      <p>대상 학급을 선택하지 않으면 학년 전체에 적용합니다.</p>
      <div className="ar-tools">{context.classes.filter((c) => selectedGrades.includes(c.grade)).map((c) => <label key={c.id} className="ar-check">
        <input type="checkbox" checked={e.target_class_ids?.includes(c.id) ?? false} onChange={(event) => patch({ target_class_ids: event.target.checked ? [...(e.target_class_ids ?? []),c.id] : e.target_class_ids?.filter((id) => id !== c.id) })}/>{c.grade}-{c.class_number}</label>)}</div>
      <label>부서<input value={e.department} maxLength={60} onChange={(event) => patch({ department: event.target.value })}/></label>
      <label>비고<textarea value={e.description} maxLength={2000} onChange={(event) => patch({ description: event.target.value })}/></label>
    </details>
    {!!overlap.length && <div className="ar-callout"><strong>기간·대상이 겹치는 행사 {overlap.length}건</strong><p>운영 교시가 겹치면 시수는 중복 합산하지 않고 확인 필요로 표시합니다. 확인한 뒤 저장할 수 있습니다.</p>
      {overlap.map((other) => <p key={other.id}>{other.title} · {other.start_date}~{other.end_date} · {other.target_grades.join(", ")}학년</p>)}</div>}
  </fieldset>;
}

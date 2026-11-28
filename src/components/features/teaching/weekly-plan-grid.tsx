"use client";

import { Disclosure } from "@/components/ui/disclosure";
import { useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import "./weekly-plan-grid.css";
import { Modal } from "@/components/common";
import { Button } from "@/components/ui/button";
import { emptyUnit, type TeachingUnit } from "@/lib/teaching";
import type { Context, Row } from "@/lib/models";
import {
  bindTeachingCalendarGrid,
  type TeachingWeek,
} from "@/lib/teaching-calendar-grid";
import type { LinkedCalendar } from "@/lib/teaching-calendar-context";
import type { AssessmentChoice } from "@/lib/teaching-authoring";
import { StandardPicker } from "./standards-picker";
import { LessonLinks } from "./assessment-links";
import { LessonEditor } from "./lesson-editor";

const fields = {
  title: { label: "단원명", max: 200 },
  content: { label: "평가요소", max: 5000 },
  method: { label: "수업방법(재구성)", max: 1000 },
  assessment_method: { label: "평가방법", max: 2000 },
  alignment: { label: "수업·평가 연계 주안점", max: 2000 },
  note: { label: "직접 작성 비고", max: 2000 },
} as const;
type Field = keyof typeof fields;
type Props = {
  context: Context;
  course: Row<"teaching_courses">;
  units: TeachingUnit[];
  calendar: LinkedCalendar;
  choices: AssessmentChoice[];
  onOpenAssessment: (id: string, semester: number) => void;
  onChange: (units: TeachingUnit[]) => void;
  editable: boolean;
};

function moveCell(event: KeyboardEvent<HTMLTextAreaElement>) {
  // Plain arrows retain the caret behavior needed to edit multiline content.
  if (
    !event.altKey ||
    !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
  )
    return;
  const cell = event.currentTarget;
  const row = Number(cell.dataset.row);
  const column = Number(cell.dataset.column);
  const targetRow =
    row + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0);
  const targetColumn =
    column +
    (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0);
  const next = cell
    .closest("table")
    ?.querySelector<HTMLTextAreaElement>(
      `textarea[data-row="${targetRow}"][data-column="${targetColumn}"]`,
    );
  if (next) {
    event.preventDefault();
    next.focus();
  }
}

export function WeeklyPlanGrid({ calendar, ...props }: Props) {
  const {
    context,
    course,
    units,
    onChange,
    editable,
    choices,
    onOpenAssessment,
  } = props;
  const { rows, unattached } = bindTeachingCalendarGrid(calendar.weeks, units);
  const [weekAnchor, setWeekAnchor] = useState("");
  const [wide, setWide] = useState(false);
  const namedWeeks = rows.filter(({unit}) => !!unit?.title.trim()).length;
  const firstUnnamed = rows.find(({unit}) => !unit?.title.trim());
  const jumpToUnnamed = () => {
    if (!firstUnnamed) return;
    setWeekAnchor(firstUnnamed.week.anchor);
    window.requestAnimationFrame(() => {
      const mobile = window.matchMedia("(max-width: 767px)").matches && !wide;
      const container = mobile ? document.getElementById(`teaching-mobile-week-${firstUnnamed.week.anchor}`) : document.querySelector(`[data-week-anchor="${firstUnnamed.week.anchor}"]`);
      container?.scrollIntoView({block:"nearest"});
      container?.querySelector<HTMLTextAreaElement>("textarea")?.focus({preventScroll:true});
    });
  };
  const mobileRow =
    rows.find((row) => row.week.anchor === weekAnchor) ?? rows[0];
  const [expanded, setExpanded] = useState<{
    anchor: string;
    field: Field;
  } | null>(null);
  const [past, setPast] = useState<TeachingUnit[][]>([]);
  const [future, setFuture] = useState<TeachingUnit[][]>([]);
  const [group, setGroup] = useState<string | null>(null);
  const update = (
    week: TeachingWeek,
    unit: TeachingUnit | undefined,
    patch: Partial<TeachingUnit>,
    editField?: Field,
  ) => {
    const next = unit
      ? units.map((u) => (u.id === unit.id ? { ...u, ...patch } : u))
      : [
          ...units,
          {
            ...emptyUnit(),
            start: week.start,
            end: week.end,
            month: week.month,
            week: week.week,
            day: week.day,
            period: week.period,
            ...patch,
          },
        ];
    const editKey = editField ? week.anchor + "/" + editField : null;
    if (editKey === null || group !== editKey)
      setPast((h) => [...h.slice(-39), units]);
    setGroup(editKey);
    setFuture([]);
    onChange(next);
  };
  const undo = () => {
    const last = past.at(-1);
    if (last) {
      setPast(past.slice(0, -1));
      setFuture([...future, units]);
      setGroup(null);
      onChange(last);
    }
  };
  const redo = () => {
    const next = future.at(-1);
    if (next) {
      setFuture(future.slice(0, -1));
      setPast([...past, units]);
      setGroup(null);
      onChange(next);
    }
  };
  const selected =
    expanded && rows.find((row) => row.week.anchor === expanded.anchor);
  const cell = (
    week: TeachingWeek,
    unit: TeachingUnit | undefined,
    field: Field,
    row: number,
    column: number,
  ) => (
    <div className="teaching-week-cell">
      <div className="teaching-cell-fit">
        <div className="teaching-cell-mirror" aria-hidden="true">{unit?.[field] ?? ""}{"\u200b"}</div>
      <textarea
        aria-label={`${week.period} ${fields[field].label}`}
        data-row={row}
        data-column={column}
        value={unit?.[field] ?? ""}
        rows={3}
        maxLength={fields[field].max}
        readOnly={!editable}
        onKeyDown={moveCell}
        onBlur={() => setGroup(null)}
        onChange={(event) =>
          update(week, unit, { [field]: event.target.value }, field)
        }
      />
      </div>
      {editable && (
        <button
          type="button"
          className="teaching-cell-expand"
          aria-label={`${week.period} ${fields[field].label} 확장`}
          tabIndex={-1}
          onClick={() => setExpanded({ anchor: week.anchor, field })}
        >
          확장
        </button>
      )}
    </div>
  );
  return (
    <section className="teaching-section teaching-week-section">
      {calendar.issue && (
        <p role="status" className="muted">
          {calendar.issue}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <div className="teaching-week-toolbar no-print">
            <div className="teaching-week-toolbar-heading">
              <h2>교수학습계획</h2>
              <div className="teaching-actions">
                {editable && <>
                  <Button variant="ghost" size="sm" disabled={!past.length} onClick={undo}>입력 취소</Button>
                  <Button variant="ghost" size="sm" disabled={!future.length} onClick={redo}>다시 실행</Button>
                </>}
              </div>
            </div>
            <div className="teaching-week-toolbar-progress">
              <div className="teaching-week-progress-summary">
                <span title="단원명 입력 여부만 집계하며 계획의 완성도를 의미하지 않습니다.">단원명 입력 <strong>{namedWeeks}/{rows.length}주</strong></span>
                <progress aria-label="단원명 입력 주차" value={namedWeeks} max={rows.length}/>
              </div>
              <div className="teaching-week-toolbar-actions">
                {editable && <Button variant="ghost" size="sm" disabled={!firstUnnamed} onClick={jumpToUnnamed}>첫 미입력 주차</Button>}
                <div className="mobile-only">
                  <Button variant="ghost" size="sm" onClick={() => setWide(!wide)}>
                    {wide ? "주차별 편집" : "전체 편성표"} <ChevronRight size={14}/>
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="mobile-only no-print">
            {!wide && mobileRow && (
              <>
                <div className="mobile-view-toolbar teaching-week-navigation">
                  <Button variant="outline" size="sm" aria-label="이전 주차" disabled={rows.indexOf(mobileRow) <= 0} onClick={() => { const previous = rows[rows.indexOf(mobileRow)-1]; if(previous) setWeekAnchor(previous.week.anchor); }}><ChevronLeft size={18}/></Button>
                  <label>
                    <select
                      aria-label={editable ? "작성할 주차" : "조회할 주차"}
                      value={mobileRow.week.anchor}
                      onChange={(e) => setWeekAnchor(e.target.value)}
                    >
                      {rows.map(({ week }) => (
                        <option key={week.anchor} value={week.anchor}>
                          {week.period} · {week.day}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button variant="outline" size="sm" aria-label="다음 주차" disabled={rows.indexOf(mobileRow) >= rows.length-1} onClick={() => { const next = rows[rows.indexOf(mobileRow)+1]; if(next) setWeekAnchor(next.week.anchor); }}><ChevronRight size={18}/></Button>
                </div>
                {(() => {
                  const { week, unit } = mobileRow;
                  const renderMobileField = (field: Field) => (
                    <label key={field} className="teaching-mobile-field" data-field={field}>
                      <span className="teaching-mobile-field-label">{fields[field].label}</span>
                      {editable ? (
                        <div className="teaching-mobile-field-fit">
                          <div aria-hidden="true" className="teaching-mobile-field-mirror">{unit?.[field] ?? ""}{"\u200b"}</div>
                          <textarea
                            rows={field === "title" ? 1 : 2}
                            maxLength={fields[field].max}
                            value={unit?.[field] ?? ""}
                            onBlur={() => setGroup(null)}
                            onChange={(e) => update(week, unit, { [field]: e.target.value }, field)}
                          />
                        </div>
                      ) : <p className="teaching-read-value">{unit?.[field] || "—"}</p>}
                    </label>
                  );
                  return (
                    <article id={`teaching-mobile-week-${week.anchor}`} className="mobile-edit-card teaching-week-mobile-card">
                      <div className="teaching-week-calendar" aria-label="학사일정 연동 비고">
                        <CalendarDays size={16} aria-hidden="true"/>
                        <div><strong>학사일정 연동</strong>
                          {week.calendarNotes.length ? <ul>{week.calendarNotes.map(note => <li key={note}>{note}</li>)}</ul> : <p>특이사항 없음</p>}
                        </div>
                      </div>
                      {renderMobileField("title")}
                      <div className="teaching-mobile-standard">
                        <span className="teaching-mobile-field-label">성취기준</span>
                      <StandardPicker
                        context={context}
                        value={unit?.standard_ids ?? []}
                        onChange={(standard_ids) =>
                          update(week, unit, { standard_ids })
                        }
                        subject={course.subject_name}
                        grade={course.grade}
                        label="성취기준 선택"
                        disabled={!editable}
                        showDescriptions
                      />

                      </div>
                      {(["content", "method", "assessment_method", "alignment"] as Field[]).map(renderMobileField)}
                      <Disclosure key={week.anchor} compact className="teaching-week-extra" label={
                        <span>평가계획 연계 및 비고{unit?.assessment_links?.length ? ` · 연계 ${unit.assessment_links.length}건` : ""}{unit?.note?.trim() ? " · 비고 있음" : ""}</span>
                      }>
                      <LessonLinks
                        unit={
                          unit ?? {
                            ...emptyUnit(),
                            id: week.anchor,
                            period: week.period,
                            start: week.start,
                            end: week.end,
                          }
                        }
                        choices={choices}
                        editable={editable}
                        onChange={(assessment_links) =>
                          update(week, unit, { assessment_links })
                        }
                        onOpen={onOpenAssessment}
                      />

                      {renderMobileField("note")}
                      </Disclosure>
                    </article>
                  );
                })()}
              </>
            )}
          </div>
          <p className={`teaching-grid-hint no-print ${wide ? "" : "desktop-only"}`}>표를 좌우로 움직여 전체 항목을 확인할 수 있습니다. 입력 내용에 맞춰 셀 높이가 늘어납니다.</p>
          <div
            className={`table-scroll teaching-grid-scroll ${wide ? "" : "desktop-only"}`}
            role="region" aria-label="교수학습계획 표 가로 스크롤" tabIndex={0}
          >
            <table
              className="teaching-grid teaching-week-grid"
              aria-label="주차별 교수학습계획"
            >
              <colgroup>{["month","week","date","title","standard","content","method","assessment","alignment","note"].map(name => <col key={name} className={`teaching-col-${name}`} />)}</colgroup>
              <thead>
                <tr>
                  {["월", "주", "일", "단원명", "성취기준"].map((label) => (
                    <th key={label} rowSpan={2}>
                      {label}
                    </th>
                  ))}
                  <th colSpan={4}>수업·평가 계획</th>
                  <th rowSpan={2}>비고</th>
                </tr>
                <tr>
                  {(
                    [
                      "content",
                      "method",
                      "assessment_method",
                      "alignment",
                    ] as const
                  ).map((field) => (
                    <th key={field}>{fields[field].label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ week, unit }, index) => (
                  <tr
                    key={week.anchor}
                    id={unit ? `lesson-${unit.id}` : undefined}
                    data-week-anchor={week.anchor}
                    tabIndex={-1}
                  >
                    <td>{week.month}</td>
                    <td>{week.week}</td>
                    <td>
                      <span className="teaching-week-date">{week.day.split("~").map((part,i,parts)=><span key={i}>{part}{i<parts.length-1?"~":""}</span>)}</span>
                    </td>
                    <td>{cell(week, unit, "title", index, 0)}</td>
                    <td>
                      <StandardPicker
                        context={context}
                        value={unit?.standard_ids ?? []}
                        onChange={(standard_ids) =>
                          update(week, unit, { standard_ids })
                        }
                        subject={course.subject_name}
                        grade={course.grade}
                        label={week.period + " 성취기준 선택"}
                        disabled={!editable}
                      />
                    </td>
                    <td>{cell(week, unit, "content", index, 1)}</td>
                    <td>{cell(week, unit, "method", index, 2)}</td>
                    <td>{cell(week, unit, "assessment_method", index, 3)}</td>
                    <td>
                      {cell(week, unit, "alignment", index, 4)}
                      <LessonLinks
                        unit={
                          unit ?? {
                            id: week.anchor,
                            period: week.period,
                            start: week.start,
                            end: week.end,
                            title: "",
                            content: "",
                            standard_ids: [],
                            lessons: null,
                            method: "",
                            alignment: "",
                            note: "",
                          }
                        }
                        choices={choices}
                        editable={editable}
                        onChange={(assessment_links) =>
                          update(week, unit, { assessment_links })
                        }
                        onOpen={onOpenAssessment}
                      />
                      {unit?.assessment_links?.map((link) => {
                        const item = choices.find(
                          (c) => c.item.id === link.assessment_id,
                        );
                        return (
                          item && (
                            <small
                              key={
                                link.assessment_id + link.phase + link.stage_id
                              }
                            >
                              ★수행평가 연계({item.item.name})
                            </small>
                          )
                        );
                      })}
                    </td>
                    <td>
                      {week.calendarNotes.length > 0 && (
                        <ul aria-label="학사일정 연동 비고">
                          {week.calendarNotes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      )}
                      {cell(week, unit, "note", index, 5)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {unattached.length > 0 && (
        <Disclosure
          className="teaching-unlinked"
          compact
          label={
            <>
              현재 수업 주차와 연결되지 않은 기존 계획 {unattached.length}건
            </>
          }
        >
          <p className="muted">방학·휴업일 또는 학사일정 변경으로 연결되지 않은 계획입니다. 기존 내용은 보존되며, 필요한 경우 날짜를 다시 지정해 주세요.</p>
          <LessonEditor
            {...props}
            legacyOnly
            units={unattached}
            onChange={(revised) => {
              const ids = new Set(unattached.map((unit) => unit.id));
              onChange([
                ...units.filter((unit) => !ids.has(unit.id)),
                ...revised,
              ]);
            }}
          />
        </Disclosure>
      )}
      {expanded && selected && (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) setExpanded(null);
          }}
          title={selected.week.period + " " + fields[expanded.field].label}
          wide
        >
          <textarea
            rows={14}
            aria-label={fields[expanded.field].label}
            className="teaching-expanded-cell"
            value={selected.unit?.[expanded.field] ?? ""}
            maxLength={fields[expanded.field].max}
            disabled={!editable}
            onChange={(event) =>
              update(
                selected.week,
                selected.unit,
                { [expanded.field]: event.target.value },
                expanded.field,
              )
            }
          />
          <Button
            onClick={() => {
              setExpanded(null);
              setGroup(null);
            }}
          >
            닫기
          </Button>
        </Modal>
      )}
    </section>
  );
}

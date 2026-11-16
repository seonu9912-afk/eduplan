"use client";
import { useState } from "react";
import { Modal } from "@/components/common";
import { academicDays, annualSchema, defaultAnnual } from "@/lib/academic";
import { draftTeachingWeeks } from "@/lib/teaching-authoring";
import { ArrowUp, ArrowDown, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emptyUnit, type TeachingUnit } from "@/lib/teaching";
import type { Context, Row } from "@/lib/models";
import { LessonLinks } from "./assessment-links";
import type { AssessmentChoice } from "@/lib/teaching-authoring";
import { StandardPicker } from "./standards-picker";
export function LessonEditor({
  context: c,
  course,
  units,
  choices,
  onOpenAssessment,
  onChange,
  editable,
  legacyOnly = false,
}: {
  context: Context;
  course: Row<"teaching_courses">;
  units: TeachingUnit[];
  choices: AssessmentChoice[];
  onOpenAssessment: (id: string, semester: number) => void;
  onChange: (units: TeachingUnit[]) => void;
  editable: boolean;
  legacyOnly?: boolean;
}) {
  const [draftOpen, setDraftOpen] = useState(false);
  const draft = draftOpen
    ? draftTeachingWeeks(
        academicDays(
          c.year!.year,
          c.annual
            ? annualSchema.parse(c.annual.document)
            : defaultAnnual(),
          c.semesters,
        ).filter((d) =>
          course.semester ? d.semester === course.semester : d.semester !== 0,
        ),
        units,
      )
    : [];
  const update = (id: string, next: Partial<TeachingUnit>) =>
    onChange(units.map((u) => (u.id === id ? { ...u, ...next } : u)));
  const move = (index: number, step: number) => {
    const next = [...units];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  };
  return (
    <section className="teaching-section">
      <div className="section-title">
        <div>
          <h2>교수학습계획</h2>
          <p>
            한 행에 한 주 또는 이어지는 수업을 작성하세요. 같은 단원과
            평가과제를 여러 수업에 연결할 수 있습니다.
          </p>
        </div>
        {editable && !legacyOnly && (
          <div className="teaching-actions">
            <Button variant="outline" onClick={() => setDraftOpen(true)}>
              학사일정으로 주차 초안
            </Button>
            <Button
              variant="outline"
              onClick={() => onChange([...units, emptyUnit()])}
            >
              <Plus /> 수업 추가
            </Button>
          </div>
        )}
      </div>
      <Modal
        open={draftOpen}
        onOpenChange={setDraftOpen}
        title="주차별 수업 초안"
        description="학교 수업일이 있는 주만 만듭니다. 기존 날짜와 겹치는 주는 건너뛰고, 내용과 실제 과목 차시는 직접 확인합니다."
      >
        <p>
          {draft.length}개 수업을 추가할 수 있습니다. 기존 내용은 유지됩니다.
        </p>
        <div className="week-draft-list">
          {draft.map((u) => (
            <p key={u.id}>
              {u.period} · {u.start}~{u.end}
              {u.note ? ` · ${u.note}` : ""}
            </p>
          ))}
        </div>
        <Button
          disabled={
            !editable || !draft.length || units.length + draft.length > 500
          }
          onClick={() => {
            onChange([...units, ...draft]);
            setDraftOpen(false);
          }}
        >
          주차 초안 추가
        </Button>
      </Modal>
      {!units.length ? (
        <div className="teaching-empty">
          <h3>첫 주 수업부터 시작하세요</h3>
          <p>
            단원과 성취기준을 연결하고 배당 차시를 입력하세요. 작성 중인 초안도
            저장할 수 있습니다.
          </p>
          {editable && (
            <Button onClick={() => onChange([emptyUnit()])}>
              첫 수업 추가
            </Button>
          )}
        </div>
      ) : (
        <div
          className="table-scroll teaching-grid-scroll"
          tabIndex={0}
          role="region"
          aria-label="교수학습계획 편집표"
        >
          <table className="teaching-grid">
            <thead>
              <tr>
                {[
                  "순서",
                  "시기 · 기간",
                  "단원·주제 · 학생 학습활동",
                  "성취기준",
                  "차시",
                  "수업 방법",
                  "평가 방법",
                  "수업·평가 연계",
                  "비고",
                  "행 편집",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {units.map((u, i) => (
                <tr key={u.id} id={`lesson-${u.id}`} tabIndex={-1}>
                  <th scope="row">
                    {i + 1}
                    <select
                      aria-label={`${i + 1}번 수업 구분`}
                      value={u.kind ?? "lesson"}
                      disabled={!editable}
                      onChange={(e) =>
                        update(u.id, {
                          kind: e.target.value as TeachingUnit["kind"],
                        })
                      }
                    >
                      <option value="lesson">교과 수업</option>
                      <option value="activity">학교 교육활동</option>
                      <option value="reflection">학기 성찰</option>
                    </select>
                  </th>
                  <td>
                    <div className="week-fields">
                      {(
                        [
                          ["month", "월"],
                          ["week", "주"],
                          ["day", "일"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            aria-label={`${i + 1}번 단원 ${label}`}
                            value={u[key] ?? ""}
                            maxLength={
                              key === "month" ? 20 : key === "week" ? 40 : 100
                            }
                            disabled={!editable}
                            onChange={(e) =>
                              update(u.id, { [key]: e.target.value })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <input
                      aria-label={`${i + 1}번 단원 시기`}
                      placeholder="예: 3월 1~2주"
                      value={u.period}
                      maxLength={100}
                      disabled={!editable}
                      onChange={(e) => update(u.id, { period: e.target.value })}
                    />
                    <input
                      aria-label={`${i + 1}번 단원 시작일`}
                      type="date"
                      value={u.start}
                      disabled={!editable}
                      onChange={(e) => update(u.id, { start: e.target.value })}
                    />
                    <input
                      aria-label={`${i + 1}번 단원 종료일`}
                      type="date"
                      value={u.end}
                      disabled={!editable}
                      onChange={(e) => update(u.id, { end: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${i + 1}번 단원명`}
                      placeholder="단원명"
                      value={u.title}
                      maxLength={200}
                      disabled={!editable}
                      onChange={(e) => update(u.id, { title: e.target.value })}
                    />
                    <textarea
                      aria-label={`${i + 1}번 교수학습 내용`}
                      placeholder="학생이 무엇을 하는지 작성하세요. 예: 인물의 선택을 비교하고 근거를 들어 토의하기"
                      value={u.content}
                      maxLength={5000}
                      rows={4}
                      disabled={!editable}
                      onChange={(e) =>
                        update(u.id, { content: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <StandardPicker
                      context={c}
                      value={u.standard_ids}
                      onChange={(standard_ids) =>
                        update(u.id, { standard_ids })
                      }
                      subject={course.subject_name}
                      grade={course.grade}
                      label={`${i + 1}번 단원 성취기준 선택`}
                      disabled={!editable}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${i + 1}번 배당 차시`}
                      type="number"
                      min={0}
                      max={10000}
                      step="0.5"
                      value={u.lessons ?? ""}
                      disabled={!editable}
                      onChange={(e) =>
                        update(u.id, {
                          lessons:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const next = document.querySelector<HTMLInputElement>(
                            `input[aria-label="${i + 2}번 배당 차시"]`,
                          );
                          next?.focus();
                        }
                      }}
                    />
                  </td>
                  {(
                    [
                      "method",
                      "assessment_method",
                      "alignment",
                      "note",
                    ] as const
                  ).map((key, k) => (
                    <td key={key}>
                      <textarea
                        aria-label={`${i + 1}번 ${["수업 방법", "평가 방법", "수업·평가 연계", "비고"][k]}`}
                        value={u[key] ?? ""}
                        maxLength={key === "method" ? 1000 : 2000}
                        placeholder={
                          key === "alignment"
                            ? "어떤 수행을 관찰하고 어떤 피드백을 줄까요?"
                            : key === "assessment_method"
                              ? "관찰·형성·자기평가 등 학습 확인 방법"
                              : ""
                        }
                        rows={5}
                        disabled={!editable}
                        onChange={(e) =>
                          update(u.id, { [key]: e.target.value })
                        }
                      />
                      {key === "alignment" && (
                        <LessonLinks
                          unit={u}
                          choices={choices}
                          editable={editable}
                          onChange={(assessment_links) =>
                            update(u.id, { assessment_links })
                          }
                          onOpen={onOpenAssessment}
                        />
                      )}
                    </td>
                  ))}
                  <td>
                    <div className="row-tools">
                      <button
                        aria-label={`${i + 1}번 단원 위로`}
                        disabled={!editable || i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp />
                      </button>
                      <button
                        aria-label={`${i + 1}번 단원 아래로`}
                        disabled={!editable || i === units.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown />
                      </button>
                      <button
                        aria-label={`${i + 1}번 단원 복제`}
                        disabled={!editable || legacyOnly}
                        onClick={() => {
                          const next = [...units];
                          next.splice(i + 1, 0, {
                            ...structuredClone(u),
                            id: crypto.randomUUID(),
                          });
                          onChange(next);
                        }}
                      >
                        <Copy />
                      </button>
                      <button
                        aria-label={`${i + 1}번 단원 삭제`}
                        disabled={!editable}
                        onClick={() => {
                          if (
                            window.confirm(
                              "이 수업을 삭제할까요? 연결된 평가과제와 채점 내용은 유지됩니다.",
                            )
                          )
                            onChange(units.filter((v) => v.id !== u.id));
                        }}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={4}>계획 차시 합계</th>
                <td>{units.reduce((s, u) => s + (u.lessons ?? 0), 0)}</td>
                <td colSpan={5}>공통 계획은 연결한 모든 학급에 적용됩니다.</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

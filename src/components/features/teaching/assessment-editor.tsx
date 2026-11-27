"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { AssessmentDesign } from "./assessment-design";
import { AssessmentSchedule } from "./assessment-links";
import {
  copyAssessment,
  changeAssessmentStandards,
} from "@/lib/teaching-authoring";
import type { TeachingUnit } from "@/lib/teaching";
import { Button } from "@/components/ui/button";
import { Plus, Copy, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import {
  emptyAssessment,
  type TeachingDocument,
  type AssessmentItem,
} from "@/lib/teaching";
import type { Context, Row } from "@/lib/models";
import { StandardPicker } from "./standards-picker";
import { RubricEditor } from "./rubric-editor";
import { EvaluationFields, AssessmentDetailFields } from "./report-fields";
type Evaluation = TeachingDocument["evaluations"][number];
export function AssessmentEditor({
  context: c,
  course,
  value,
  units,
  onChangeUnits,
  onOpenLesson,
  onChange,
  editable,
}: {
  context: Context;
  course: Row<"teaching_courses">;
  value: Evaluation;
  units: TeachingUnit[];
  onChangeUnits: (units: TeachingUnit[]) => void;
  onOpenLesson: (id: string) => void;
  onChange: (v: Evaluation) => void;
  editable: boolean;
}) {
  const weighted = value.mode === "weighted",
    sum = value.items.reduce((n, a) => n + (a.ratio ?? 0), 0);
  const update = (id: string, next: Partial<AssessmentItem>) =>
    onChange({
      ...value,
      items: value.items.map((a) => (a.id === id ? { ...a, ...next } : a)),
    });
  const move = (i: number, d: number) => {
    const items = [...value.items];
    [items[i], items[i + d]] = [items[i + d], items[i]];
    onChange({ ...value, items });
  };
  return (
    <section className="teaching-section">
      <div className="section-title">
        <div>
          <h2>{value.semester}학기 평가계획</h2>
          <p>
            정기시험·수행평가 혼합, 수행평가 100%, 서술형 평가를 지원합니다.
          </p>
        </div>
        {editable && (
          <Button
            variant="outline"
            onClick={() =>
              onChange({ ...value, items: [...value.items, emptyAssessment()] })
            }
          >
            <Plus /> 평가 항목 추가
          </Button>
        )}
      </div>
      <div className="assessment-mode">
        <label>
          평가 운영 방식
          <select
            aria-label="평가 운영 방식"
            value={value.mode}
            disabled={!editable}
            onChange={(e) =>
              onChange({ ...value, mode: e.target.value as Evaluation["mode"] })
            }
          >
            <option value="weighted">반영비율 사용</option>
            <option value="descriptive">비율 없는 평가 (자유학기 등)</option>
          </select>
        </label>
        <div
          className={`ratio-summary ${weighted && Math.abs(sum - 100) > 0.001 ? "needs-review" : ""}`}
          role="status"
        >
          {weighted
            ? `반영비율 합계 ${Number(sum.toFixed(4))}% / 100%`
            : "점수·비율 합계 검토 제외"}
          <small>
            {weighted
              ? "합계가 맞지 않아도 초안 저장은 가능합니다."
              : "평가 내용과 성취 수준 중심으로 작성합니다. 이전 점수 입력은 보존됩니다."}
          </small>
        </div>
      </div>
      {value.items.length > 0 && <div className="assessment-index no-print"><strong>평가 항목 바로가기</strong><div>{value.items.map((item,index)=><button type="button" key={item.id} onClick={()=>{const target=document.getElementById(`assessment-${item.id}`);target?.scrollIntoView({block:"start"});target?.focus({preventScroll:true});}}><span>{index+1}. {item.name || "새 평가 항목"}</span><small>{weighted && item.ratio !== null ? `${item.ratio}%` : item.type}</small></button>)}</div></div>}
      <EvaluationFields
        value={value.detail}
        onChange={(detail) => onChange({ ...value, detail })}
        editable={editable}
        weighted={weighted}
      />
      {!value.items.length && (
        <div className="teaching-empty">
          <h3>평가를 수업과 연결하세요</h3>
          <p>평가 항목마다 관련 성취기준과 평가 요소를 작성합니다.</p>
          {editable && (
            <Button
              onClick={() => onChange({ ...value, items: [emptyAssessment()] })}
            >
              첫 평가 추가
            </Button>
          )}
        </div>
      )}
      {value.items.map((a, i) => (
        <article
          className="assessment-card"
          key={a.id}
          id={`assessment-${a.id}`}
          tabIndex={-1}
        >
          <div className="assessment-card-heading">
            <div className="assessment-title-block"><h3>
              {i + 1}. {a.name || "새 평가 항목"}
            </h3><p>{[a.type,a.period,weighted && a.ratio !== null ? `${a.ratio}% 반영` : ""].filter(Boolean).join(" · ")}</p></div>
            <div className="row-tools">
              <button
                aria-label={`${i + 1}번 평가 위로`}
                disabled={!editable || i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp />
              </button>
              <button
                aria-label={`${i + 1}번 평가 아래로`}
                disabled={!editable || i === value.items.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown />
              </button>
              <button
                aria-label={`${i + 1}번 평가 복제`}
                disabled={!editable}
                onClick={() => {
                  const copy = copyAssessment(a);
                  const items = [...value.items];
                  items.splice(i + 1, 0, copy);
                  onChange({ ...value, items });
                }}
              >
                <Copy />
              </button>
              <button
                aria-label={`${i + 1}번 평가 삭제`}
                disabled={!editable}
                onClick={() => {
                  if (
                    window.confirm(
                      "이 평가과제와 채점기준을 삭제할까요? 수업 내용은 유지되고 이 과제의 연결만 해제됩니다.",
                    )
                  )
                    onChange({
                      ...value,
                      items: value.items.filter((v) => v.id !== a.id),
                    });
                }}
              >
                <Trash2 />
              </button>
            </div>
          </div>
          <div className="assessment-fields">
            <label>
              평가 유형
              <select
                aria-label={`${i + 1}번 평가 유형`}
                value={a.type}
                disabled={!editable}
                onChange={(e) =>
                  update(a.id, {
                    type: e.target.value as AssessmentItem["type"],
                  })
                }
              >
                {["정기시험", "수행평가", "기타"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              평가영역·평가명
              <input
                aria-label={`${i + 1}번 평가명`}
                value={a.name}
                maxLength={200}
                disabled={!editable}
                onChange={(e) => update(a.id, { name: e.target.value })}
              />
            </label>
            <label>
              평가 시기
              <input
                aria-label={`${i + 1}번 평가 시기`}
                placeholder="예: 5월 2주"
                value={a.period}
                maxLength={100}
                disabled={!editable}
                onChange={(e) => update(a.id, { period: e.target.value })}
              />
            </label>
            <label>
              시작일
              <input
                aria-label={`${i + 1}번 평가 시작일`}
                type="date"
                value={a.start}
                disabled={!editable}
                onChange={(e) => update(a.id, { start: e.target.value })}
              />
            </label>
            <label>
              종료일
              <input
                aria-label={`${i + 1}번 평가 종료일`}
                type="date"
                value={a.end}
                disabled={!editable}
                onChange={(e) => update(a.id, { end: e.target.value })}
              />
            </label>
            <label>
              횟수
              <input
                aria-label={`${i + 1}번 평가 횟수`}
                type="number"
                min={1}
                max={100}
                value={a.count ?? ""}
                disabled={!editable}
                onChange={(e) =>
                  update(a.id, {
                    count:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            {weighted && (
              <>
                <label>
                  반영비율 (%)
                  <input
                    aria-label={`${i + 1}번 반영비율`}
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={a.ratio ?? ""}
                    disabled={!editable}
                    onChange={(e) =>
                      update(a.id, {
                        ratio:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  영역 배점
                  <input
                    aria-label={`${i + 1}번 영역 배점`}
                    type="number"
                    min={0}
                    max={10000}
                    step="0.1"
                    value={a.points ?? ""}
                    disabled={!editable}
                    onChange={(e) =>
                      update(a.id, {
                        points:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </>
            )}
            <label className="assessment-wide">
              평가 요소
              <textarea
                aria-label={`${i + 1}번 평가 요소`}
                value={a.element}
                maxLength={3000}
                rows={3}
                disabled={!editable}
                onChange={(e) => update(a.id, { element: e.target.value })}
              />
            </label>
            <label className="assessment-wide">
              평가 방법
              <textarea
                aria-label={`${i + 1}번 평가 방법`}
                value={a.method}
                maxLength={2000}
                rows={3}
                disabled={!editable}
                onChange={(e) => update(a.id, { method: e.target.value })}
              />
            </label>
            <div className="assessment-wide">
              <span className="field-label">관련 성취기준</span>
              <StandardPicker
                context={c}
                value={a.standard_ids}
                onChange={(standard_ids) =>
                  update(a.id, changeAssessmentStandards(a, standard_ids))
                }
                subject={course.subject_name}
                grade={course.grade}
                label={`${i + 1}번 평가 성취기준 선택`}
                disabled={!editable}
              />
            </div>
            <label className="assessment-wide">
              성적처리·평가 유의사항
              <textarea
                aria-label={`${i + 1}번 평가 유의사항`}
                value={a.notes}
                maxLength={3000}
                rows={3}
                disabled={!editable}
                onChange={(e) => update(a.id, { notes: e.target.value })}
              />
            </label>
          </div>
          <AssessmentDesign
            item={a}
            name={`${i + 1}번 평가`}
            editable={editable}
            onChange={(next) => update(a.id, next)}
          />
          <AssessmentSchedule
            item={a}
            units={units}
            editable={editable}
            onChange={onChangeUnits}
            onOpen={onOpenLesson}
          />
          <AssessmentDetailFields
            item={a}
            standards={c.teaching!.standards.filter((s) =>
              a.standard_ids.includes(s.id),
            )}
            name={`${i + 1}번 평가`}
            onChange={(detail) => update(a.id, { detail })}
            editable={editable}
            weighted={weighted}
          />
          <Disclosure
            className="rubric-details"
            open={a.type === "수행평가" ? true : undefined}
            compact
            label={
              <>
                채점기준 · 평가 요소 {a.rubric.length}개
              </>
            }
          >
            <RubricEditor
              name={`${i + 1}번 평가`}
              value={a.rubric}
              stages={a.stages ?? []}
              standards={c.teaching!.standards.filter((s) =>
                a.standard_ids.includes(s.id),
              )}
              weighted={weighted}
              editable={editable}
              onChange={(rubric) => update(a.id, { rubric })}
            />
          </Disclosure>
        </article>
      ))}
      <label className="assessment-notes">
        평가계획 공통 유의사항
        <textarea
          aria-label="평가계획 공통 유의사항"
          value={value.notes}
          maxLength={5000}
          rows={4}
          disabled={!editable}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </label>
    </section>
  );
}

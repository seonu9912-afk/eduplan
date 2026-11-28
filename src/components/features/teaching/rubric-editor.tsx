"use client";
import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emptyRubric, type RubricElement } from "@/lib/teaching";
export function RubricEditor({
  value,
  stages,
  standards,
  onChange,
  weighted,
  editable,
  name,
  expectedPoints,
}: {
  value: RubricElement[];
  stages: { id: string; title: string }[];
  standards: {
    id: string;
    code: string;
    content: string;
    curriculum_version: string;
  }[];
  onChange: (v: RubricElement[]) => void;
  weighted: boolean;
  editable: boolean;
  name: string;
  expectedPoints?: number | null;
}) {
  const [openId, setOpenId] = useState<string | null>(value[0]?.id ?? null);
  const total = value.reduce((s, r) => s + (r.points ?? 0), 0);
  const update = (id: string, next: Partial<RubricElement>) =>
    onChange(value.map((r) => (r.id === id ? { ...r, ...next } : r)));
  return (
    <div className="rubric-editor">
      <div className="section-title">
        <div>
          <h3>평가 요소별 채점기준</h3>
          <p>
            {weighted
              ? `요소 배점 합계 ${Number(total.toFixed(4))}점${expectedPoints != null ? ` / ${expectedPoints}점` : ""}`
              : "점수 없이 수준별 판단 기준을 작성합니다."}
          </p>
          {weighted && expectedPoints != null && <small className="rubric-sum-status" data-valid={Math.abs(total-expectedPoints)<0.001}>{Math.abs(total-expectedPoints)<0.001 ? "배점 일치" : "배점 확인 필요"}</small>}
        </div>
        {editable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { const item = emptyRubric(); onChange([...value, item]); setOpenId(item.id); }}
          >
            <Plus /> 평가 요소 추가
          </Button>
        )}
      </div>
      {value
        .map((r, i) => ({ r, i }))
        .sort(
          (a, b) =>
            (stages.findIndex((s) => s.id === a.r.stage_id) + 1 ||
              stages.length + 1) -
            (stages.findIndex((s) => s.id === b.r.stage_id) + 1 ||
              stages.length + 1),
        )
        .map(({ r, i }) => (
          <section className="rubric-element" key={r.id}>
            <button type="button" className="rubric-element-toggle" aria-expanded={openId === r.id} onClick={() => setOpenId(openId === r.id ? null : r.id)}><span>{i+1}. {r.element || "새 평가 요소"}<small>평정수준 {r.levels.length}개</small></span>{weighted && <b>{r.points ?? "—"}점</b>}<ChevronDown size={16}/></button>
            <div className="rubric-element-body" hidden={openId !== r.id}>
            <label>
              과제 진행 단계
              <select
                aria-label={`${name} ${i + 1}번 요소 진행 단계`}
                disabled={!editable}
                value={r.stage_id ?? ""}
                onChange={(e) =>
                  update(r.id, { stage_id: e.target.value || null })
                }
              >
                <option value="">단계 미지정</option>
                {stages.map((s, n) => (
                  <option key={s.id} value={s.id}>
                    {n + 1}. {s.title || "단계명 미입력"}
                  </option>
                ))}
              </select>
            </label>
            <div className="rubric-element-heading">
              <label>
                평가 요소명
                <input
                  aria-label={`${name} ${i + 1}번 평가 요소명`}
                  value={r.element}
                  disabled={!editable}
                  maxLength={200}
                  onChange={(e) => update(r.id, { element: e.target.value })}
                />
              </label>
              {weighted && (
                <label>
                  요소 배점
                  <input
                    aria-label={`${name} ${i + 1}번 요소 배점`}
                    type="number"
                    min={0}
                    max={10000}
                    step="0.1"
                    value={r.points ?? ""}
                    disabled={!editable}
                    onChange={(e) =>
                      update(r.id, {
                        points:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              )}
              {editable && (
                <button
                  type="button"
                  aria-label={`${name} ${i + 1}번 평가 요소 삭제`}
                  onClick={() => {
                    if (
                      window.confirm(
                        "평가 요소와 평정수준별 판단 기준을 삭제할까요?",
                      )
                    )
                      onChange(value.filter((x) => x.id !== r.id));
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <fieldset className="criterion-standards" disabled={!editable}>
              <legend>이 요소로 확인할 성취기준</legend>
              {standards.length ? (
                standards.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={r.standard_ids?.includes(s.id) ?? false}
                      aria-label={`${name} ${i + 1}번 요소 ${s.code}`}
                      onChange={(e) =>
                        update(r.id, {
                          standard_ids: e.target.checked
                            ? [...(r.standard_ids ?? []), s.id]
                            : r.standard_ids?.filter((id) => id !== s.id),
                        })
                      }
                    />
                    <span>
                      <b>{s.code}</b> ({s.curriculum_version}) {s.content}
                    </span>
                  </label>
                ))
              ) : (
                <p className="muted">평가과제에 성취기준을 먼저 연결하세요.</p>
              )}
            </fieldset>
            <label>
              확인할 증거
              <textarea
                aria-label={`${name} ${i + 1}번 요소 확인할 증거`}
                disabled={!editable}
                rows={2}
                maxLength={3000}
                value={r.evidence ?? ""}
                placeholder="어떤 기록·발표·결과물에서 이 요소를 확인하나요?"
                onChange={(e) => update(r.id, { evidence: e.target.value })}
              />
            </label>
            <div className="table-scroll">
              <table className="rubric-table" aria-label="평정수준별 판단 기준">
                <thead>
                  <tr>
                    <th>평정수준</th>
                    <th>
                      {weighted ? "점수별 판단 기준" : "수준별 판단 기준"}
                    </th>
                    {weighted && <th>점수</th>}
                    <th>편집</th>
                  </tr>
                </thead>
                <tbody>
                  {r.levels.map((l, j) => (
                    <tr key={l.id}>
                      <td data-label="평정수준">
                        <input
                          aria-label={`${name} 요소${i + 1} 단계${j + 1} 수준`}
                          value={l.label}
                          disabled={!editable}
                          maxLength={100}
                          onChange={(e) =>
                            update(r.id, {
                              levels: r.levels.map((x) =>
                                x.id === l.id
                                  ? { ...x, label: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </td>
                      <td data-label="판단 기준">
                        <textarea
                          aria-label={`${name} 요소${i + 1} 단계${j + 1} 기준`}
                          value={l.description}
                          disabled={!editable}
                          maxLength={3000}
                          placeholder="근거·정확성·구체성 등 수준을 구분하는 수행을 적어 주세요."
                          rows={2}
                          onChange={(e) =>
                            update(r.id, {
                              levels: r.levels.map((x) =>
                                x.id === l.id
                                  ? { ...x, description: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </td>
                      {weighted && (
                        <td data-label="점수">
                          <input
                            aria-label={`${name} 요소${i + 1} 단계${j + 1} 점수`}
                            type="number"
                            min={0}
                            max={10000}
                            step="0.1"
                            value={l.points ?? ""}
                            disabled={!editable}
                            onChange={(e) =>
                              update(r.id, {
                                levels: r.levels.map((x) =>
                                  x.id === l.id
                                    ? {
                                        ...x,
                                        points:
                                          e.target.value === ""
                                            ? null
                                            : Number(e.target.value),
                                      }
                                    : x,
                                ),
                              })
                            }
                          />
                        </td>
                      )}
                      <td data-label="편집">
                        {editable && (
                          <button
                            type="button"
                            aria-label={`${name} 요소${i + 1} 단계${j + 1} 삭제`}
                            onClick={() =>
                              update(r.id, {
                                levels: r.levels.filter((x) => x.id !== l.id),
                              })
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editable && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  update(r.id, {
                    levels: [
                      ...r.levels,
                      {
                        id: crypto.randomUUID(),
                        label: "",
                        description: "",
                        points: null,
                      },
                    ],
                  })
                }
              >
                + 평정수준 추가
              </Button>
            )}
            <label>
              요소 비고
              <textarea
                aria-label={`${name} ${i + 1}번 요소 비고`}
                value={r.note}
                disabled={!editable}
                maxLength={1000}
                rows={2}
                onChange={(e) => update(r.id, { note: e.target.value })}
              />
            </label>
            </div>
          </section>
        ))}
      {!value.length && (
        <p className="muted">
          평가 요소를 추가한 뒤 필요한 만큼 수준과 평가기준을 작성하세요.
        </p>
      )}
    </div>
  );
}

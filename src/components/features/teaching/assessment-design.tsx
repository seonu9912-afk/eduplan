"use client";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AssessmentItem } from "@/lib/teaching";
export function AssessmentDesign({
  item,
  name,
  editable,
  onChange,
}: {
  item: AssessmentItem;
  name: string;
  editable: boolean;
  onChange: (next: Partial<AssessmentItem>) => void;
}) {
  const stages = item.stages ?? [];
  const move = (i: number, d: number) => {
    const next = [...stages];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange({ stages: next });
  };
  return (
    <div className="assessment-design">
      <h4>학생의 수행과 확인할 증거</h4>
      <p className="muted">
        성취기준을 바탕으로 학생이 할 일, 살펴볼 결과물·활동 기록을
        구체화하세요.
      </p>
      <div className="report-field-grid">
        <label>
          학생이 수행할 과제
          <textarea
            aria-label={`${name} 학생 수행 과제`}
            rows={3}
            maxLength={5000}
            value={item.task ?? ""}
            disabled={!editable}
            placeholder="예: 책 속 갈등을 분석하고 근거를 들어 자신의 해결 방안을 발표한다."
            onChange={(e) => onChange({ task: e.target.value })}
          />
        </label>
        <label>
          확인할 결과물·활동 기록
          <textarea
            aria-label={`${name} 확인할 증거`}
            rows={3}
            maxLength={3000}
            value={item.evidence ?? ""}
            disabled={!editable}
            placeholder="예: 독서 기록장, 토의 중 근거 제시, 최종 발표와 수정 기록"
            onChange={(e) => onChange({ evidence: e.target.value })}
          />
        </label>
      </div>
      <h4>과제 진행 단계</h4>
      <p className="muted">
        책 읽기 → 활동지 → 프로젝트처럼 실제 진행 순서입니다. 한 단계에 여러
        채점 요소를 둘 수 있습니다.
      </p>
      {stages.map((s, i) => (
        <div className="stage-row" key={s.id}>
          <label>
            {i + 1}. 단계명
            <input
              aria-label={`${name} 진행 단계 ${i + 1} 이름`}
              value={s.title}
              maxLength={200}
              disabled={!editable}
              onChange={(e) =>
                onChange({
                  stages: stages.map((v) =>
                    v.id === s.id ? { ...v, title: e.target.value } : v,
                  ),
                })
              }
            />
          </label>
          <label>
            진행할 활동
            <textarea
              aria-label={`${name} 진행 단계 ${i + 1} 활동`}
              rows={2}
              maxLength={3000}
              value={s.description}
              disabled={!editable}
              onChange={(e) =>
                onChange({
                  stages: stages.map((v) =>
                    v.id === s.id ? { ...v, description: e.target.value } : v,
                  ),
                })
              }
            />
          </label>
          <span>
            채점 요소 {item.rubric.filter((r) => r.stage_id === s.id).length}개
          </span>
          <div className="row-tools">
            <button
              disabled={!editable || i === 0}
              aria-label={`${name} 진행 단계 ${i + 1} 위로`}
              onClick={() => move(i, -1)}
            >
              <ArrowUp />
            </button>
            <button
              disabled={!editable || i === stages.length - 1}
              aria-label={`${name} 진행 단계 ${i + 1} 아래로`}
              onClick={() => move(i, 1)}
            >
              <ArrowDown />
            </button>
            <button
              disabled={!editable}
              aria-label={`${name} 진행 단계 ${i + 1} 삭제`}
              onClick={() => {
                if (
                  window.confirm(
                    "진행 단계 연결을 해제할까요? 수업과 채점 요소의 내용은 유지됩니다.",
                  )
                )
                  onChange({
                    stages: stages.filter((v) => v.id !== s.id),
                    rubric: item.rubric.map((r) =>
                      r.stage_id === s.id ? { ...r, stage_id: null } : r,
                    ),
                  });
              }}
            >
              삭제
            </button>
          </div>
        </div>
      ))}
      {editable && (
        <Button
          variant="outline"
          size="sm"
          disabled={stages.length >= 50}
          onClick={() =>
            onChange({
              stages: [
                ...stages,
                { id: crypto.randomUUID(), title: "", description: "" },
              ],
            })
          }
        >
          진행 단계 추가
        </Button>
      )}
    </div>
  );
}

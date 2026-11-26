"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { Button } from "@/components/ui/button";
import {
  emptyEvaluationDetail,
  type EvaluationDetail,
} from "@/lib/teaching-format";
import { minimumRubricPoints } from "@/lib/teaching-report";
import type { AssessmentItem } from "@/lib/teaching";

type NarrativeRow = {
  label: string;
  description: string;
  standard_id?: string | null;
};
export function NarrativeRows({
  name,
  value,
  onChange,
  editable,
  label = "수준",
  description = "내용",
  standards,
}: {
  name: string;
  value: NarrativeRow[];
  onChange: (v: NarrativeRow[]) => void;
  editable: boolean;
  label?: string;
  description?: string;
  standards?: {
    id: string;
    code: string;
    content: string;
    curriculum_version: string;
  }[];
}) {
  return (
    <div className="report-rows">
      <h4>{name}</h4>
      {value.map((row, i) => (
        <div className="report-row" key={i}>
          {standards && (
            <label>
              성취기준
              <select
                aria-label={`${name} ${i + 1} 연결 기준`}
                disabled={!editable}
                value={row.standard_id ?? ""}
                onChange={(e) =>
                  onChange(
                    value.map((r, n) =>
                      n === i
                        ? { ...r, standard_id: e.target.value || null }
                        : r,
                    ),
                  )
                }
              >
                <option value="">기준 연결 필요</option>
                {standards.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} ({s.curriculum_version}) {s.content}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {label}
            <input
              aria-label={`${name} ${i + 1} ${label}`}
              value={row.label}
              maxLength={160}
              disabled={!editable}
              onChange={(e) =>
                onChange(
                  value.map((r, n) =>
                    n === i ? { ...r, label: e.target.value } : r,
                  ),
                )
              }
            />
          </label>
          <label>
            {description}
            <textarea
              aria-label={`${name} ${i + 1} ${description}`}
              rows={3}
              maxLength={10000}
              value={row.description}
              disabled={!editable}
              onChange={(e) =>
                onChange(
                  value.map((r, n) =>
                    n === i ? { ...r, description: e.target.value } : r,
                  ),
                )
              }
            />
          </label>
          {editable && (
            <Button
              variant="ghost"
              aria-label={`${name} ${i + 1} 삭제`}
              onClick={() => onChange(value.filter((_, n) => n !== i))}
            >
              삭제
            </Button>
          )}
        </div>
      ))}
      {editable && (
        <Button
          variant="outline"
          size="sm"
          disabled={value.length >= 30}
          onClick={() => onChange([...value, { label: "", description: "" }])}
        >
          {name} 추가
        </Button>
      )}
    </div>
  );
}
export function EvaluationFields({
  value,
  onChange,
  editable,
  weighted,
}: {
  value?: EvaluationDetail;
  onChange: (v: EvaluationDetail) => void;
  editable: boolean;
  weighted: boolean;
}) {
  const d = value ?? emptyEvaluationDetail();
  const labels = {
    purpose: "평가의 목적",
    direction: "평가의 기본 방향",
    policy: "평가 방침 및 유의사항",
    absence_policy: "미응시자·학적변동자 처리",
  } as const;
  return (
    <Disclosure className="report-fields" compact label="평가 운영 기준 · 학교 제출 항목">
      <p className="muted">
        학교의 평가 규정에 맞게 작성하세요. 성취도 구간과 성취수준은 행을 추가해
        구성합니다.
      </p>
      <div className="report-field-grid">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
          <label key={key}>
            {labels[key]}
            <textarea
              aria-label={labels[key]}
              rows={5}
              maxLength={15000}
              disabled={!editable}
              value={d[key]}
              onChange={(e) => onChange({ ...d, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {weighted && (
        <NarrativeRows
          name="기준 성취율"
          label="성취도"
          description="성취율 범위"
          value={d.score_bands}
          editable={editable}
          onChange={(score_bands) => onChange({ ...d, score_bands })}
        />
      )}
      <NarrativeRows
        name="학기 단위 성취수준"
        value={d.semester_levels}
        editable={editable}
        onChange={(semester_levels) => onChange({ ...d, semester_levels })}
      />
      <NarrativeRows
        name="학교 추가 항목"
        label="제목"
        value={d.additional}
        editable={editable}
        onChange={(additional) => onChange({ ...d, additional })}
      />
    </Disclosure>
  );
}
export function AssessmentDetailFields({
  item,
  standards,
  onChange,
  editable,
  name,
  weighted,
}: {
  item: AssessmentItem;
  standards: {
    id: string;
    code: string;
    content: string;
    curriculum_version: string;
  }[];
  onChange: (v: NonNullable<AssessmentItem["detail"]>) => void;
  editable: boolean;
  name: string;
  weighted: boolean;
}) {
  const d = item.detail ?? {
    lessons: null,
    unit_content: "",
    methods: "",
    competencies: "",
    standard_levels: [],
  };
  return (
    <Disclosure className="report-fields" compact label="세부 운영 · 평가 유형·역량·성취수준">
      <div className="report-field-grid">
        <label>
          평가 차시
          <input
            aria-label={`${name} 평가 차시`}
            type="number"
            min={0}
            max={10000}
            step={0.5}
            value={d.lessons ?? ""}
            disabled={!editable}
            onChange={(e) =>
              onChange({
                ...d,
                lessons: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
        {(
          [
            ["unit_content", "평가 단원·내용"],
            ["methods", "평가 유형 상세"],
            ["competencies", "교과 역량"],
          ] as const
        ).map(([key, title]) => (
          <label key={key}>
            {title}
            <textarea
              aria-label={`${name} ${title}`}
              rows={3}
              value={d[key]}
              maxLength={key === "unit_content" ? 3000 : 2000}
              disabled={!editable}
              placeholder={
                key === "methods"
                  ? "예: 토론·토의, 관찰평가, 자기평가"
                  : key === "competencies"
                    ? "예: 비판적 사고, 의사소통·협업"
                    : ""
              }
              onChange={(e) => onChange({ ...d, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <NarrativeRows
        name={`${name} 성취기준별 성취수준`}
        label="수준 (기존 코드 표기 유지 가능)"
        standards={standards}
        value={d.standard_levels}
        editable={editable}
        onChange={(standard_levels) => onChange({ ...d, standard_levels })}
      />
      <p className="muted">
        성취기준별 수준은 해당 기준의 수행 정도입니다. 학기 단위 성취수준과 개별
        과제의 채점 점수는 각각 따로 작성합니다.
      </p>
      {weighted && (
        <p>
          평가과제별 평가요소 최하점 합계:{" "}
          <strong>
            {minimumRubricPoints(item) === null
              ? "모든 평정수준 점수 입력 후 계산"
              : `${minimumRubricPoints(item)}점`}
          </strong>
        </p>
      )}
    </Disclosure>
  );
}

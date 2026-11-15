"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/common";
import {
  learningPhases,
  linkedLessons,
  type AssessmentChoice,
} from "@/lib/teaching-authoring";
import type { AssessmentItem, TeachingUnit } from "@/lib/teaching";
type Link = NonNullable<TeachingUnit["assessment_links"]>[number];
export function LessonLinks({
  unit,
  choices,
  editable,
  onChange,
  onOpen,
}: {
  unit: TeachingUnit;
  choices: AssessmentChoice[];
  editable: boolean;
  onChange: (links: Link[]) => void;
  onOpen: (id: string, semester: number) => void;
}) {
  const [open, setOpen] = useState(false),
    links = unit.assessment_links ?? [];
  const [message, setMessage] = useState("");
  return (
    <div className="lesson-assessment-links">
      {links.map((l, i) => {
        const a = choices.find((c) => c.item.id === l.assessment_id);
        return (
          <button
            className="connection-chip"
            key={i}
            onClick={() => a && onOpen(a.item.id, a.semester)}
          >
            {l.phase} · {a?.item.name || "평가명 확인"}
            {l.stage_id
              ? ` / ${a?.item.stages?.find((s) => s.id === l.stage_id)?.title || "단계 확인"}`
              : ""}
          </button>
        );
      })}
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {links.length ? "연결 편집" : "평가과제 연결"}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="수업과 평가과제 연결"
        description={`${unit.period || unit.day || "기간 미입력"} · ${unit.title || "단원명 미입력"}`}
        wide
      >
        <p>
          한 수업을 여러 과제에 연결할 수 있습니다. 준비·실시·피드백과 해당 진행
          단계를 선택하세요.
        </p>
        {links.map((l, i) => {
          const a = choices.find((c) => c.item.id === l.assessment_id)?.item;
          const update = (next: Partial<Link>) => {
            const result = links.map((v, n) =>
              n === i ? { ...v, ...next } : v,
            );
            if (
              new Set(
                result.map(
                  (v) => `${v.assessment_id}:${v.phase}:${v.stage_id ?? ""}`,
                ),
              ).size !== result.length
            ) {
              setMessage("같은 역할과 진행 단계로 이미 연결되어 있습니다.");
              return;
            }
            setMessage("");
            onChange(result);
          };
          return (
            <div className="connection-form" key={i}>
              <label>
                평가과제
                <select
                  aria-label={`${i + 1}번 연결 평가과제`}
                  value={l.assessment_id}
                  disabled={!editable}
                  onChange={(e) =>
                    update({ assessment_id: e.target.value, stage_id: null })
                  }
                >
                  {choices.map((c) => (
                    <option key={c.item.id} value={c.item.id}>
                      {c.semester}학기 · {c.item.name || "이름 없는 평가"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                수업 역할
                <select
                  aria-label={`${i + 1}번 연결 역할`}
                  value={l.phase}
                  disabled={!editable}
                  onChange={(e) =>
                    update({ phase: e.target.value as Link["phase"] })
                  }
                >
                  {learningPhases.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                과제 진행 단계
                <select
                  aria-label={`${i + 1}번 연결 진행 단계`}
                  value={l.stage_id ?? ""}
                  disabled={!editable}
                  onChange={(e) => update({ stage_id: e.target.value || null })}
                >
                  <option value="">과제 전체</option>
                  {a?.stages?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title || "단계명 미입력"}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="ghost"
                disabled={!editable}
                onClick={() => onChange(links.filter((_, n) => n !== i))}
              >
                연결 해제
              </Button>
            </div>
          );
        })}
        {editable && (
          <Button
            variant="outline"
            disabled={!choices.length || links.length >= 100}
            onClick={() => {
              const candidate = choices
                .flatMap((a) =>
                  learningPhases.map((phase) => ({
                    assessment_id: a.item.id,
                    phase,
                    stage_id: null,
                  })),
                )
                .find(
                  (l) =>
                    !links.some(
                      (v) =>
                        v.assessment_id === l.assessment_id &&
                        v.phase === l.phase &&
                        !v.stage_id,
                    ),
                );
              if (candidate) {
                setMessage("");
                onChange([...links, candidate]);
              } else
                setMessage(
                  "과제 전체 연결이 모두 추가되었습니다. 기존 연결의 진행 단계를 선택하면 단계별 연결을 추가할 수 있습니다.",
                );
            }}
          >
            연결 추가
          </Button>
        )}
        {!choices.length && (
          <p className="muted">
            평가계획에서 평가과제를 먼저 등록하세요. 수업 내용은 그대로
            유지됩니다.
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <Button onClick={() => setOpen(false)}>연결 확인</Button>
      </Modal>
    </div>
  );
}
export function AssessmentSchedule({
  item,
  units,
  editable,
  onChange,
  onOpen,
}: {
  item: AssessmentItem;
  units: TeachingUnit[];
  editable: boolean;
  onChange: (units: TeachingUnit[]) => void;
  onOpen: (id: string) => void;
}) {
  const [unitId, setUnitId] = useState(""),
    [phase, setPhase] = useState<Link["phase"]>("준비"),
    [stageId, setStageId] = useState("");
  const linked = linkedLessons(units, item.id),
    stage = item.stages?.some((s) => s.id === stageId) ? stageId : null;
  const duplicate = units
    .find((u) => u.id === unitId)
    ?.assessment_links?.some(
      (l) =>
        l.assessment_id === item.id &&
        l.phase === phase &&
        (l.stage_id ?? null) === stage,
    );
  return (
    <div className="assessment-schedule">
      <h4>연결한 수업 · 준비부터 피드백까지</h4>
      {!linked.length && (
        <p className="muted">
          아래에서 수업을 연결하거나 교수학습계획의 ‘평가과제 연결’을
          이용하세요.
        </p>
      )}
      <ul>
        {linked.map(({ unit, index, link }, i) => (
          <li key={i}>
            <span className="scope-tag">{link.phase}</span>
            <button className="text-link" onClick={() => onOpen(unit.id)}>
              {unit.period || unit.day || `${index + 1}번 수업`} ·{" "}
              {unit.title || "단원명 미입력"}
            </button>
            <span>
              {item.stages?.find((s) => s.id === link.stage_id)?.title}
            </span>
            {editable && (
              <button
                className="text-link"
                aria-label={`${index + 1}번 수업 ${link.phase} 연결 해제`}
                onClick={() =>
                  onChange(
                    units.map((u) =>
                      u.id === unit.id
                        ? {
                            ...u,
                            assessment_links: u.assessment_links?.filter(
                              (l) => l !== link,
                            ),
                          }
                        : u,
                    ),
                  )
                }
              >
                해제
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="connection-form">
          <label>
            수업 선택
            <select
              aria-label={`${item.name || "새 평가"} 연결할 수업`}
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="">수업 선택</option>
              {units.map((u, i) => (
                <option key={u.id} value={u.id}>
                  {i + 1}. {u.period || u.day || "기간 미입력"} ·{" "}
                  {u.title || "단원명 미입력"}
                </option>
              ))}
            </select>
          </label>
          <label>
            수업 역할
            <select
              aria-label={`${item.name || "새 평가"} 연결할 역할`}
              value={phase}
              onChange={(e) => setPhase(e.target.value as Link["phase"])}
            >
              {learningPhases.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            진행 단계
            <select
              aria-label={`${item.name || "새 평가"} 연결할 단계`}
              value={stage ?? ""}
              onChange={(e) => setStageId(e.target.value)}
            >
              <option value="">과제 전체</option>
              {item.stages?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || "단계명 미입력"}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={
              !units.some((u) => u.id === unitId) ||
              duplicate ||
              (units.find((u) => u.id === unitId)?.assessment_links?.length ??
                0) >= 100
            }
            onClick={() =>
              onChange(
                units.map((u) =>
                  u.id === unitId
                    ? {
                        ...u,
                        assessment_links: [
                          ...(u.assessment_links ?? []),
                          { assessment_id: item.id, phase, stage_id: stage },
                        ],
                      }
                    : u,
                ),
              )
            }
          >
            수업 연결
          </Button>
        </div>
      )}
    </div>
  );
}

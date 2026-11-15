import { Button } from "@/components/ui/button";
import {
  assessmentChoices,
  linkedLessons,
  learningPhases,
} from "@/lib/teaching-authoring";
import type { TeachingDocument } from "@/lib/teaching";
export function TeachingConnections({
  doc,
  standards,
  onOpenLesson,
  onOpenAssessment,
}: {
  doc: TeachingDocument;
  standards: {
    id: string;
    code: string;
    content: string;
    curriculum_version: string;
  }[];
  onOpenLesson: (id: string) => void;
  onOpenAssessment: (id: string, semester: number) => void;
}) {
  return (
    <section className="teaching-connections panel">
      <div className="section-title">
        <div>
          <h2>수업·평가 연결 검토</h2>
          <p>
            성취기준을 어떤 수업에서 배우고, 어떤 과제와 증거로 확인하는지
            살펴보세요.
          </p>
        </div>
      </div>
      {!assessmentChoices(doc).length && (
        <p className="muted">
          평가과제를 만들면 관련 수업과 채점 요소를 함께 볼 수 있습니다.
        </p>
      )}
      {assessmentChoices(doc).map(({ item: a, semester }) => {
        const lessons = linkedLessons(doc.units, a.id);
        return (
          <article className="connection-overview" key={a.id}>
            <div className="section-title">
              <div>
                <h3>
                  {semester}학기 · {a.name || "이름 없는 평가"}
                </h3>
                <p>{a.task || "학생이 수행할 과제를 작성해 주세요."}</p>
                <p>확인할 증거: {a.evidence || "미작성"}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenAssessment(a.id, semester)}
              >
                과제 설계 열기
              </Button>
            </div>
            <div className="learning-path">
              {learningPhases.map((phase) => (
                <div key={phase}>
                  <h4>{phase}</h4>
                  {lessons
                    .filter((l) => l.link.phase === phase)
                    .map(({ unit, index, link }, i) => (
                      <button
                        className="connection-chip"
                        key={i}
                        onClick={() => onOpenLesson(unit.id)}
                      >
                        {unit.period || unit.day || `${index + 1}번 수업`} ·{" "}
                        {unit.title || "단원명 미입력"}
                        {link.stage_id
                          ? ` / ${a.stages?.find((s) => s.id === link.stage_id)?.title}`
                          : ""}
                      </button>
                    ))}
                  {!lessons.some((l) => l.link.phase === phase) && (
                    <p className="muted">연결된 수업 없음</p>
                  )}
                </div>
              ))}
            </div>
            <dl className="standard-evidence">
              {a.standard_ids.map((id) => {
                const s = standards.find((s) => s.id === id);
                const rows = a.rubric.filter((r) =>
                  r.standard_ids?.includes(id),
                );
                return (
                  <div key={id}>
                    <dt>
                      <b>{s?.code}</b> ({s?.curriculum_version}) {s?.content}
                    </dt>
                    <dd>
                      {rows.length
                        ? rows.map((r) => (
                            <p key={r.id}>
                              {a.stages?.find((s) => s.id === r.stage_id)
                                ?.title || "진행 단계 미지정"}{" "}
                              · <b>{r.element || "평가요소 미작성"}</b> —{" "}
                              {r.evidence || "확인할 증거 미작성"}
                            </p>
                          ))
                        : "이 기준을 확인할 채점 요소가 아직 연결되지 않았습니다."}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="muted">
              진행 단계 {a.stages?.length ?? 0}개 · 채점 요소 {a.rubric.length}
              개 · 연결 수업 {new Set(lessons.map((l) => l.unit.id)).size}개
            </p>
          </article>
        );
      })}
    </section>
  );
}

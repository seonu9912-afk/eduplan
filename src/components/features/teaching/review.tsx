"use client";
import { useState, useEffect } from "react";
import { History, Printer } from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
import { Button } from "@/components/ui/button";
import { InlineNotice, useMutation } from "@/components/common";
import { teachingHistory, restoreTeachingPlan } from "@/app/teaching-actions";
import type { AuthoringIssue } from "@/lib/teaching-authoring";
import type { Row } from "@/lib/models";
export function TeachingReview({
  course,
  issues,
  editable,
  dirty,
  onBusyChange,
  onRestored,
  onPrint,
  onPreview,
  onLocate,
}: {
  course: Row<"teaching_courses">;
  issues: AuthoringIssue[];
  onLocate: (issue: AuthoringIssue) => void;
  editable: boolean;
  dirty: boolean;
  onBusyChange: (busy: boolean) => void;
  onRestored: () => void;
  onPrint: (mode: "lesson" | "assessment") => void;
  onPreview: () => void;
}) {
  const [history, setHistory] = useState<
      | Pick<
          Row<"teaching_plan_versions">,
          "course_id" | "version" | "action" | "actor_name" | "created_at"
        >[]
      | null
    >(null),
    [filter, setFilter] = useState("전체");
  const m = useMutation();
  const errors = issues.filter((i) => i.level === "오류").length,
    checks = issues.length - errors;
  useEffect(() => {
    onBusyChange(m.pending);
    return () => onBusyChange(false);
  }, [m.pending, onBusyChange]);
  return (
    <section className="teaching-section">
      <Disclosure compact label={`제출 전 자동 점검 · 오류 ${errors}건 · 확인 필요 ${checks}건`}>
      <div className="review-summary">
        <button
          aria-pressed={filter === "오류"}
          onClick={() => setFilter(filter === "오류" ? "전체" : "오류")}
        >
          <span>오류</span>
          <b>{errors}</b>
        </button>
        <button
          aria-pressed={filter === "확인 필요"}
          onClick={() =>
            setFilter(filter === "확인 필요" ? "전체" : "확인 필요")
          }
        >
          <span>확인 필요</span>
          <b>{checks}</b>
        </button>
        <div>
          <span>점검 결과</span>
          <b>{issues.length ? "검토 필요" : "정상"}</b>
        </div>
      </div>
      <ul className="review-issues">
        {issues
          .filter((i) => filter === "전체" || i.level === filter)
          .map((i, n) => (
            <li key={n} className={i.level === "오류" ? "error" : "check"}>
              <span>{i.level}</span>
              <b>{i.section}</b>
              <p>{i.message}</p>
              {(i.assessment_id || i.unit_id) && (
                <Button variant="outline" size="sm" onClick={() => onLocate(i)}>
                  해당 내용 보기
                </Button>
              )}
            </li>
          ))}
      </ul>
      {!issues.length && (
        <p className="notice notice-success">
          입력값·연결·합계 점검에서 오류가 발견되지 않았습니다.
        </p>
      )}
      </Disclosure>
      <div className="section-title">
        <div>
          <h2>현재 작성본 출력</h2>
          <p>
            현재 작성 중인 계획을 출력합니다. 제출본 출력은 별도 연계 예정입니다.
          </p>
        </div>
        <div className="teaching-actions">
          <Button variant="outline" onClick={onPreview}>전체 문서 미리보기</Button>
          <Button variant="outline" onClick={() => onPrint("lesson")}>
            <Printer /> 교수학습계획 인쇄
          </Button>
          <Button variant="outline" onClick={() => onPrint("assessment")}>
            <Printer /> 평가계획 인쇄
          </Button>
        </div>
      </div>
      {dirty && (
        <div className="info-box">
          인쇄에는 현재 화면의 미저장 내용도 포함됩니다. 보관할 계획은 먼저
          저장해 주세요.
        </div>
      )}
      <Disclosure compact label="저장 및 변경 이력">
      <div className="teaching-history">
        <div className="section-title">
          <div>
            <h3>변경 이력</h3>
            <p>
              설정·계획 저장마다 버전을 남깁니다. 복원 시 수업 설정은 유지하고
              계획 내용을 작성 중 상태로 가져옵니다.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={m.pending}
            onClick={() =>
              m.execute(
                () => teachingHistory(course.id),
                setHistory,
                "이력을 불러왔습니다.",
              )
            }
          >
            <History /> 변경 이력 불러오기
          </Button>
        </div>
        <InlineNotice mutation={m} />
        {history && (
          <>
            <p className="muted">최근 {history.length}개 버전</p>
            <ol>
              {history.map((h) => (
                <li key={h.version}>
                  <div>
                    <strong>
                      v{h.version} · {h.action}
                    </strong>
                    <small>
                      {new Date(h.created_at).toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                      })}{" "}
                      · {h.actor_name}
                    </small>
                  </div>
                  {editable && h.version !== course.version && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={dirty || m.pending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `v${h.version}의 계획 내용을 복원할까요? 현재 저장본도 이력에 남습니다.`,
                          )
                        )
                          m.execute(
                            () =>
                              restoreTeachingPlan(
                                course.id,
                                course.version,
                                h.version,
                              ),
                            onRestored,
                            "계획 내용을 새 버전으로 복원했습니다.",
                          );
                      }}
                    >
                      v{h.version} 복원
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
      </Disclosure>
    </section>
  );
}

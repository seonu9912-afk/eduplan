"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { InlineNotice, useMutation } from "@/components/common";
import { refreshTeachingReference } from "@/app/teaching-actions";
import {
  currentTeachingReference,
  referenceKey,
  type TeachingReference,
} from "@/lib/teaching";
import {
  annualSchema,
  defaultAnnual,
  academicDays,
  isTeachingDay,
} from "@/lib/academic";
import type { Context, Row } from "@/lib/models";
export function ReferencePanel({
  context: c,
  course,
  editable,
  dirty,
  onBusyChange,
  onSaved,
}: {
  context: Context;
  course: Row<"teaching_courses">;
  editable: boolean;
  dirty: boolean;
  onBusyChange: (busy: boolean) => void;
  onSaved: () => void;
}) {
  const m = useMutation(),
    current = currentTeachingReference(
      c,
      course.grade,
      course.semester,
      course.subject_id,
    ),
    saved = course.reference_snapshot as Partial<TeachingReference> | null;
  const changed =
      referenceKey(current, "curriculum") !== referenceKey(saved, "curriculum"),
    calendarChanged =
      referenceKey(current, "calendar") !== referenceKey(saved, "calendar");
  const parsedPlan = annualSchema.safeParse(c.annual?.document);
  const plan = parsedPlan.success ? parsedPlan.data : defaultAnnual(c.grades);
  const days = academicDays(c.year!.year, plan, c.semesters).filter(
      (d) => !course.semester || d.semester === course.semester,
    );
  const dates = new Set(days.map((d) => d.date));
  const events = c.events.filter((e) =>
    days.some((d) => e.start_date <= d.date && e.end_date >= d.date),
  );
  const next =
    current.curriculum.amount === null
      ? course.expected_hours
      : current.curriculum.amount *
        (current.curriculum.unit === "credits" ? 16 : 1);
  useEffect(() => {
    onBusyChange(m.pending);
    return () => onBusyChange(false);
  }, [m.pending, onBusyChange]);
  return (
    <details
      className={`teaching-reference ${changed || calendarChanged ? "reference-changed" : ""}`}
    >
      <summary>
        교육과정·학사일정 참고{" "}
        {changed || calendarChanged ? (
          <b>원본 변경 확인 필요</b>
        ) : (
          <span>연결 기준 확인</span>
        )}
      </summary>
      <div className="reference-content">
        <div>
          <h3>편성 기준</h3>
          <p>계획에 적용한 기준: {course.expected_hours ?? "미설정"}차시</p>
          <p>
            현재 편성:{" "}
            {current.curriculum.amount === null
              ? "연결된 시수 없음"
              : `${current.curriculum.amount}${current.curriculum.unit === "credits" ? "학점" : "시간"}${current.curriculum.unit === "credits" ? ` (${next}차시 환산)` : ""}`}
          </p>
          {changed && (
            <p className="reference-warning">
              편성표 또는 연결 과목이 변경되었습니다. 기준 차시{" "}
              {course.expected_hours ?? "미설정"} → {next ?? "미설정"}. 작성한
              단원과 평가는 유지됩니다.
            </p>
          )}
          {calendarChanged && (
            <p className="reference-warning">
              학년도·학기·학사일정 원본이 변경되었습니다. 아래 참고 일정과
              계획의 시기를 다시 확인하세요.
            </p>
          )}
          {(changed || calendarChanged) && editable && (
            <Button
              variant="outline"
              disabled={dirty || m.pending}
              onClick={() => {
                if (
                  window.confirm(
                    `현재 편성·학사 기준을 반영할까요? 기준 차시는 ${next ?? "미설정"}이며 단원·평가 내용은 바꾸지 않습니다.`,
                  )
                )
                  m.execute(
                    () => refreshTeachingReference(course.id, course.version),
                    onSaved,
                    "참고 기준을 갱신했습니다. 계획 내용은 유지됩니다.",
                  );
              }}
            >
              변경 확인 후 기준 갱신
            </Button>
          )}
          {dirty && (changed || calendarChanged) && (
            <small>작성 내용을 먼저 저장한 뒤 기준을 갱신하세요.</small>
          )}
          <InlineNotice mutation={m} />
        </div>
        <div>
          <h3>학사일정 참고</h3>
          <p>
            학교 수업일 {days.filter(isTeachingDay).length}일 · 학급별 실제 과목
            차시가 아닙니다.
          </p>
          <p className="muted">
            시간표·학급별 실제 수업일 연동 전이므로 날짜별 차시를 자동 생성하지
            않습니다.
          </p>
          <ul className="reference-dates">
            {plan.vacations
              .filter((v) =>
                days.some((d) => d.date >= v.start && d.date <= v.end),
              )
              .map((v, i) => (
                <li key={`v${i}`}>
                  <b>
                    {v.start} ~ {v.end}
                  </b>{" "}
                  {v.name}
                </li>
              ))}
            {Object.entries(plan.holidays)
              .filter(([d]) => dates.has(d))
              .map(([d, n]) => (
                <li key={d}>
                  <b>{d}</b> {n}
                </li>
              ))}
            {Object.entries(plan.days)
              .filter(
                ([d, v]) =>
                  dates.has(d) && (v.type === "discretionary" || !v.enabled),
              )
              .map(([d, v]) => (
                <li key={`day${d}`}>
                  <b>{d}</b> {v.name || "휴업·사용 해제"}
                </li>
              ))}
            {events.map((e) => (
              <li key={e.id}>
                <b>
                  {e.start_date}
                  {e.end_date !== e.start_date ? ` ~ ${e.end_date}` : ""}
                </b>{" "}
                {e.title}{" "}
                {e.activity_area !== "없음" ? `· ${e.activity_area}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

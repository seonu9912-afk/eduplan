"use client";
import { eventAllocations } from "@/lib/academic-calendar";
import { calendarImpact } from "@/lib/school-operations";
import type { AnnualPlan } from "@/lib/academic";
import type { Context } from "@/lib/models";
export function CalendarImpact({
  context,
  before,
  after,
  from,
  to,
}: {
  context: Context;
  before: AnnualPlan;
  after: AnnualPlan;
  from: string;
  to: string;
}) {
  if (
    !context.year ||
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    from > to
  )
    return null;
  const impact = calendarImpact(context, before, after, from, to);
  return (
    <div className="info-box" role="status">
      <strong>저장 전 변경 영향</strong>
      <p>
        수업일수 {impact.dayDelta > 0 ? "+" : ""}
        {impact.dayDelta}일
        {impact.known
          ? ` · 기존 수업 영향 ${impact.affected.length}건 · 회복 가능 ${impact.restored.length}건`
          : " · 시간표 확정 전에는 교과별 결손을 확정할 수 없습니다."}
      </p>
      {!!impact.affected.length && (
        <ul>
          {impact.affected.slice(0, 12).map((x, i) => (
            <li key={`${x.date}:${x.id}:${i}`}>
              {x.date} {x.period}교시 · {x.classes} · {x.subject}
            </li>
          ))}
        </ul>
      )}
      {impact.affected.length > 12 && <p>외 {impact.affected.length - 12}건</p>}
      <small>
        시간표와 교사가 작성한 수업·평가계획을 자동 재배치하지 않습니다.
      </small>
    </div>
  );
}

export function EventImpact({
  context,
  before,
  draft,
}: {
  context: Context;
  before: AnnualPlan;
  draft: import("@/lib/academic-calendar").EventDraft;
}) {
  let after: AnnualPlan;
  try {
    after = {
      ...before,
      allocations: [
        ...before.allocations.filter((a) => a.eventId !== draft.event.id),
        ...eventAllocations(draft, context, () => "impact"),
      ],
    };
  } catch (e) {
    return (
      <p className="muted-small">
        {e instanceof Error
          ? e.message
          : "행사 입력을 확인하면 영향 분석을 표시합니다."}
      </p>
    );
  }
  const dates = [
    draft.event.start_date,
    draft.event.end_date,
    ...before.allocations
      .filter((a) => a.eventId === draft.event.id)
      .map((a) => a.date),
  ].sort();
  return (
    <CalendarImpact
      context={context}
      before={before}
      after={after}
      from={dates[0]}
      to={dates.at(-1)!}
    />
  );
}

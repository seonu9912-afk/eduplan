import { emptyUnit } from "./teaching";
import { addDays } from "./domain";
import { isTeachingDay, type AcademicDay } from "./academic";
import type {
  AssessmentItem,
  TeachingDocument,
  TeachingUnit,
  ReviewIssue,
} from "./teaching";

export const learningPhases = ["준비", "실시", "피드백"] as const;
export type AssessmentChoice = { item: AssessmentItem; semester: number };
export function assessmentChoices(doc: TeachingDocument): AssessmentChoice[] {
  return doc.evaluations.flatMap((e) =>
    e.items.map((item) => ({ item, semester: e.semester })),
  );
}
export function linkedLessons(units: TeachingUnit[], id: string) {
  return units.flatMap((unit, index) =>
    (unit.assessment_links ?? [])
      .filter((l) => l.assessment_id === id)
      .map((link) => ({ unit, index, link })),
  );
}
export function copyAssessment(item: AssessmentItem): AssessmentItem {
  const copy = structuredClone(item),
    ids = new Map((item.stages ?? []).map((s) => [s.id, crypto.randomUUID()]));
  copy.id = crypto.randomUUID();
  if (copy.stages)
    copy.stages = copy.stages.map((s) => ({ ...s, id: ids.get(s.id)! }));
  copy.rubric = copy.rubric.map((r) => ({
    ...r,
    id: crypto.randomUUID(),
    ...(r.stage_id ? { stage_id: ids.get(r.stage_id) ?? null } : {}),
    levels: r.levels.map((l) => ({ ...l, id: crypto.randomUUID() })),
  }));
  return copy;
}
// Removing a source link preserves all authored text. Do not infer new links by title.
export function changeAssessmentStandards(
  item: AssessmentItem,
  standard_ids: string[],
): AssessmentItem {
  return {
    ...item,
    standard_ids,
    rubric: item.rubric.map((r) => ({
      ...r,
      ...(r.standard_ids
        ? {
            standard_ids: r.standard_ids.filter((id) =>
              standard_ids.includes(id),
            ),
          }
        : {}),
    })),
    ...(item.detail
      ? {
          detail: {
            ...item.detail,
            standard_levels: item.detail.standard_levels.map((l) =>
              l.standard_id && !standard_ids.includes(l.standard_id)
                ? { ...l, standard_id: null }
                : l,
            ),
          },
        }
      : {}),
  };
}
export function reconcileAssessmentLinks(
  doc: TeachingDocument,
): TeachingDocument {
  const items = new Map(assessmentChoices(doc).map((a) => [a.item.id, a.item]));
  return {
    ...doc,
    units: doc.units.map((u) =>
      u.assessment_links
        ? {
            ...u,
            assessment_links: u.assessment_links
              .filter((l) => items.has(l.assessment_id))
              .map((l) =>
                l.stage_id &&
                !items
                  .get(l.assessment_id)!
                  .stages?.some((s) => s.id === l.stage_id)
                  ? { ...l, stage_id: null }
                  : l,
              )
              .filter(
                (l, index, links) =>
                  links.findIndex(
                    (v) =>
                      v.assessment_id === l.assessment_id &&
                      v.phase === l.phase &&
                      (v.stage_id ?? null) === (l.stage_id ?? null),
                  ) === index,
              ),
          }
        : u,
    ),
  };
}
export function authoringIntegrityErrors(doc: TeachingDocument): string[] {
  const errors: string[] = [],
    items = new Map(assessmentChoices(doc).map((a) => [a.item.id, a.item]));
  for (const u of doc.units) {
    const keys = new Set<string>();
    for (const l of u.assessment_links ?? []) {
      const a = items.get(l.assessment_id),
        key = `${l.assessment_id}:${l.phase}:${l.stage_id ?? ""}`;
      if (!a || (l.stage_id && !a.stages?.some((s) => s.id === l.stage_id)))
        errors.push("수업에 연결한 평가과제·진행 단계를 확인하세요.");
      if (keys.has(key)) errors.push("같은 수업·평가 연결이 중복되었습니다.");
      keys.add(key);
    }
  }
  for (const a of items.values()) {
    const stages = new Set((a.stages ?? []).map((s) => s.id));
    if (stages.size !== (a.stages ?? []).length)
      errors.push("평가 진행 단계 ID가 중복되었습니다.");
    for (const r of a.rubric) {
      if (r.stage_id && !stages.has(r.stage_id))
        errors.push("채점 요소의 진행 단계를 확인하세요.");
      if (r.standard_ids?.some((id) => !a.standard_ids.includes(id)))
        errors.push(
          "채점 요소의 성취기준은 해당 과제에 연결한 기준에서 선택하세요.",
        );
    }
    if (
      a.detail?.standard_levels.some(
        (l) => l.standard_id && !a.standard_ids.includes(l.standard_id),
      )
    )
      errors.push("성취수준의 기준 연결을 확인하세요.");
  }
  return [...new Set(errors)];
}
export type AuthoringIssue = ReviewIssue & {
  unit_id?: string;
  assessment_id?: string;
  semester?: number;
};
type Standard = {
  id: string;
  curriculum_version: string;
  school_type: string;
  subject: string;
  grade_band: string;
  code: string;
  content: string;
};
export function reviewAuthoring(
  doc: TeachingDocument,
  standards: Standard[],
): AuthoringIssue[] {
  const result: AuthoringIssue[] = authoringIntegrityErrors(doc).map(
    (message) => ({ level: "오류", section: "평가계획", message }),
  );
  for (const { item: a, semester } of assessmentChoices(doc)) {
    const add = (message: string) =>
      result.push({
        level: "확인 필요",
        section: "평가계획",
        message: `${a.name || "이름 없는 평가"}: ${message}`,
        assessment_id: a.id,
        semester,
      });
    const lessons = linkedLessons(doc.units, a.id);
    if (!lessons.length)
      add("연결된 수업이 없습니다. 준비·실시·피드백 수업을 확인하세요.");
    else {
      if (!lessons.some((l) => l.link.phase === "실시"))
        add("평가를 실시하는 수업이 연결되지 않았습니다.");
      const taught = new Set(
        lessons
          .filter((l) => l.link.phase !== "피드백")
          .flatMap((l) => l.unit.standard_ids),
      );
      const missing = a.standard_ids.filter((id) => !taught.has(id));
      if (missing.length)
        add(
          `연결한 준비·실시 수업에서 확인되지 않는 성취기준: ${missing.map((id) => standards.find((s) => s.id === id)?.code || "기준 확인 필요").join(", ")}. 학습 기회를 확인하세요.`,
        );
      if (
        a.start &&
        lessons.some(
          (l) =>
            l.link.phase === "준비" &&
            l.unit.start &&
            l.unit.start > (a.end || a.start),
        )
      )
        add("평가 기간 뒤에 배치된 준비 수업이 있습니다. 날짜를 확인하세요.");
    }
    if (a.type === "수행평가") {
      if (!a.task?.trim()) add("학생이 수행할 과제를 구체적으로 적어 주세요.");
      if (!a.evidence?.trim()) add("확인할 결과물·활동 기록을 적어 주세요.");
      if (a.stages?.some((s) => !s.title.trim()))
        add("진행 단계 이름이 비어 있습니다.");
      if (a.stages?.length && a.rubric.some((r) => !r.stage_id))
        add("진행 단계에 배치하지 않은 채점 요소가 있습니다.");
      if (a.stages?.some((s) => !a.rubric.some((r) => r.stage_id === s.id)))
        add(
          "채점 요소가 없는 진행 단계가 있습니다. 준비·피드백 전용 단계인지 확인하세요.",
        );
      const covered = new Set(a.rubric.flatMap((r) => r.standard_ids ?? []));
      const uncovered = a.standard_ids.filter((id) => !covered.has(id));
      if (uncovered.length)
        add(
          `채점 요소에서 확인할 성취기준을 연결하세요: ${uncovered.map((id) => standards.find((s) => s.id === id)?.code || "기준 확인 필요").join(", ")}.`,
        );
      if (a.rubric.some((r) => !r.evidence?.trim()))
        add(
          "채점 요소별로 확인할 증거를 적어 주세요. 예: 독서 기록장의 근거, 발표 중 설명.",
        );
      if (
        a.rubric.some((r) =>
          r.levels.some((l) =>
            /^(잘|매우 잘|다소 미흡하게|매우 미흡하게)?\s*(작성|수행|참여)(했을 경우|함|한다)?[.\s]*$/.test(
              l.description.trim(),
            ),
          ),
        )
      )
        add(
          "채점 기준의 정확성·근거·구체성 등 점수 차이를 판단할 근거를 보완해 주세요.",
        );
    }
    if (a.detail?.standard_levels.some((l) => !l.standard_id))
      add(
        "성취기준별 수준 설명에 기준을 연결해 주세요. 기존 문장은 유지됩니다.",
      );
  }
  // Compare only referenced standards in the same curriculum scope; equal codes
  // from different curriculum editions are not a contradiction.
  const used = new Set([
    ...doc.units.flatMap((u) => u.standard_ids),
    ...assessmentChoices(doc).flatMap((a) => a.item.standard_ids),
  ]);
  const groups = new Map<string, Standard[]>();
  for (const s of standards.filter((s) => used.has(s.id))) {
    const key = JSON.stringify([
      s.curriculum_version,
      s.school_type,
      s.subject,
      s.grade_band,
      s.code.trim(),
    ]);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const group of groups.values())
    if (new Set(group.map((s) => s.content.replace(/\s+/g, ""))).size > 1)
      result.push({
        level: "확인 필요",
        section: "평가계획",
        message: `${group[0].curriculum_version} ${group[0].code}: 같은 범위의 성취기준 문장이 서로 다릅니다. 공식 원문과 대조하세요.`,
      });
  return result;
}

// School teaching days supply week boundaries, not actual subject hours.
export function draftTeachingWeeks(
  days: AcademicDay[],
  existing: TeachingUnit[],
): TeachingUnit[] {
  const groups = new Map<string, AcademicDay[]>();
  for (const day of days) {
    const weekday = new Date(day.date + "T12:00:00Z").getUTCDay();
    const monday = addDays(day.date, -(weekday + 6) % 7);
    const key = `${day.semester}:${monday}`;
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  const months = new Map<string, number>();
  return [...groups.values()].flatMap((week) => {
    const teaching = week.filter(isTeachingDay);
    if (!teaching.length) return [];
    const start = teaching[0].date,
      end = teaching[teaching.length - 1].date,
      month = start.slice(0, 7);
    const number = (months.get(month) ?? 0) + 1;
    months.set(month, number);
    if (
      existing.some(
        (u) => u.start && u.start <= end && (u.end || u.start) >= start,
      )
    )
      return [];
    const short = (d: string) =>
      `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
    return [
      {
        ...emptyUnit(),
        kind: "lesson" as const,
        start,
        end,
        month: String(Number(start.slice(5, 7))),
        week: String(number),
        day: `${short(start)}~${short(end)}`,
        period: `${Number(start.slice(5, 7))}월 ${number}주`,
        note: week
          .filter((d) => d.name)
          .map((d) => `${d.date} ${d.name}`)
          .join(" / ")
          .slice(0, 2000),
      },
    ];
  });
}

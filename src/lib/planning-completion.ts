import { z } from "zod";
import {
  academicDays,
  annualSchema,
  isTeachingDay,
  operatingPeriodRange,
} from "./academic";
import {
  createLessonResolver,
  publishedTimetable,
  clockMinutes,
} from "./school-operations";
import type { Context } from "./models";
export const planningDomains = {
  curriculum: "교육과정",
  calendar: "학사일정·행사 승인",
  timetable: "시간표·실시 시수",
  assessment: "교수학습·평가계획",
  staffing: "교원 수급 분석",
  plans: "월중·주간계획",
};
export type PlanningDomain = keyof typeof planningDomains;
export function canPlan(c: Context, domain: PlanningDomain) {
  return (
    c.access?.[domain] ??
    (c.role === "admin" || (c.role === "editor" && domain !== "calendar"))
  );
}
export const activityInputSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    starts_on: z.iso.date(),
    ends_on: z.iso.date(),
    periods: z.number().int().min(1).max(12),
    class_ids: z.array(z.uuid()).min(1).max(120),
    teacher_ids: z.array(z.uuid()).max(150),
    room_id: z.uuid().nullable(),
    constraints_note: z.string().max(2000),
    alternatives: z.string().max(2000),
    selected_date: z.iso.date().nullable(),
    selected_period: z.number().int().min(1).max(12).nullable(),
    submit: z.boolean(),
  })
  .refine((v) => v.starts_on <= v.ends_on, "희망 기간을 확인하세요.");
export type ActivityInput = z.infer<typeof activityInputSchema>;
export type ActivityRequest = ActivityInput & {
  id: string;
  workspace_id: string;
  academic_year_id: string;
  owner_id: string;
  state: "draft" | "requested" | "changes_requested" | "approved" | "rejected";
  review_note: string;
  event_id: string | null;
  version: number;
};
export type Permission = {
  workspace_id: string;
  user_id: string;
  domain: PlanningDomain;
  can_edit: boolean;
  version: number;
};
export type CompletionData = {
  requests: ActivityRequest[];
  permissions: Permission[];
};
export type AssessmentDate = {
  courseId: string;
  grade: number;
  name: string;
  start: string;
  end: string;
  classIds: string[];
};
export type Candidate = {
  date: string;
  period: number;
  end: number;
  impact: string[];
  warnings: string[];
  conflicts: string[];
  score: number;
  startTime: string | null;
  endTime: string | null;
};
/** Recommendations describe known data and its gaps. They never constitute approval. */
export function activityCandidates(
  c: Context,
  input: ActivityInput,
  assessments: AssessmentDate[],
): Candidate[] {
  const parsed = annualSchema.safeParse(c.annual?.document),
    doc = publishedTimetable(c);
  if (!parsed.success || !c.year) return [];
  const days = academicDays(c.year.year, parsed.data, c.semesters),
    resolve = doc ? createLessonResolver(c, doc) : null;
  const targets = c.classes.filter((cl) => input.class_ids.includes(cl.id));
  if (targets.length !== input.class_ids.length) return [];
  const balance: Record<number, number> = {};
  for (const day of days.filter(isTeachingDay))
    balance[day.weekday] = (balance[day.weekday] ?? 0) + 1;
  return days
    .filter(
      (day) =>
        day.date >= input.starts_on &&
        day.date <= input.ends_on &&
        isTeachingDay(day),
    )
    .flatMap((day) =>
      Array.from({ length: 13 - input.periods }, (_, i) => i + 1).flatMap(
        (period) => {
          const end = period + input.periods - 1;
          if (
            targets.some((cls) => {
              const r = operatingPeriodRange(day, parsed.data, cls.grade);
              return !r || period < r.start || end > r.end;
            })
          )
            return [];
          const warnings = [
              "등록되지 않은 교내 사정과 미확정 평가 일정은 담당자가 확인해야 합니다.",
            ],
            conflicts: string[] = [],
            impact: string[] = [];
          const version = c.operations?.effectiveTimetables?.findLast(
            (v) => v.starts_on <= day.date,
          );
          if (!resolve || !version)
            warnings.push(
              "이 날짜에 적용되는 확정 시간표가 없어 교원·특별실·교과 시수 영향을 확인할 수 없습니다.",
            );
          for (const a of parsed.data.allocations.filter(
            (a) => a.date === day.date && a.start <= end && a.end >= period,
          )) {
            if (
              targets.some(
                (cls) =>
                  (!a.classId || a.classId === cls.id) &&
                  a.areas[cls.grade] &&
                  a.areas[cls.grade] !== "없음",
              )
            )
              conflicts.push(
                `기존 행사: ${c.events.find((e) => e.id === a.eventId)?.title ?? a.title}`,
              );
          }
          for (const e of c.events.filter(
            (e) =>
              e.start_date <= day.date &&
              e.end_date >= day.date &&
              targets.some(
                (cls) =>
                  e.target_grades.includes(cls.grade) &&
                  (!e.target_class_ids?.length ||
                    e.target_class_ids.includes(cls.id)),
              ),
          ))
            if (
              !parsed.data.allocations.some(
                (a) => a.eventId === e.id && a.date === day.date,
              )
            )
              warnings.push(`교시 미지정 일정: ${e.title}`);
          const slots = resolve?.(day.date) ?? [],
            affected = slots.filter(
              (l) =>
                l.period >= period && l.period <= end && !l.blockedBy.length,
            );
          for (const lesson of affected) {
            const target = lesson.classIds.some((id) =>
              input.class_ids.includes(id),
            );
            if (target)
              impact.push(
                `${lesson.period}교시 ${lesson.subject} (${lesson.classes})`,
              );
            if (!target && input.teacher_ids.includes(lesson.teacherId))
              conflicts.push(
                `필수 교원 수업: ${lesson.subject} ${lesson.classes}`,
              );
            if (
              input.room_id &&
              lesson.room ===
                c.operations?.resources?.rooms.find(
                  (r) => r.id === input.room_id,
                )?.name &&
              !target
            )
              conflicts.push(`특별실 사용: ${lesson.room}`);
          }
          if (
            slots.some(
              (l) =>
                l.period >= period &&
                l.period <= end &&
                l.blockedBy.some((b) => /충돌|확인|중복/.test(b)),
            )
          )
            warnings.push("시간표의 충돌·불완전 정보가 있습니다.");
          for (const request of c.completion?.requests.filter(
            (r) => r.state === "approved",
          ) ?? []) {
            const allocations = parsed.data.allocations.filter(
              (a) =>
                a.eventId === request.event_id &&
                a.date === day.date &&
                a.start <= end &&
                a.end >= period,
            );
            if (
              allocations.length &&
              ((input.room_id && request.room_id === input.room_id) ||
                request.teacher_ids.some((id) =>
                  input.teacher_ids.includes(id),
                ))
            )
              conflicts.push(
                `승인된 교육활동의 장소·교원 사용: ${request.title}`,
              );
          }
          for (const a of assessments.filter((a) =>
            targets.some((cls) =>
              a.classIds.length
                ? a.classIds.includes(cls.id)
                : cls.grade === a.grade,
            ),
          )) {
            if (!a.start || !a.end)
              warnings.push(`평가 날짜 미지정: ${a.name}`);
            else if (a.start <= day.date && a.end >= day.date)
              conflicts.push(`확정 평가: ${a.name}`);
          }
          const first = affected.find((l) => l.period === period),
            last = affected.find((l) => l.period === end);
          return [
            {
              date: day.date,
              period,
              end,
              impact: [...new Set(impact)],
              warnings: [...new Set(warnings)],
              conflicts: [...new Set(conflicts)],
              score:
                conflicts.length * 10000 +
                warnings.length * 100 +
                impact.length * 5 -
                (balance[day.weekday] ?? 0),
              startTime: first?.start ?? null,
              endTime: last?.end ?? null,
            },
          ];
        },
      ),
    )
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.date.localeCompare(b.date) ||
        a.period - b.period,
    );
}
export type LessonRecord = {
  workspace_id: string;
  academic_year_id: string;
  date: string;
  class_id: string;
  period: number;
  publication_id: string;
  lesson_id: string;
  subject_id: string;
  teacher_id: string;
  outcome: "held" | "cancelled";
  actual_minutes: number;
  recognized_hours: number | null;
  reason: string;
  version: number;
  confirmed_at: string;
};
export const recordInputSchema = z.object({
  date: z.iso.date(),
  class_id: z.uuid(),
  period: z.number().int().min(1).max(12),
  publication_id: z.uuid(),
  lesson_id: z.string().min(1),
  subject_id: z.uuid(),
  teacher_id: z.uuid(),
  outcome: z.enum(["held", "cancelled"]),
  actual_minutes: z.number().int().min(0).max(240),
  recognized_hours: z.number().min(0).max(10).nullable(),
  reason: z.string().max(1000),
  version: z.number().int().nonnegative(),
});
export type LessonInput = z.infer<typeof recordInputSchema>;
export function ledgerLessons(c: Context, start: string, end: string) {
  const doc = publishedTimetable(c),
    parsed = annualSchema.safeParse(c.annual?.document);
  if (!doc || !parsed.success || !c.year) return [];
  const resolve = createLessonResolver(c, doc);
  return academicDays(c.year.year, parsed.data, c.semesters)
    .filter((d) => d.date >= start && d.date <= end)
    .flatMap((d) =>
      resolve(d.date)
        .filter((l) => !l.blockedBy.length)
        .flatMap((l) =>
          l.classIds.map((class_id) => ({
            ...l,
            class_id,
            publication_id:
              c.operations?.effectiveTimetables?.findLast(
                (v) => v.starts_on <= d.date,
              )?.id ?? "",
            actual_minutes: Math.max(
              0,
              (clockMinutes(l.end) ?? 0) - (clockMinutes(l.start) ?? 0),
            ),
          })),
        ),
    );
}

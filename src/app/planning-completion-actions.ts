"use server";
import { z } from "zod";
import { annualSchema, academicDays, isTeachingDay } from "@/lib/academic";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data";
import { getOperationsData } from "@/lib/operations-data";
import {
  activityInputSchema,
  activityCandidates,
  canPlan,
  ledgerLessons,
  planningDomains,
  recordInputSchema,
  type AssessmentDate,
  type LessonRecord,
} from "@/lib/planning-completion";
import {
  myTeacherIds,
  seoulClock,
  clockMinutes,
} from "@/lib/school-operations";
import type { Result } from "@/lib/models";
const scope = z.object({
  workspaceId: z.uuid(),
  year: z.number().int().min(2000).max(2100),
});
async function run<T>(f: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await f() };
  } catch (e) {
    const v = e as { message?: string };
    return {
      ok: false,
      error:
        e instanceof z.ZodError
          ? e.issues[0].message
          : v.message && /[가-힣]/.test(v.message)
            ? v.message
            : "계획 자료를 처리하지 못했습니다. 입력을 유지하고 다시 시도해 주세요.",
    };
  }
}
async function source(v: z.infer<typeof scope>) {
  const db = await createClient(),
    year = await db
      .from("academic_years")
      .select("id")
      .eq("workspace_id", v.workspaceId)
      .eq("year", v.year)
      .single();
  if (year.error) throw Error("학년도를 불러오지 못했습니다.");
  const before = await db.rpc("planning_source_stamp", {
    target: v.workspaceId,
    year_id: year.data.id,
  });
  if (before.error) throw before.error;
  const c = await getWorkspaceContext(v.workspaceId, String(v.year), "calendar", false);
  if (c.year?.id !== year.data.id) throw Error("선택한 학년도를 확인하세요.");
  c.operations = await getOperationsData(c, "calendar", false);
  const assessments = await db.rpc("assessment_calendar", {
    target: v.workspaceId,
    year_id: year.data.id,
  });
  if (assessments.error) throw assessments.error;
  const after = await db.rpc("planning_source_stamp", {
    target: v.workspaceId,
    year_id: year.data.id,
  });
  if (after.error || before.data !== after.data)
    throw Error("학교 계획이 변경되었습니다. 최신 자료로 다시 분석해 주세요.");
  return {
    db,
    c,
    stamp: after.data,
    assessments: assessments.data as unknown as AssessmentDate[],
  };
}
function refresh() {
  revalidatePath("/app", "layout");
}
export async function analyzeActivity(input: unknown) {
  return run(async () => {
    const v = scope.extend({ activity: activityInputSchema }).parse(input),
      { c, stamp, assessments } = await source(v);
    if (!c.hasOfficialCalendar || !annualSchema.safeParse(c.annual?.document).success)
      throw Error("학사일정이 없거나 형식이 맞지 않아 분석할 수 없습니다.");
    if (
      v.activity.starts_on < `${v.year}-03-01` ||
      v.activity.ends_on >= `${v.year + 1}-03-01`
    )
      throw Error("희망 기간은 해당 학년도 안에서 선택하세요.");
    return {
      candidates: activityCandidates(c, v.activity, assessments),
      stamp,
    };
  });
}
export async function saveActivityRequest(input: unknown) {
  return run(async () => {
    const v = scope
        .extend({
          id: z.uuid().nullable(),
          version: z.number().int().nonnegative(),
          activity: activityInputSchema,
        })
        .parse(input),
      { db, c, assessments } = await source(v);
    if (v.activity.submit) {
      const selected = activityCandidates(c, v.activity, assessments).find(
        (x) =>
          x.date === v.activity.selected_date &&
          x.period === v.activity.selected_period,
      );
      if (!selected || selected.conflicts.length)
        throw Error(
          selected?.conflicts[0] ?? "조건에 맞는 후보 일정을 다시 선택하세요.",
        );
    }
    const result = await db.rpc("save_activity_request", {
      target: v.workspaceId,
      year_id: c.year!.id,
      request: v.id,
      expected: v.version,
      payload: v.activity,
    });
    if (result.error) throw result.error;
    refresh();
    return result.data;
  });
}
export async function reviewActivityRequest(input: unknown) {
  return run(async () => {
    const v = scope
        .extend({
          id: z.uuid(),
          version: z.number().int().positive(),
          decision: z.enum(["approved", "changes_requested", "rejected"]),
          note: z.string().trim().min(1).max(2000),
          stamp: z.string(),
          acknowledged: z.boolean(),
          area: z.enum([
            "교과",
            "자율",
            "자율·자치",
            "동아리",
            "진로",
            "봉사",
            "학교자율시간",
            "없음",
          ]),
        })
        .parse(input),
      { db, c, stamp, assessments } = await source(v);
    if (!canPlan(c, "calendar"))
      throw Error("학사일정 담당 권한이 필요합니다.");
    const r = c.completion?.requests.find((x) => x.id === v.id);
    if (!r || r.version !== v.version)
      throw Error("요청이 변경되었습니다. 다시 불러와 주세요.");
    if (v.decision === "approved") {
      if (v.stamp !== stamp)
        throw Error("분석 후 학교 계획이 변경되었습니다. 다시 분석하세요.");
      const selected = activityCandidates(c, r, assessments).find(
        (x) => x.date === r.selected_date && x.period === r.selected_period,
      );
      if (!selected || selected.conflicts.length)
        throw Error(
          selected?.conflicts[0] ??
            "현재 운영 조건에 맞는 날짜·교시가 아닙니다.",
        );
      if (!v.acknowledged)
        throw Error(
          "분석의 확인 필요 사항과 학교의 승인 절차 완료 여부를 확인하세요.",
        );
    }
    const result = await db.rpc("review_activity_request", {
      target: v.workspaceId,
      request: v.id,
      expected: v.version,
      decision: v.decision,
      note: v.note,
      source_stamp: stamp,
      area: v.area,
    });
    if (result.error) throw result.error;
    refresh();
    return result.data;
  });
}
const range = scope
  .extend({ from: z.iso.date(), to: z.iso.date() })
  .refine(
    (v) =>
      v.from <= v.to &&
      v.from >= `${v.year}-03-01` &&
      v.to < `${v.year + 1}-03-01`,
    "해당 학년도 안의 조회 기간을 선택하세요.",
  );
export async function loadLessonLedger(input: unknown) {
  return run(async () => {
    const v = range.parse(input),
      { db, c, stamp } = await source(v),
      result = await db.rpc("lesson_records_data", {
        target: v.workspaceId,
        year_id: c.year!.id,
        first_date: v.from,
        last_date: v.to,
      });
    if (result.error) throw result.error;
    const annual = annualSchema.safeParse(c.annual?.document);
    if (!annual.success)
      throw Error(
        "학사일정이 없거나 형식이 맞지 않아 예정 시수를 계산할 수 없습니다.",
      );
    const missing = academicDays(c.year!.year, annual.data, c.semesters).filter(
      (d) =>
        d.date >= v.from &&
        d.date <= v.to &&
        isTeachingDay(d) &&
        !c.operations?.effectiveTimetables?.some((t) => t.starts_on <= d.date),
    ).length;
    return {
      warnings: missing
        ? [
            `조회 기간 중 ${missing}개 수업일에 적용되는 확정 시간표가 없어 예정 시수에 포함하지 못했습니다.`,
          ]
        : [],
      lessons: ledgerLessons(c, v.from, v.to),
      records: result.data as unknown as LessonRecord[],
      stamp,
      hasPublication: !!c.operations?.publication,
    };
  });
}
export async function saveLessonRecords(input: unknown) {
  return run(async () => {
    const v = scope
        .extend({
          stamp: z.string(),
          entries: z.array(recordInputSchema).min(1).max(100),
        })
        .parse(input),
      { db, c, stamp } = await source(v);
    if (stamp !== v.stamp)
      throw Error("수업 운영 정보가 변경되었습니다. 다시 조회하세요.");
    const dates = v.entries.map((x) => x.date).sort(),
      lessons = ledgerLessons(c, dates[0], dates.at(-1)!),
      clock = seoulClock(new Date()),
      ids = myTeacherIds(c);
    for (const entry of v.entries) {
      const lesson = lessons.find(
        (x) =>
          x.date === entry.date &&
          x.period === entry.period &&
          x.class_id === entry.class_id,
      );
      if (
        !lesson ||
        lesson.id !== entry.lesson_id ||
        lesson.publication_id !== entry.publication_id ||
        lesson.subjectId !== entry.subject_id ||
        lesson.teacherId !== entry.teacher_id
      )
        throw Error(
          "현재 확정 시간표에 유효한 수업만 기록할 수 있습니다. 기존 기록은 이력에 보존됩니다.",
        );
      if (!canPlan(c, "timetable") && !ids.has(lesson.teacherId))
        throw Error("본인에게 연결된 수업만 확인할 수 있습니다.");
      if (
        entry.date > clock.date ||
        (entry.date === clock.date &&
          (clockMinutes(lesson.end) ?? 1440) > clock.minutes)
      )
        throw Error("종료된 수업만 실시 확인할 수 있습니다.");
      if (
        (entry.outcome === "held" && entry.actual_minutes <= 0) ||
        (entry.outcome === "cancelled" && entry.actual_minutes !== 0)
      )
        throw Error("실시 여부와 실제 수업 시간을 확인하세요.");
      if (
        (entry.outcome === "cancelled" ||
          entry.actual_minutes !== lesson.actual_minutes) &&
        !entry.reason.trim()
      )
        throw Error("취소 또는 실제 수업 시간 변경 사유를 입력하세요.");
      if (entry.recognized_hours !== null && !entry.reason.trim())
        throw Error("인정 시수의 기준과 사유를 입력하세요.");
    }
    const result = await db.rpc("save_lesson_records", {
      target: v.workspaceId,
      year_id: c.year!.id,
      source_stamp: stamp,
      entries: v.entries,
    });
    if (result.error) throw result.error;
    refresh();
    return result.data;
  });
}
export async function savePlanningPermission(input: unknown) {
  return run(async () => {
    const v = z
        .object({
          workspaceId: z.uuid(),
          member: z.uuid(),
          domain: z.enum(
            Object.keys(planningDomains) as [
              keyof typeof planningDomains,
              ...(keyof typeof planningDomains)[],
            ],
          ),
          allowed: z.boolean(),
          version: z.number().int().nonnegative(),
        })
        .parse(input),
      db = await createClient();
    const result = await db.rpc("save_planning_permission", {
      target: v.workspaceId,
      member: v.member,
      area: v.domain,
      allowed: v.allowed,
      expected: v.version,
    });
    if (result.error) throw result.error;
    refresh();
    return undefined;
  });
}

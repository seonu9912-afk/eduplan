import { z } from "zod";
import {
  academicDays,
  annualSchema,
  defaultAnnual,
  eventPeriodAllocations,
  isTeachingDay,
  operatingPeriodRange,
  type AnnualPlan,
} from "./academic";
import { addDays } from "./domain";
import type { Context } from "./models";
import {
  timetableDocumentSchema,
  type TimetableDocument,
} from "./timetable-bridge";

export type DatedLesson = {
  id: string;
  date: string;
  period: number;
  subjectId: string;
  subject: string;
  teacherId: string;
  classIds: string[];
  classes: string;
  room: string;
  start: string | null;
  end: string | null;
  changed: boolean;
  blockedBy: string[];
};
export function publishedTimetable(c: Context): TimetableDocument | null {
  const parsed = timetableDocumentSchema.safeParse(
    c.operations?.publication?.document,
  );
  return parsed.success ? parsed.data : null;
}
const bellSchema = z.array(
  z
    .object({
      type: z.string(),
      period: z.number().optional(),
      start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })
    .passthrough(),
);
export function createLessonResolver(
  c: Context,
  document: TimetableDocument,
  annual?: AnnualPlan,
) {
  const parsed = annualSchema.safeParse(c.annual?.document),
    plan = annual ?? (parsed.success ? parsed.data : defaultAnnual(c.grades));
  const days = new Map(
    academicDays(c.year?.year ?? document.year, plan, c.semesters).map((d) => [
      d.date,
      d,
    ]),
  );
  const bells = bellSchema.safeParse(document.timetableConfig?.bell),
    bell = bells.success ? bells.data : [];
  const byDate = new Map<string, AnnualPlan["allocations"]>();
  for (const a of plan.allocations)
    byDate.set(a.date, [...(byDate.get(a.date) ?? []), a]);
  return (date: string): DatedLesson[] => {
    const day = days.get(date);
    if (!day) return [];
    const base = document.weekly
      .filter((s) => s.weekday === day.weekday)
      .map((s) => ({ ...s, changed: false, cancelled: false }));
    for (const override of document.overrides.filter((x) => x.date === date)) {
      const old = base.find(
        (x) =>
          x.scope === override.scope &&
          x.scopeId === override.scopeId &&
          x.period === override.period,
      );
      if (old) {
        old.cancelled = true;
        old.changed = true;
      }
      if (
        override.action === "replace" &&
        typeof override.subjectId === "string"
      )
        base.push({
          id: String(
            override.id ?? `${date}:${override.scopeId}:${override.period}`,
          ),
          scope: override.scope,
          scopeId: override.scopeId,
          weekday: day.weekday,
          period: override.period,
          subjectId: override.subjectId,
          teacherId: String(override.teacherId ?? ""),
          room: String(override.room ?? ""),
          changed: true,
          cancelled: false,
        });
    }
    return base
      .map((slot) => {
        const classIds =
          slot.scope === "class"
            ? [slot.scopeId]
            : (document.groups.find((g) => g.id === slot.scopeId)?.classIds ??
              []);
        const blocked: string[] = [];
        if (slot.cancelled) blocked.push("수업 취소·교환 또는 보결 변경");
        if (!isTeachingDay(day)) blocked.push(day.name || "수업일이 아닙니다.");
        if (!classIds.length) blocked.push("연결 학급 확인 필요");
        for (const classId of classIds) {
          const cls = c.classes.find((x) => x.id === classId);
          if (!cls) {
            blocked.push("현재 학년도에 없는 학급");
            continue;
          }
          const range = operatingPeriodRange(day, plan, cls.grade);
          if (!range || slot.period < range.start || slot.period > range.end)
            blocked.push(`${cls.grade}학년 운영 교시 밖`);
          const allocated = eventPeriodAllocations(
            byDate.get(date) ?? [],
            cls.grade,
            slot.period,
            classId,
          );
          const recurring = plan.recurring.filter(
            (r) =>
              r.grade === cls.grade &&
              r.semester === day.semester &&
              r.weekday === day.weekday &&
              r.start <= slot.period &&
              slot.period <= r.end &&
              !r.exclude.includes(date) &&
              r.area !== "없음",
          );
          const activities = allocated.length
            ? allocated.map((a) => ({
                name: a.title,
                area: a.areas[cls.grade],
              }))
            : recurring.map((r) => ({ name: r.name, area: r.area }));
          const kinds: Record<string, string[]> = {
            자율: ["creative_self"],
            "자율·자치": ["creative_self"],
            동아리: ["creative_club", "sports"],
            진로: ["creative_career"],
            봉사: ["creative_volunteer"],
            학교자율시간: ["autonomous"],
          };
          const subjectKind = document.subjects.find(
            (s) => s.id === slot.subjectId,
          )?.kind;
          for (const a of activities)
            if (
              a.area !== "교과" &&
              !(kinds[a.area] ?? []).includes(subjectKind ?? "")
            )
              blocked.push(a.name);
          if (activities.length > 1) blocked.push("행사·활동 교시 중복");
        }
        const time = bell.find(
          (x) => x.type === "lesson" && x.period === slot.period,
        );
        return {
          id: slot.id,
          date,
          period: slot.period,
          subjectId: slot.subjectId,
          subject:
            document.subjects.find((s) => s.id === slot.subjectId)?.label ??
            "미등록 과목",
          teacherId: slot.teacherId,
          classIds,
          classes: classIds
            .map(
              (id) =>
                document.classes.find((x) => x.id === id)?.label ??
                "미등록 학급",
            )
            .join(", "),
          room: slot.room,
          start: time?.start ?? null,
          end: time?.end ?? null,
          changed: slot.changed,
          blockedBy: [...new Set(blocked)],
        };
      })
      .sort(
        (a, b) => a.period - b.period || a.classes.localeCompare(b.classes),
      );
  };
}
export function myTeacherIds(c: Context): Set<string> {
  return new Set([
    c.userId,
    ...(c.operations?.directory ?? [])
      .filter((t) => t.user_id === c.userId)
      .map((t) => t.id),
  ]);
}
export function seoulClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((x) => x.type === type)?.value ?? "00";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
    minutes:
      Number(part("hour")) * 60 +
      Number(part("minute")) +
      Number(part("second")) / 60,
  };
}
export const clockMinutes = (time: string | null) =>
  time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : null;
export function currentAndNext(lessons: DatedLesson[], minutes: number) {
  const active = lessons.filter((x) => !x.blockedBy.length && x.start && x.end);
  const current = active.filter(
    (x) => clockMinutes(x.start)! <= minutes && minutes < clockMinutes(x.end)!,
  );
  const next =
    active
      .filter((x) => clockMinutes(x.start)! > minutes)
      .sort((a, b) => clockMinutes(a.start)! - clockMinutes(b.start)!)[0] ??
    null;
  return {
    current,
    next,
    remaining: next ? Math.ceil(clockMinutes(next.start)! - minutes) : null,
  };
}
export type ScheduleItem = {
  id: string;
  date: string;
  end: string;
  title: string;
  department: string;
  kind: string;
  time: string;
  location: string;
  grades: number[];
  source: "event" | "allocation" | "business";
};
export function unifiedSchedule(
  c: Context,
  start: string,
  end: string,
): ScheduleItem[] {
  const parsed = annualSchema.safeParse(c.annual?.document),
    plan = parsed.success ? parsed.data : defaultAnnual();
  const events = c.events
    .filter((e) => e.start_date <= end && e.end_date >= start)
    .map((e) => ({
      id: e.id,
      date: e.start_date,
      end: e.end_date,
      title: e.title,
      department: e.department,
      kind: "학사일정",
      time: "",
      location: "",
      grades: e.target_grades,
      source: "event" as const,
    }));
  const allocations = plan.allocations
    .filter(
      (a) =>
        a.date >= start &&
        a.date <= end &&
        (!a.eventId || !c.events.some((e) => e.id === a.eventId)),
    )
    .map((a) => ({
      id: a.id,
      date: a.date,
      end: a.date,
      title: a.title,
      department: a.department,
      kind: "학사일정",
      time: `${a.start}~${a.end}교시`,
      location: "",
      grades: Object.keys(a.areas)
        .filter((g) => a.areas[g] !== "없음")
        .map(Number),
      source: "allocation" as const,
    }));
  const business = plan.business
    .filter((b) => b.date >= start && b.date <= end)
    .map((b) => ({
      id: b.id,
      date: b.date,
      end: b.date,
      title: b.text,
      department: b.department,
      kind: b.kind,
      time: b.time ?? "",
      location: b.location ?? "",
      grades: [],
      source: "business" as const,
    }));
  return [...events, ...allocations, ...business].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.title.localeCompare(b.title),
  );
}
export function timetableIssues(doc: TimetableDocument): string[] {
  const issues: string[] = [];
  if (!doc.weekly.length) issues.push("편성된 수업이 없습니다.");
  const bell = bellSchema.safeParse(doc.timetableConfig?.bell);
  if (!bell.success)
    issues.push("개인 시간표 안내를 위한 학교 일과표를 설정하세요.");
  else {
    const lessons = bell.data
        .filter((b) => b.type === "lesson")
        .sort((a, b) => a.start.localeCompare(b.start)),
      periods = new Set<number>();
    for (const [i, b] of lessons.entries()) {
      if (
        !Number.isInteger(b.period) ||
        !b.period ||
        b.period < 1 ||
        b.period > 12 ||
        periods.has(b.period) ||
        b.start >= b.end ||
        (i > 0 && lessons[i - 1].end > b.start)
      )
        issues.push("학교 일과표의 교시·시각 중복을 확인하세요.");
      if (b.period) periods.add(b.period);
    }
  }
  function checkSlots(slots: TimetableDocument["weekly"], prefix: string) {
    const occupied = new Set<string>();
    for (const slot of slots) {
      const ids =
        slot.scope === "class"
          ? [slot.scopeId]
          : (doc.groups.find((g) => g.id === slot.scopeId)?.classIds ?? []);
      if (
        !ids.length ||
        ids.some((id) => !doc.classes.some((c) => c.id === id))
      )
        issues.push("미등록 학급이 연결된 수업이 있습니다.");
      if (!doc.subjects.some((s) => s.id === slot.subjectId))
        issues.push("미등록 과목이 연결된 수업이 있습니다.");
      if (!slot.teacherId || !doc.teachers.some((t) => t.id === slot.teacherId))
        issues.push("담당 교사가 미지정인 수업이 있습니다.");
      for (const key of [
        ...ids.map((id) => `class:${id}`),
        `teacher:${slot.teacherId}`,
        ...(slot.room ? [`room:${slot.room}`] : []),
      ]) {
        const k = `${key}:${slot.weekday}:${slot.period}`;
        if (occupied.has(k))
          issues.push(
            `${prefix} ${slot.weekday}요일 ${slot.period}교시에 학급·교사·특별실 중복이 있습니다.`,
          );
        occupied.add(k);
      }
      if (
        bell.success &&
        !bell.data.some(
          (b) =>
            b.type === "lesson" &&
            b.period === slot.period &&
            clockMinutes(b.start)! < clockMinutes(b.end)!,
        )
      )
        issues.push(`${slot.period}교시의 시작·종료 시각을 확인하세요.`);
    }
  }
  checkSlots(doc.weekly, "주간 시간표");
  // A valid recurring template does not imply valid substitutions on a specific date.
  const overrideSchema = z.object({
    date: z.iso.date(),
    scope: z.enum(["class", "group"]),
    scopeId: z.string().min(1),
    period: z.number().int().min(1).max(12),
    action: z.enum(["cancel", "replace"]),
    subjectId: z.string().optional(),
    teacherId: z.string().optional(),
    room: z.string().optional(),
  });
  const changes = z.array(overrideSchema).safeParse(doc.overrides);
  if (!changes.success)
    issues.push("날짜별 수업 변경의 날짜·교시·작업을 확인하세요.");
  else
    for (const date of new Set(changes.data.map((x) => x.date))) {
      const rule = doc.dayRules.find((x) => x.date === date);
      const weekday =
        rule?.weekdayOverride || new Date(`${date}T12:00:00Z`).getUTCDay();
      if (
        date < `${doc.year}-03-01` ||
        date >= `${doc.year + 1}-03-01` ||
        weekday < 1 ||
        weekday > 5
      ) {
        issues.push(`${date}: 학년도와 운영 요일을 확인하세요.`);
        continue;
      }
      const overrides = changes.data.filter((x) => x.date === date),
        keys = new Set<string>();
      const rows = doc.weekly.filter(
        (s) =>
          s.weekday === weekday &&
          !overrides.some(
            (o) =>
              o.scope === s.scope &&
              o.scopeId === s.scopeId &&
              o.period === s.period,
          ),
      );
      for (const o of overrides) {
        const key = `${o.scope}:${o.scopeId}:${o.period}`;
        if (keys.has(key))
          issues.push(`${date}: 같은 수업에 변경 사항이 중복되었습니다.`);
        keys.add(key);
        if (
          o.scope === "class"
            ? !doc.classes.some((c) => c.id === o.scopeId)
            : !doc.groups.some((g) => g.id === o.scopeId)
        )
          issues.push(`${date}: 변경할 수업의 학급 연결을 확인하세요.`);
        if (o.action === "replace")
          rows.push({
            ...o,
            id: key,
            weekday,
            subjectId: o.subjectId ?? "",
            teacherId: o.teacherId ?? "",
            room: o.room ?? "",
          });
      }
      checkSlots(rows, date);
    }
  return [...new Set(issues)];
}
export function calendarImpact(
  c: Context,
  before: AnnualPlan,
  after: AnnualPlan,
  from: string,
  to: string,
) {
  const doc = publishedTimetable(c);
  const oldDays = academicDays(c.year!.year, before, c.semesters).filter(
    (d) => d.date >= from && d.date <= to && isTeachingDay(d),
  );
  const newDays = academicDays(c.year!.year, after, c.semesters).filter(
    (d) => d.date >= from && d.date <= to && isTeachingDay(d),
  );
  if (!doc)
    return {
      dayDelta: newDays.length - oldDays.length,
      known: false,
      affected: [] as DatedLesson[],
      restored: [] as DatedLesson[],
    };
  const oldResolve = createLessonResolver(c, doc, before),
    newResolve = createLessonResolver(c, doc, after),
    affected: DatedLesson[] = [],
    restored: DatedLesson[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const old = oldResolve(date),
      next = newResolve(date);
    for (const row of old.filter((x) => !x.blockedBy.length))
      if (!next.some((x) => x.id === row.id && !x.blockedBy.length))
        affected.push(row);
    for (const row of next.filter((x) => !x.blockedBy.length))
      if (!old.some((x) => x.id === row.id && !x.blockedBy.length))
        restored.push(row);
  }
  return {
    dayDelta: newDays.length - oldDays.length,
    known: true,
    affected,
    restored,
  };
}

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
import { emptyResources, resourcesSchema } from "./planning-resources";
import { publicationAt, publishedSchoolContext } from "./school-publications";
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
  return parsed.success ? { ...parsed.data, _published: true } : null;
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
): (date: string) => DatedLesson[] {
  if (document._published && c.operations?.effectiveTimetables) {
    const versions = c.operations.effectiveTimetables
      .map((v) => ({
        ...v,
        parsed: timetableDocumentSchema.safeParse(v.document),
      }))
      .sort((a, b) => b.starts_on.localeCompare(a.starts_on));
    const resolvers = new Map<
      string,
      ReturnType<typeof createLessonResolver>
    >();
    return (date: string): DatedLesson[] => {
      const version = versions.find((v) => v.starts_on <= date);
      if (!version || !version.parsed.success) return [];
      const calendar = c.schoolPublications && !annual
        ? publicationAt(c.schoolPublications, "calendar", date) : undefined;
      if (c.schoolPublications && !annual && !calendar) return [];
      const key = `${version.id}:${calendar?.id ?? ""}`;
      if (!resolvers.has(key)) {
        const official = calendar ? publishedSchoolContext(c, date) : c;
        const resources = resourcesSchema.safeParse(version.parsed.data.publishedResources);
        const resolvedContext = !official.operations ? official : {
          ...official,
          operations: {
            ...official.operations,
            resources: resources.success ? resources.data :
              c.schoolPublications ? emptyResources() : official.operations.resources,
          },
        };
        resolvers.set(
          key,
          createLessonResolver(
            resolvedContext,
            { ...version.parsed.data, _published: false },
            annual,
          ),
        );
      }
      return resolvers.get(key)!(date);
    };
  }
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
    const applications = (c.operations?.resources?.applications ?? []).filter(
      (a) => a.starts_on <= date && a.ends_on >= date,
    );
    const selectedBell =
      applications.length === 1
        ? c.operations?.resources?.bells.find(
            (b) => b.id === applications[0].schedule_id,
          )
        : null;
    const dayBell = selectedBell?.rows ?? bell;
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
    const resolved = base
      .map((slot) => {
        const classIds =
          slot.scope === "class"
            ? [slot.scopeId]
            : (document.groups.find((g) => g.id === slot.scopeId)?.classIds ??
              []);
        const blocked: string[] = [];
        if (!annual && !parsed.success)
          blocked.push("학사일정 자료를 확인할 수 없습니다.");
        if (applications.length > 1) blocked.push("특별 시정표 적용 충돌");
        if (applications.length === 1 && !selectedBell)
          blocked.push("특별 시정표 원본 확인 필요");
        if (
          document.overrides.filter(
            (x) =>
              x.date === date &&
              x.scope === slot.scope &&
              x.scopeId === slot.scopeId &&
              x.period === slot.period,
          ).length > 1
        )
          blocked.push("같은 수업에 상충하는 변경이 있습니다.");
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
                name:
                  c.events.find((e) => e.id === a.eventId)?.title ?? a.title,
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
        const time = dayBell.find(
          (x) => x.type === "lesson" && x.period === slot.period,
        );
        if (!time) blocked.push("해당 교시의 수업 시각을 확인할 수 없습니다.");
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
          room:
            c.operations?.resources?.rooms.find((r) => r.id === slot.room)
              ?.name ?? document.roomLabels?.[slot.room] ?? slot.room,
          start: time?.start ?? null,
          end: time?.end ?? null,
          changed: slot.changed,
          blockedBy: [...new Set(blocked)],
        };
      })
      .sort(
        (a, b) => a.period - b.period || a.classes.localeCompare(b.classes),
      );
    const occupied = new Map<string, DatedLesson>();
    const active = resolved.filter((l) => !l.blockedBy.length);
    for (const row of active)
      for (const resource of [
        ...row.classIds.map((id) => `class:${id}`),
        ...(row.teacherId ? [`teacher:${row.teacherId}`] : []),
        ...(row.room ? [`room:${row.room}`] : []),
      ]) {
        const key = `${row.period}:${resource}`,
          other = occupied.get(key);
        if (other) {
          const issue = "같은 교시의 학급·교원·특별실 충돌";
          if (!row.blockedBy.includes(issue)) row.blockedBy.push(issue);
          if (!other.blockedBy.includes(issue)) other.blockedBy.push(issue);
        } else occupied.set(key, row);
      }
    return resolved;
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

export function dailyOperationNotice(c: Context, date: string): string {
  const official = publishedSchoolContext(c, date);
  const parsed = annualSchema.safeParse(official.annual?.document);
  if (!parsed.success || (c.schoolPublications && !official.hasOfficialCalendar))
    return "적용 중인 공개 학사일정이 없습니다.";
  if (
    c.operations?.effectiveTimetables &&
    !c.operations.effectiveTimetables.some((v) => v.starts_on <= date)
  )
    return "이 날짜에 적용할 확정 시간표가 없습니다. 시간표에서 적용 시작일을 지정해 주세요.";
  const plan = parsed.data,
    day = academicDays(c.year!.year, plan, official.semesters).find(
      (d) => d.date === date,
    );
  const version = [...(c.operations?.effectiveTimetables ?? [])]
    .sort((a, b) => b.starts_on.localeCompare(a.starts_on)).find((v) => v.starts_on <= date);
  const doc = timetableDocumentSchema.safeParse(version?.document);
  const savedResources = resourcesSchema.safeParse(doc.success ? doc.data.publishedResources : null);
  const resources = savedResources.success ? savedResources.data :
    c.schoolPublications ? undefined : c.operations?.resources;
  const app = resources?.applications.find(
    (a) => a.starts_on <= date && a.ends_on >= date,
  );
  const bell = resources?.bells.find(
    (b) => b.id === app?.schedule_id,
  );
  return [
    day?.type === "swap"
      ? `${["일", "월", "화", "수", "목", "금", "토"][day.weekday]}요일 시간표 적용`
      : "",
    bell ? `특별 시정표: ${bell.name}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Adapter for the preserved timetable editor. Dates and counts use the same engine as home and teaching plans. */
export function commonTimetableView(c: Context, document: TimetableDocument) {
  const parsed = annualSchema.safeParse(c.annual?.document);
  const days = parsed.success
    ? academicDays(c.year?.year ?? document.year, parsed.data, c.semesters)
    : [];
  const resolve = createLessonResolver(c, document);
  const totals: Record<
    string,
    {
      total: number;
      bySubject: Record<string, number>;
      byCategory: Record<string, number>;
      terms: number[];
    }
  > = Object.fromEntries(
    document.classes.map((c) => [
      c.id,
      { total: 0, bySubject: {}, byCategory: {}, terms: [0, 0] },
    ]),
  );
  const byWeekday: Record<number, number> = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  };
  const warnings: { message: string }[] = parsed.success
    ? []
    : [
        {
          message:
            "학사일정 미등록 또는 형식 오류: 예상 시수를 계산할 수 없습니다.",
        },
      ];
  const conflicts = timetableIssues(document).map((message) => ({
    message,
    count: 1,
    date: `${document.year}-03-01`,
  }));
  for (const day of days) {
    if (!isTeachingDay(day)) continue;
    byWeekday[day.weekday]++;
    for (const lesson of resolve(day.date).filter((l) => !l.blockedBy.length))
      for (const classId of lesson.classIds) {
        const row = totals[classId];
        if (!row) continue;
        row.total++;
        if (day.semester) row.terms[day.semester - 1]++;
        row.bySubject[lesson.subjectId] =
          (row.bySubject[lesson.subjectId] ?? 0) + 1;
        const kind =
            document.subjects.find((s) => s.id === lesson.subjectId)?.kind ??
            "subject",
          category = kind === "sports" ? "creative_club" : kind;
        row.byCategory[category] = (row.byCategory[category] ?? 0) + 1;
      }
  }
  const targets = z
    .array(
      z.object({ grade: z.number(), subjectId: z.string(), hours: z.number() }),
    )
    .safeParse(document.targets);
  if (targets.success)
    for (const cls of document.classes)
      for (const target of targets.data.filter(
        (t) => t.grade === cls.grade && t.hours > 0,
      )) {
        const actual = totals[cls.id]?.bySubject[target.subjectId] ?? 0;
        if (actual < target.hours)
          warnings.push({
            message: `${cls.label} ${document.subjects.find((s) => s.id === target.subjectId)?.label ?? "과목"}: 학교 목표보다 ${target.hours - actual}시간 부족 예상`,
          });
      }
  const teaching = days.filter(isTeachingDay);
  return {
    summary: {
      daysTotal: teaching.length,
      firstTerm: teaching.filter((d) => d.semester === 1).length,
      secondTerm: teaching.filter((d) => d.semester === 2).length,
      byWeekday,
      totals,
      warnings,
      conflicts,
    },
    term2Start: days.find((d) => d.semester === 2)?.date ?? "",
    resolveDate: (date: string) =>
      resolve(date)
        .filter((l) => !l.blockedBy.length)
        .flatMap((l) =>
          l.classIds.map((id) => ({
            ...l,
            id: `${l.id}:${id}`,
            scope: "class",
            scopeId: id,
            source: l.changed ? "override" : "weekly",
          })),
        ),
  };
}

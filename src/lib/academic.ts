import { z } from "zod";
import { addDays, monthRange, isoDate } from "./domain";
import { resourceList } from "./external-links";
export const dayTypes = {
  instructional: "수업일",
  weekend: "주말",
  holiday: "공휴일",
  vacation: "방학",
  discretionary: "재량휴업일",
  swap: "요일 교체",
} as const;
export const areas = [
  "교과",
  "자율",
  "자율·자치",
  "동아리",
  "진로",
  "봉사",
  "학교자율시간",
  "없음",
] as const;
const period = z.number().int().min(1).max(12);
const gradeKey = z.string().regex(/^[1-6]$/);
const range = z
  .object({ start: period, end: period })
  .refine((v) => v.start <= v.end, "종료 교시를 확인해 주세요.");
const day = z
  .object({
    type: z.enum(
      Object.keys(dayTypes) as [
        keyof typeof dayTypes,
        ...(keyof typeof dayTypes)[],
      ],
    ),
    name: z.string().max(100),
    enabled: z.boolean(),
    weekday: z.number().int().min(1).max(5),
    start: period.optional(),
    end: period.optional(),
    gradePeriods: z.record(gradeKey, range).optional(),
  })
  .refine((v) => (v.start == null && v.end == null) ||
    (v.start != null && v.end != null && v.start <= v.end));
export const annualSchema = z
  .object({
    vacations: z
      .array(
        z
          .object({
            name: z.string().min(1).max(60),
            start: isoDate,
            end: isoDate,
          })
          .refine((v) => v.start <= v.end),
      )
      .max(12),
    days: z.record(isoDate, day),
    holidays: z.record(isoDate, z.string().max(100)),
    timetable: z
      .array(
        z
          .object({
            grade: z.number().int().min(1).max(6),
            weekday: z.number().int().min(1).max(5),
          })
          .and(range),
      )
      .max(30),
    recurring: z
      .array(
        z
          .object({
            id: z.string().max(80),
            name: z.string().min(1).max(100),
            area: z.enum(areas),
            grade: z.number().int().min(1).max(6),
            semester: z.number().int().min(1).max(2),
            weekday: z.number().int().min(1).max(5),
            exclude: z.array(isoDate).max(366),
          })
          .and(range),
      )
      .max(300),
    allocations: z
      .array(
        z
          .object({
            id: z.string().max(80),
            eventId: z.string().max(80).optional(),
            classId: z.uuid().optional(),
            date: isoDate,
            title: z.string().min(1).max(100),
            department: z.string().max(60),
            areas: z.record(gradeKey, z.enum(areas)),
          })
          .and(range)
          .refine((v) => !v.classId || (!!v.eventId && Object.keys(v.areas).length === 1)),
      )
      .max(1500),
    departments: z.array(z.string().min(1).max(60)).min(1).max(20),
    workSettings: z.object({ dutyEnabled: z.boolean() }).optional(),
    business: z
      .array(
        z.object({
          id: z.string().max(80),
          date: isoDate,
          department: z.string().max(60),
          kind: z.enum(["업무", "출장", "당직", "협의사항"]),
          text: z.string().min(1).max(2000),
          time: z.string().max(120).optional(),
          location: z.string().max(120).optional(),
          participants: z.string().max(120).optional(),
          resources: resourceList.optional(),
        }),
      )
      .max(3000),
    weather: z.object({
      nx: z.number().int().min(1).max(149),
      ny: z.number().int().min(1).max(253),
      landCode: z.string().regex(/^[A-Z0-9]{8}$/),
      tempCode: z.string().regex(/^[A-Z0-9]{8}$/),
    }),
  })
  .superRefine((v, ctx) => {
    if (Object.keys(v.days).length > 366)
      ctx.addIssue({ code: "custom", message: "학사일은 366일 이내입니다." });
    const keys = v.timetable.map((x) => `${x.grade}-${x.weekday}`);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: "custom",
        message: "학년·요일 시간표가 중복됩니다.",
      });
  });
export type AnnualPlan = z.infer<typeof annualSchema>;
export type AcademicClass = { id: string; grade: number; class_number: number };
export type AcademicDay = {
  date: string;
  type: keyof typeof dayTypes;
  name: string;
  enabled: boolean;
  weekday: number;
  semester: number;
  start?: number;
  end?: number;
  gradePeriods?: AnnualPlan["days"][string]["gradePeriods"];
};
export function defaultAnnual(grades: number[] = []): AnnualPlan {
  return {
    vacations: [],
    days: {},
    holidays: {},
    timetable: grades.flatMap((grade) =>
      [1, 2, 3, 4, 5].map((weekday) => ({ grade, weekday, start: 1, end: 6 })),
    ),
    recurring: [],
    allocations: [],
    business: [],
    workSettings: { dutyEnabled: false },
    departments: [
      "교무지원부",
      "교육과정지원부",
      "학생활동지원부",
      "기숙사지원부",
      "방과후학교지원부",
      "행정실",
    ],
    weather: { nx: 60, ny: 127, landCode: "11B00000", tempCode: "11B10101" },
  };
}
type TermDates = { number: number; start_date: string; end_date: string };

function dateRules(date: string, plan: AnnualPlan) {
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const vacation = plan.vacations.find((v) => date >= v.start && date <= v.end);
  const holiday = plan.holidays[date] || (date.endsWith("-03-01") ? "삼일절" : "");
  const override: AnnualPlan['days'][string] | undefined = Object.hasOwn(plan.days, date) ? plan.days[date] : undefined;
  const type = holiday
    ? "holiday"
    : vacation
      ? "vacation"
      : weekday === 0 || weekday === 6 ? "weekend" : "instructional";
  return {
    date, type, name: holiday || vacation?.name || "", enabled: true,
    ...override,
    weekday: override?.type === "swap" ? override.weekday : weekday,
  } satisfies Omit<AcademicDay, "semester">;
}

export function effectiveAcademicTerms(
  year: number,
  plan: AnnualPlan,
  terms: TermDates[],
): TermDates[] {
  const summer = [
    ...plan.vacations.filter((v) => /여름|하계/.test(v.name)),
    ...Object.entries(plan.days).filter(([, rule]) =>
      rule.enabled && rule.type === "vacation" && /여름|하계/.test(rule.name),
    ).map(([date]) => ({ start: date, end: date })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  const first = terms.find((t) => t.number === 1);
  const second = terms.find((t) => t.number === 2);
  if (!summer.length || !first || !second) return terms;
  const lastSummer = summer.map((v) => v.end).sort().at(-1)!;
  const firstEnd = addDays(summer[0].start, -1);
  if (firstEnd < first.start_date) return terms;
  const end = monthRange(`${year + 1}-02`).end;
  for (let date = addDays(lastSummer, 1); date <= end && date <= second.end_date; date = addDays(date, 1)) {
    if (isTeachingDay({ ...dateRules(date, plan), semester: 2 }))
      return terms.map((t) => t.number === 1 ? { ...t, end_date: firstEnd }
        : t.number === 2 ? { ...t, start_date: date } : t);
  }
  return terms;
}

export function academicDays(
  year: number,
  plan: AnnualPlan,
  savedTerms: TermDates[],
): AcademicDay[] {
  const terms = effectiveAcademicTerms(year, plan, savedTerms);
  const result: AcademicDay[] = [];
  const end = monthRange(`${year + 1}-02`).end;
  for (let date = `${year}-03-01`; date <= end; date = addDays(date, 1)) {
    result.push({
      ...dateRules(date, plan),
      semester: terms.find((t) => date >= t.start_date && date <= t.end_date)?.number ?? 0,
    });
  }
  return result;
}

export function operatingPeriodRange(day: AcademicDay, plan: AnnualPlan, grade: number) {
  return day.gradePeriods?.[grade] ??
    (day.start != null && day.end != null ? { start: day.start, end: day.end } :
      plan.timetable.find((row) => row.grade === grade && row.weekday === day.weekday));
}

export function eventPeriodAllocations(
  rows: AnnualPlan["allocations"], grade: number, period: number, classId?: string,
) {
  const applicable = rows.filter((row) => row.start <= period && period <= row.end &&
    row.areas[grade] && row.areas[grade] !== "없음");
  // Class-specific slots override the common allocation only at the matching
  // periods. Other periods continue to inherit the existing grade-wide plan.
  const classEvents = new Set(applicable.filter((row) => row.classId === classId && row.classId)
    .map((row) => row.eventId));
  return applicable.filter((row) => row.classId ? row.classId === classId : !classEvents.has(row.eventId));
}

export function calculateAcademic(
  year: number,
  plan: AnnualPlan,
  grades: number[],
  terms: { number: number; start_date: string; end_date: string }[],
  classes: AcademicClass[] = [],
) {
  const days = academicDays(year, plan, terms);
  const warnings: string[] = [];
  const byDate = new Map<string, AnnualPlan["allocations"]>();
  for (const row of plan.allocations) {
    const rows = byDate.get(row.date) ?? [];
    rows.push(row);
    byDate.set(row.date, rows);
  }
  function calculateDay(day: AcademicDay, grade: number, schoolClass?: AcademicClass) {
      const periods = operatingPeriodRange(day, plan, grade);
      const start = periods?.start ?? 1, end = periods?.end ?? 0;
      const active = isTeachingDay(day);
      const scope = schoolClass ? `${grade}학년 ${schoolClass.class_number}반` : `${grade}학년`;
      if (active && end < start)
        warnings.push(
          `${day.date} ${grade}학년: 수업일의 기본 교시를 설정해 주세요.`,
        );
      const counts: Record<string, number> = {};
      let conflicts = 0;
      const allocations = byDate.get(day.date) ?? [];
      if (active)
        for (let p = start; p <= end; p++) {
          const events = eventPeriodAllocations(allocations, grade, p, schoolClass?.id);
          const rules = plan.recurring.filter(
            (r) =>
              r.grade === grade &&
              r.semester === day.semester &&
              r.weekday === day.weekday &&
              r.start <= p &&
              r.end >= p &&
              !r.exclude.includes(day.date) &&
              r.area !== "없음",
          );
          const choices = events.length
            ? events.map((a) => a.areas[String(grade)])
            : rules.map((r) =>
                /스포츠\s*클럽/.test(r.name) ? "동아리" : r.area,
              );
          if (choices.length > 1) {
            conflicts++;
            warnings.push(`${day.date} ${scope} ${p}교시 중복 배정${events.length ?
              ` (${events.map((event) => event.title).join(", ")})` : ""}`);
            continue;
          }
          const area = choices[0] ?? "교과";
          counts[area] = (counts[area] ?? 0) + 1;
        }
      for (const a of allocations.filter(
        (a) =>
          (!a.classId || a.classId === schoolClass?.id) &&
          a.areas[String(grade)] &&
          a.areas[String(grade)] !== "없음" && a.areas[String(grade)] !== "교과",
      ))
        if (!active || a.start < start || a.end > end)
          warnings.push(
            `${day.date} ${scope} ${a.title}: 수업일·교시 범위 확인`,
          );
      for (const r of plan.recurring.filter(
        (r) =>
          active &&
          r.grade === grade &&
          r.semester === day.semester &&
          r.weekday === day.weekday &&
          !r.exclude.includes(day.date),
      ))
        if (r.start < start || r.end > end)
          warnings.push(
            `${day.date} ${grade}학년 ${r.name}: 반복 활동 교시 범위 확인`,
          );
      return {
        date: day.date,
        grade,
        semester: day.semester,
        active,
        counts,
        hours: active && end >= start ? end - start + 1 : 0,
        conflicts,
        unconfigured: active && end < start,
      };
  }
  const details = days.flatMap((day) => grades.map((grade) => calculateDay(day, grade)));
  function summarize(grade: number, details: ReturnType<typeof calculateDay>[]) {
    return [1, 2].map((semester) => {
      const rows = details.filter((d) => d.semester === semester);
      return {
        grade,
        semester,
        days: rows.filter((d) => d.active).length,
        hours: rows.reduce((n, d) => n + d.hours, 0),
        conflicts: rows.reduce((n, d) => n + d.conflicts, 0),
        unconfigured: rows.filter((d) => d.unconfigured).length,
        counts: Object.fromEntries(
          areas
            .filter((a) => a !== "없음")
            .map((a) => [a, rows.reduce((n, d) => n + (d.counts[a] ?? 0), 0)]),
        ),
      };
    });
  }
  const totals = grades.flatMap((grade) => summarize(grade, details.filter((d) => d.grade === grade)));
  const classTotals = classes.flatMap((schoolClass) =>
    summarize(schoolClass.grade, days.map((day) => calculateDay(day, schoolClass.grade, schoolClass)))
      .map((total) => ({ ...total, classId: schoolClass.id, classNumber: schoolClass.class_number })),
  );
  const knownClasses = new Set(classes.map((schoolClass) => schoolClass.id));
  if (classes.length) for (const row of plan.allocations) {
    if (row.classId && !knownClasses.has(row.classId))
      warnings.push(`${row.date} ${row.title}: 보관된 학급 예외 확인`);
  }
  return { days, details, totals, classTotals, warnings: [...new Set(warnings)] };
}

// School teaching days are counted once per date, independently of period setup.
export function isTeachingDay(day: AcademicDay) {
  return (
    day.enabled &&
    day.semester > 0 &&
    ["instructional", "swap"].includes(day.type)
  );
}
export function summarizeAcademicDays(days: AcademicDay[], plan: AnnualPlan) {
  const teaching = days.filter(isTeachingDay);
  return {
    total: teaching.length,
    semesters: [1, 2].map(
      (semester) => teaching.filter((d) => d.semester === semester).length,
    ),
    months: [...new Set(days.map((d) => d.date.slice(0, 7)))].map((month) => ({
      month,
      days: teaching.filter((d) => d.date.startsWith(month)).length,
    })),
    holidays: days.filter((d) => d.enabled && d.type === "holiday").length,
    discretionary: days.filter((d) => d.enabled && d.type === "discretionary")
      .length,
    vacations: plan.vacations.map((v) => ({
      ...v,
      days: days.filter((d) => d.date >= v.start && d.date <= v.end).length,
    })),
  };
}

// All year responses must succeed; never apply a partial academic-year import.
export function academicHolidayImport(
  year: number,
  responses: { ok: boolean; days: Record<string, string> }[],
) {
  if (responses.length !== 2 || responses.some((r) => !r.ok))
    return { ok: false as const, days: {} };
  const start = `${year}-03-01`,
    end = `${year + 1}-03-01`;
  const days = Object.fromEntries(
    responses
      .flatMap((r) => Object.entries(r.days))
      .filter(([d]) => d >= start && d < end),
  );
  return { ok: true as const, days };
}

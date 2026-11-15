import { z } from "zod";
import { addDays, monthRange, isoDate } from "./domain";
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
    start: period,
    end: period,
  })
  .refine((v) => v.start <= v.end);
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
            date: isoDate,
            title: z.string().min(1).max(100),
            department: z.string().max(60),
            areas: z.record(z.string().regex(/^[1-6]$/), z.enum(areas)),
          })
          .and(range),
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
export type AcademicDay = {
  date: string;
  type: keyof typeof dayTypes;
  name: string;
  enabled: boolean;
  weekday: number;
  semester: number;
  start?: number;
  end?: number;
};
export function defaultAnnual(grades: number[]): AnnualPlan {
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
export function academicDays(
  year: number,
  plan: AnnualPlan,
  terms: { number: number; start_date: string; end_date: string }[],
): AcademicDay[] {
  const result: AcademicDay[] = [];
  const end = monthRange(`${year + 1}-02`).end;
  for (let date = `${year}-03-01`; date <= end; date = addDays(date, 1)) {
    const weekday = new Date(date + "T12:00:00Z").getUTCDay();
    const vacation = plan.vacations.find(
      (v) => date >= v.start && date <= v.end,
    );
    const holiday =
      plan.holidays[date] || (date.endsWith("-03-01") ? "삼일절" : "");
    const override: Partial<AnnualPlan["days"][string]> = plan.days[date] ?? {};
    const type = holiday
      ? "holiday"
      : vacation
        ? "vacation"
        : weekday === 0 || weekday === 6
          ? "weekend"
          : "instructional";
    result.push({
      date,
      type,
      name: holiday || vacation?.name || "",
      enabled: true,
      semester:
        terms.find((t) => date >= t.start_date && date <= t.end_date)?.number ??
        0,
      ...override,
      weekday:
        override?.type === "swap" ? (override.weekday ?? weekday) : weekday,
    });
  }
  return result;
}
export function calculateAcademic(
  year: number,
  plan: AnnualPlan,
  grades: number[],
  terms: { number: number; start_date: string; end_date: string }[],
) {
  const days = academicDays(year, plan, terms);
  const warnings: string[] = [];
  const details = days.flatMap((day) =>
    grades.map((grade) => {
      const table = plan.timetable.find(
        (t) => t.grade === grade && t.weekday === day.weekday,
      );
      const start = day.start ?? table?.start ?? 1,
        end = day.end ?? table?.end ?? 0;
      const active = isTeachingDay(day);
      if (active && end < start)
        warnings.push(
          `${day.date} ${grade}학년: 수업일의 기본 교시를 설정해 주세요.`,
        );
      const counts: Record<string, number> = {};
      let conflicts = 0;
      if (active)
        for (let p = start; p <= end; p++) {
          const events = plan.allocations.filter(
            (a) =>
              a.date === day.date &&
              a.start <= p &&
              a.end >= p &&
              a.areas[String(grade)] &&
              a.areas[String(grade)] !== "없음",
          );
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
            warnings.push(`${day.date} ${grade}학년 ${p}교시 중복 배정`);
            continue;
          }
          const area = choices[0] ?? "교과";
          counts[area] = (counts[area] ?? 0) + 1;
        }
      for (const a of plan.allocations.filter(
        (a) =>
          a.date === day.date &&
          a.areas[String(grade)] &&
          a.areas[String(grade)] !== "없음",
      ))
        if (!active || a.start < start || a.end > end)
          warnings.push(
            `${day.date} ${grade}학년 ${a.title}: 수업일·교시 범위 확인`,
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
      };
    }),
  );
  const totals = grades.flatMap((grade) =>
    [1, 2].map((semester) => {
      const rows = details.filter(
        (d) => d.grade === grade && d.semester === semester,
      );
      return {
        grade,
        semester,
        days: rows.filter((d) => d.active).length,
        hours: rows.reduce((n, d) => n + d.hours, 0),
        conflicts: rows.reduce((n, d) => n + d.conflicts, 0),
        counts: Object.fromEntries(
          areas
            .filter((a) => a !== "없음")
            .map((a) => [a, rows.reduce((n, d) => n + (d.counts[a] ?? 0), 0)]),
        ),
      };
    }),
  );
  return { days, details, totals, warnings: [...new Set(warnings)] };
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

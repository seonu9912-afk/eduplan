import { dayTypes, type AnnualPlan } from "./academic";

type Choice = "draft" | "stored";
type ConflictingEdit = { key: string; label: string; draft: unknown; stored: unknown };

function canonical(value: unknown) {
  return JSON.stringify(value, (_, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
    : entry);
}

export function sameAnnualValue(a: unknown, b: unknown) {
  return canonical(a) === canonical(b);
}

export function describeDateRule(rule: AnnualPlan["days"][string] | undefined) {
  if (!rule) return "기본 날짜 적용";
  const grades = Object.entries(rule.gradePeriods ?? {}).map(([grade, range]) =>
    `${grade}학년 ${range.start}~${range.end}교시`);
  return [dayTypes[rule.type], rule.name, !rule.enabled && "사용 해제",
    rule.type === "swap" && `${["일", "월", "화", "수", "목", "금"][rule.weekday]}요일 시간표`,
    rule.start && `${rule.start}~${rule.end}교시`, ...grades].filter(Boolean).join(" · ");
}

export function mergeAnnualPlans(
  base: AnnualPlan, draft: AnnualPlan, stored: AnnualPlan,
  choices: Readonly<Record<string, Choice>> = {},
) {
  const conflicts: ConflictingEdit[] = [];

  function mergeValue<T>(key: string, label: string, previous: T, local: T, latest: T): T {
    if (sameAnnualValue(local, previous)) return latest;
    if (sameAnnualValue(previous, latest) || sameAnnualValue(local, latest)) return local;
    conflicts.push({ key, label, draft: local, stored: latest });
    return choices[key] === "draft" ? local : latest;
  }

  function mergeRecord<T>(field: string, label: (key: string) => string,
    previous: Record<string, T>, local: Record<string, T>, latest: Record<string, T>) {
    const keys = new Set([...Object.keys(latest), ...Object.keys(local), ...Object.keys(previous)]);
    const entries: [string, T][] = [];
    for (const key of keys) {
      const next = mergeValue<T | undefined>(`${field}:${key}`, label(key),
        previous[key], local[key], latest[key]);
      if (next !== undefined) entries.push([key, next]);
    }
    return Object.fromEntries(entries);
  }

  function mergeRows<T>(field: string, label: string, key: (item: T) => string,
    previous: T[], local: T[], latest: T[]) {
    const group = (rows: T[]) => {
      const result: Record<string, T[]> = Object.create(null);
      for (const row of rows) (result[key(row)] ??= []).push(row);
      return result;
    };
    return Object.values(mergeRecord(field, (key) => `${label} · ${key}`,
      group(previous), group(local), group(latest))).flat();
  }

  const plan: AnnualPlan = {
    days: mergeRecord("days", (date) => date, base.days, draft.days, stored.days),
    holidays: mergeRecord("holidays", (date) => `${date} 공휴일`, base.holidays, draft.holidays, stored.holidays),
    allocations: mergeRows("allocations", "행사 교시", (row) => row.date,
      base.allocations, draft.allocations, stored.allocations),
    timetable: mergeRows("timetable", "요일별 운영 교시", (row) => `${row.grade}학년 ${row.weekday}요일`,
      base.timetable, draft.timetable, stored.timetable),
    recurring: mergeRows("recurring", "반복 활동", (row) => row.id,
      base.recurring, draft.recurring, stored.recurring),
    business: mergeRows("business", "학교 업무", (row) => row.id,
      base.business, draft.business, stored.business),
    vacations: mergeValue("vacations", "방학", base.vacations, draft.vacations, stored.vacations),
    departments: mergeValue("departments", "부서", base.departments, draft.departments, stored.departments),
    workSettings: mergeValue("workSettings", "학교 업무 설정", base.workSettings, draft.workSettings, stored.workSettings),
    weather: mergeValue("weather", "날씨 설정", base.weather, draft.weather, stored.weather),
  };
  return { plan, conflicts };
}

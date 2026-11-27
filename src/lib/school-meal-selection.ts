import type { SchoolMeal } from "./school-public-data-model";

export type MealEndTimes = Partial<Record<string, number>>;

export const defaultMealEnds: Record<string, number> = { "1": 8 * 60 + 30, "2": 13 * 60 + 30, "3": 19 * 60 };

export function mealEndTimesFromRows(rows: readonly { type: string; label?: unknown; start: string; end: string }[]): MealEndTimes {
  const result: MealEndTimes = {};
  for (const row of rows) {
    if (row.type === "lesson") continue;
    const label = typeof row.label === "string" ? row.label : "";
    const code = /조식|아침\s*(식사|급식)/.test(label) ? "1"
      : row.type === "lunch" || /중식|점심/.test(label) ? "2"
      : /석식|저녁\s*(식사|급식)/.test(label) ? "3" : null;
    if (!code || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.end) || row.end <= row.start) continue;
    const [hour, minute] = row.end.split(":").map(Number);
    result[code] = Math.max(result[code] ?? 0, hour * 60 + minute);
  }
  return result;
}

export function orderedMeals(meals: readonly SchoolMeal[]): SchoolMeal[] {
  return [...meals].sort((a, b) => (Number(a.code) || 99) - (Number(b.code) || 99));
}

export function automaticMealCode(meals: readonly SchoolMeal[], minutes: number, ends: MealEndTimes = {}): string | undefined {
  const ordered = orderedMeals(meals);
  return (ordered.find((meal) => minutes < (ends[meal.code] ?? defaultMealEnds[meal.code] ?? 1440)) ?? ordered.at(-1))?.code;
}

export function koreanMealMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
}

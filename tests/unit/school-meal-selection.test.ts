import { expect, it } from "vitest";
import { automaticMealCode, mealEndTimesFromRows, koreanMealMinutes } from "../../src/lib/school-meal-selection";
const meals = ["3", "1", "2"].map((code) => ({ code, name: code, dishes: [] }));
it("selects the next available meal until it ends, retaining the last meal at night", () => {
  expect([0, 509, 510, 809, 810, 1140, 1439].map((minute) => automaticMealCode(meals, minute))).toEqual(["1", "1", "2", "2", "3", "3", "3"]);
  expect(automaticMealCode(meals.filter((meal) => meal.code !== "1"), 0)).toBe("2");
  expect(automaticMealCode(meals.filter((meal) => meal.code === "2"), 1439)).toBe("2");
  expect(automaticMealCode([], 0)).toBeUndefined();
});
it("honors published meal times and uses Korean local time", () => {
  const ends = mealEndTimesFromRows([
    { type: "other", label: "조식", start: "07:40", end: "08:00" },
    { type: "lunch", label: "점심", start: "12:10", end: "12:50" },
    { type: "other", label: "석식", start: "17:30", end: "18:00" },
  ]);
  expect(ends).toEqual({ "1": 480, "2": 770, "3": 1080 });
  expect(automaticMealCode(meals, 480, ends)).toBe("2");
  expect(automaticMealCode(meals, 770, ends)).toBe("3");
  expect(koreanMealMinutes(new Date("2026-11-27T00:30:00Z"))).toBe(570);
});

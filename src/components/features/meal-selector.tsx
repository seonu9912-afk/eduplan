"use client";

import { useEffect, useState } from "react";
import { dateLabel } from "@/lib/domain";
import { automaticMealCode, koreanMealMinutes, orderedMeals, type MealEndTimes } from "@/lib/school-meal-selection";
import type { SchoolMeal } from "@/lib/school-public-data-model";

export function MealSelector({ meals, today, ends, initialMinutes }: {
  meals: SchoolMeal[]; today: string; ends: MealEndTimes; initialMinutes: number;
}) {
  const [minutes, setMinutes] = useState(initialMinutes);
  const [manual, setManual] = useState<{ code: string; automatic: string | undefined } | null>(null);
  useEffect(() => {
    const tick = () => setMinutes(koreanMealMinutes(new Date()));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 10000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  const ordered = orderedMeals(meals);
  const automatic = automaticMealCode(ordered, minutes, ends);
  const selected = manual && manual.automatic === automatic && ordered.some((meal) => meal.code === manual.code)
    ? manual.code : automatic;
  const meal = ordered.find((item) => item.code === selected);
  if (!meal) return null;
  return <>
    <div className="school-meal-heading">
      {ordered.length > 1 ? <div className="school-meal-tabs" role="group" aria-label="급식 선택">
        {ordered.map((item) => <button key={item.code} type="button" aria-pressed={item.code === selected}
          onClick={() => setManual({ code: item.code, automatic })}>{item.name}</button>)}
      </div> : <strong>{meal.name}</strong>}
      <time dateTime={today}>{dateLabel(today)}</time>
    </div>
    <ul className="school-meal-menu" aria-label={meal.name}>{meal.dishes.map((dish, index) => <li key={index}>{dish}</li>)}</ul>
    <p className="public-data-source">나이스 교육정보 개방 포털</p>
  </>;
}

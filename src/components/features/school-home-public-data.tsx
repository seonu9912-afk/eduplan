import { Suspense, type ReactNode } from "react";
import { CloudSun, Utensils } from "lucide-react";
import { dateLabel } from "@/lib/domain";
import { getSchoolMeals } from "@/lib/neis";
import { getSchoolWeather } from "@/lib/school-weather";
import type { Row } from "@/lib/models";
import { koreanMealMinutes, type MealEndTimes } from "@/lib/school-meal-selection";
import { MealSelector } from "./meal-selector";
import "./school-extras.css";

function PublicWidget({ kind, children }: { kind: "weather" | "meal"; children: ReactNode }) {
  const [Icon, title] = kind === "weather" ? [CloudSun, "학교 날씨"] as const : [Utensils, "오늘의 급식"] as const;
  return <section className="personal-widget school-public-widget">
    <header className="personal-day-heading"><h2><Icon aria-hidden="true" />{title}</h2></header>
    {children}
  </section>;
}

function Availability({ children }: { children: ReactNode }) {
  return <p className="personal-widget-note" role="status">{children}</p>;
}

async function WeatherSummary({ school, unavailable }: { school?: Row<"schools"> | null; unavailable?: boolean }) {
  const result = unavailable ? { status: "error" as const } : await getSchoolWeather(school);
  if (result.status !== "available") return <Availability>{{
    unlinked: "학교 날씨 위치가 연결되지 않았습니다.",
    unconfigured: "이 환경에는 기상청 조회 설정이 없습니다.",
    missing: "기상청에서 표시할 날씨 자료를 제공하지 않았습니다.",
    error: "학교 날씨를 불러오지 못했습니다.",
  }[result.status]}</Availability>;
  const weather = result.value;
  return <>
    <p className="public-data-address">{school?.road_address || school?.region || "학교에 설정된 위치"}</p>
    <div className="school-weather-now">
      <strong>{weather.temperature === null ? "—" : `${weather.temperature}°`}</strong>
      <div>
        <b>{weather.condition ?? "날씨 상태 확인 불가"}</b>
        {weather.forecastHour && <small>{weather.forecastHour} 예보</small>}
        <small>{weather.observedAt ? `${weather.observedAt} 관측 기온` : "관측 기온 확인 불가"}</small>
      </div>
    </div>
    <dl className="school-weather-details">
      <div><dt>최저</dt><dd>{weather.low === null ? "—" : `${weather.low}°`}</dd></div>
      <div><dt>최고</dt><dd>{weather.high === null ? "—" : `${weather.high}°`}</dd></div>
      <div><dt>강수확률</dt><dd>{weather.precipitation === null ? "—" : `${weather.precipitation}%`}</dd></div>
    </dl>
    <p className="public-data-source">기상청</p>
  </>;
}

async function MealSummary({ school, today, unavailable, mealEnds }: { school?: Row<"schools"> | null; today: string; unavailable?: boolean; mealEnds: MealEndTimes }) {
  const result = unavailable ? { status: "error" as const } : await getSchoolMeals(school, today);
  if (result.status !== "available") return <>
    <time dateTime={today} className="public-data-address">{dateLabel(today)}</time>
    <Availability>{{
      unlinked: "나이스 학교 정보가 연결되지 않았습니다.",
      unconfigured: "이 환경에는 나이스 조회 설정이 없습니다.",
      missing: "오늘 공개된 급식 정보가 없습니다.",
      error: "나이스 급식 정보를 불러오지 못했습니다.",
    }[result.status]}</Availability>
  </>;
  return <MealSelector key={today} meals={result.value} today={today} ends={mealEnds} initialMinutes={koreanMealMinutes(new Date())} />;
}

export function SchoolHomePublicData({ school, today, unavailable, mealEnds = {} }: {
  school?: Row<"schools"> | null;
  today: string;
  unavailable?: boolean;
  mealEnds?: MealEndTimes;
}) {
  return <>
    <PublicWidget kind="weather">
      <Suspense fallback={<Availability>학교 날씨를 불러오는 중…</Availability>}>
        <WeatherSummary school={school} unavailable={unavailable} />
      </Suspense>
    </PublicWidget>
    <PublicWidget kind="meal">
      <Suspense fallback={<Availability>급식 정보를 불러오는 중…</Availability>}>
        <MealSummary school={school} today={today} unavailable={unavailable} mealEnds={mealEnds} />
      </Suspense>
    </PublicWidget>
  </>;
}

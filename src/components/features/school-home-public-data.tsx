import { Suspense, type ReactNode } from "react";
import { CloudSun, Sun, Cloud, CloudRain, CloudSnow, CloudSunRain, CircleHelp, Utensils } from "lucide-react";
import { dateLabel } from "@/lib/domain";
import { getSchoolMeals } from "@/lib/neis";
import { getSchoolWeather } from "@/lib/school-weather";
import type { Row } from "@/lib/models";
import { koreanMealMinutes, type MealEndTimes } from "@/lib/school-meal-selection";
import { MealSelector } from "./meal-selector";
import "./school-extras.css";

function PublicWidget({ kind, children, address }: { kind: "weather" | "meal"; children: ReactNode; address?: string }) {
  const [Icon, title] = kind === "weather" ? [CloudSun, "날씨"] as const : [Utensils, "오늘의 급식"] as const;
  return <section className="personal-widget school-public-widget">
    <header className={`personal-day-heading${kind === "weather" ? " weather-widget-heading" : ""}`}><h2><Icon aria-hidden="true" />{title}</h2>{address && <span className="weather-heading-address" title={address}>{address}</span>}</header>
    {children}
  </section>;
}

function Availability({ children }: { children: ReactNode }) {
  return <p className="personal-widget-note" role="status">{children}</p>;
}

function WeatherIcon({ condition }: { condition: string | null }) {
  const Icon = !condition ? CircleHelp : /눈/.test(condition) ? CloudSnow : /비|소나기|빗방울/.test(condition) ? CloudRain : condition === "맑음" ? Sun : condition === "구름 많음" ? CloudSun : condition === "흐림" ? Cloud : CloudSunRain;
  return <Icon className={condition === "맑음" ? "weather-icon sunny" : "weather-icon"} role="img" aria-label={condition ?? "예보 없음"} />;
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
    <div className="school-weather-now school-weather-overview">
      <div><strong title={weather.observedAt ? `${weather.observedAt} 관측` : "관측 기온 확인 불가"}>{weather.temperature === null ? "—" : `${weather.temperature}°`}</strong></div>
      <div className="school-weather-status">
        <WeatherIcon condition={weather.condition} />
        <b title={weather.forecastHour ? `${weather.forecastHour} 날씨 예보` : undefined}>{weather.condition ?? "날씨 확인 불가"}</b>
        <small>최고 {weather.high === null ? "—" : `${weather.high}°`} · 최저 {weather.low === null ? "—" : `${weather.low}°`}</small>
      </div>
    </div>
    <div className="school-hourly-weather" aria-label="앞으로 6시간 날씨 예보">
      {weather.hourly.map((hour) => <div key={hour.date + hour.hour} className="school-hourly-item">
        <span>{Number(hour.hour)}시</span>
        <WeatherIcon condition={hour.condition} />
        <b>{hour.temperature === null ? "—" : `${hour.temperature}°`}</b>
        <small>{hour.precipitation === null ? "—" : `${hour.precipitation}%`}</small>
      </div>)}
    </div>
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
    <PublicWidget kind="weather" address={school?.weather_location_address || (school?.weather_nx != null && school?.weather_ny != null ? "기존 설정 위치" : undefined)}>
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

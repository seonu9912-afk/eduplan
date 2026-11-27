import "server-only";
import { unstable_cache } from "next/cache";
import { readKmaForecast, weatherApiConfigured, type KmaItem } from "./public-data";
import { weatherGrid } from "./external-links";
import type { PublicDataResult, SchoolWeather } from "./school-public-data-model";

const dateCode = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");
const hourCode = (hour: number) => String(hour).padStart(2, "0") + "00";
const forecastHours = [2, 5, 8, 11, 14, 17, 20, 23];

export function weatherReleaseTimes(now: Date) {
  const seoul = new Date(now.getTime() + 9 * 3600000);
  const hour = seoul.getUTCHours(), minute = seoul.getUTCMinutes(), day = dateCode(seoul);
  const observation = new Date(seoul.getTime() - 10 * 60000);
  const forecast = new Date(seoul.getTime() - 15 * 60000);
  let latest = forecastHours.findLast((value) => value <= forecast.getUTCHours());
  if (latest === undefined) {
    forecast.setUTCDate(forecast.getUTCDate() - 1);
    latest = 23;
  }
  const forecastDay = dateCode(forecast);
  return {
    day, time: hourCode(hour), forecastDay, forecastTime: hourCode(latest),
    observationDay: dateCode(observation), observationTime: hourCode(observation.getUTCHours()),
    useDailyForecast: hour >= 5 && (hour > 5 || minute >= 15),
  };
}

function validNumber(value: unknown, min: number, max: number): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

const precipitationConditions: Record<string, string> = {
  "1": "비", "2": "비·눈", "3": "눈", "4": "소나기", "5": "빗방울", "6": "빗방울·눈날림", "7": "눈날림",
};
const skyConditions: Record<string, string> = { "1": "맑음", "3": "구름 많음", "4": "흐림" };

export function summarizeSchoolWeather(
  forecast: KmaItem[], observation: KmaItem[], daily: KmaItem[],
  timing: ReturnType<typeof weatherReleaseTimes>,
): SchoolWeather {
  const nextHour = forecast.filter((item) => item.fcstDate === timing.day && typeof item.fcstTime === "string" && item.fcstTime >= timing.time)
    .map((item) => item.fcstTime!).sort()[0];
  const hourly = (name: string) => forecast.find((item) =>
    item.category === name && item.fcstDate === timing.day && item.fcstTime === nextHour)?.fcstValue ?? "";
  const dailyTemperature = (name: string) => {
    for (const item of [...forecast, ...daily]) {
      if (item.category !== name || item.fcstDate !== timing.day) continue;
      const value = validNumber(item.fcstValue, -65, 65);
      if (value !== null) return value;
    }
    return null;
  };
  const observed = (name: string) => observation.find((item) => item.category === name)?.obsrValue ?? "";
  const temperature = validNumber(observed("T1H"), -65, 65);
  const observationCondition = precipitationConditions[observed("PTY")];
  const condition = observationCondition || precipitationConditions[hourly("PTY")] || skyConditions[hourly("SKY")] || null;
  return {
    temperature, condition,
    observedAt: temperature !== null
      ? `${timing.observationDay === timing.day ? "" : "어제 "}${timing.observationTime.slice(0, 2)}:00` : null,
    forecastHour: nextHour && condition && !observationCondition ? nextHour.slice(0, 2) + ":00" : null,
    low: dailyTemperature("TMN"), high: dailyTemperature("TMX"),
    precipitation: validNumber(hourly("POP"), 0, 100),
  };
}

const readRelease = unstable_cache(async (kind: "observed" | "forecast", nx: number, ny: number, date: string, time: string) => {
  const path = kind === "observed" ? "getUltraSrtNcst" : "getVilageFcst";
  const result = await readKmaForecast("기상청", `VilageFcstInfoService_2.0/${path}`, {
    base_date: date, base_time: time, nx: String(nx), ny: String(ny),
    numOfRows: kind === "observed" ? "20" : "1000",
  }, false);
  if (!result.ok || !result.items.length) throw Error("기상청 자료를 확인할 수 없습니다.");
  return (result.items as KmaItem[]).filter((item) => item && typeof item.category === "string");
}, ["school-kma-release-v1"], { revalidate: 86400 });

export async function getSchoolWeather(school: unknown, now = new Date()): Promise<PublicDataResult<SchoolWeather>> {
  const grid = weatherGrid.safeParse(school);
  if (!grid.success) return { status: "unlinked" };
  if (!weatherApiConfigured()) return { status: "unconfigured" };
  const timing = weatherReleaseTimes(now);
  const { weather_nx: x, weather_ny: y } = grid.data;
  const [forecast, observation, daily] = await Promise.allSettled([
    readRelease("forecast", x, y, timing.forecastDay, timing.forecastTime),
    readRelease("observed", x, y, timing.observationDay, timing.observationTime),
    timing.useDailyForecast ? readRelease("forecast", x, y, timing.day, "0200") : Promise.resolve([]),
  ]);
  const data = summarizeSchoolWeather(
    forecast.status === "fulfilled" ? forecast.value : [],
    observation.status === "fulfilled" ? observation.value : [],
    daily.status === "fulfilled" ? daily.value : [], timing,
  );
  return [data.temperature, data.condition, data.low, data.high, data.precipitation].some((value) => value !== null)
    ? { status: "available", value: data }
    : { status: forecast.status === "rejected" || observation.status === "rejected" ? "error" : "missing" };
}

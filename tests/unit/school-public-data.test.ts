import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (work: unknown) => work }));

import { externalUrl, readableResources } from "../../src/lib/external-links";
import { findNeisSchools, getSchoolMeals, matchesNeisSchoolLevel, parseNeisMeals } from "../../src/lib/neis";
import { getSchoolWeather, weatherReleaseTimes, summarizeSchoolWeather } from "../../src/lib/school-weather";
import { schoolLocationKey, villageForecastGrid } from "../../src/lib/school-location";
import schoolIndex from "../../src/lib/data/school-weather-grid.json";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("school external resources", () => {
  it("supports web addresses with Korean text while rejecting credential and alternate protocols", () => {
    expect(externalUrl.parse("  https://example.com/업무?날짜=오늘  ")).toBe("https://example.com/업무?날짜=오늘");
    for (const url of ["javascript:alert(1)", "data:text/html,body", "//example.com", "https://user:password@example.com",
      "https://@example.com", "http:///example.com", "https://example.com\\@local.example", "https://exa\tmple.com"]) {
      expect(externalUrl.safeParse(url).success, url).toBe(false);
    }
    expect(readableResources([{ name: "자료", url: "data:text/plain,hi" }])).toEqual([]);
  });
});

const codes = { neis_office_code: "B10", neis_school_code: "7010083" };
const grid = { weather_nx: 61, weather_ny: 125 };
const date = "2026-11-27";
const mealRow = { MLSV_YMD: "20261127", MMEAL_SC_CODE: "2", MMEAL_SC_NM: "중식", DDISH_NM: "밥<br/>된장국 (5.6)<BR />과일" };

describe("school public data", () => {
  it("includes alternative schools for the matching curriculum level without dropping ordinary schools", async () => {
    vi.stubEnv("NEIS_API_KEY", "example-key");
    const schools = [
      ["C10", "7201238", "각종학교(중)", "부산광역시"],
      ["B10", "7081499", "중학교", "서울특별시"],
      ["C10", "7209999", "각종학교(고)", "부산광역시"],
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ schoolInfo: [
      { head: [{ RESULT: { CODE: "INFO-000" } }] },
      { row: schools.map(([office, code, type, region]) => ({
        ATPT_OFCDC_SC_CODE: office, SD_SCHUL_CODE: code, SCHUL_KND_SC_NM: type,
        SCHUL_NM: "송정중학교", LCTN_SC_NM: region,
      })) },
    ] })));
    expect((await findNeisSchools("송정중학교", "중학교")).map(({ neis_school_code }) => neis_school_code))
      .toEqual(["7201238", "7081499"]);
    expect(matchesNeisSchoolLevel("각종학교(초)", "초등학교")).toBe(true);
    expect(matchesNeisSchoolLevel("각종학교(고)", "고등학교")).toBe(true);
    expect(matchesNeisSchoolLevel("각종학교", "중학교")).toBe(true);
    expect(matchesNeisSchoolLevel("각종학교(고)", "중학교")).toBe(false);
  });

  it("uses the school and Korean date and distinguishes no published meals from provider errors", async () => {
    expect(await getSchoolMeals({}, date)).toEqual({ status: "unlinked" });
    vi.stubEnv("NEIS_API_KEY", "");
    expect(await getSchoolMeals(codes, date)).toEqual({ status: "unconfigured" });
    vi.stubEnv("NEIS_API_KEY", "example-key");
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ RESULT: { CODE: "INFO-200" } }))
      .mockResolvedValueOnce(Response.json({ RESULT: { CODE: "ERROR-290" } }))
      .mockResolvedValueOnce(Response.json({ mealServiceDietInfo: [{ head: [{ RESULT: { CODE: "INFO-000" } }] }, { row: [mealRow] }] }));
    vi.stubGlobal("fetch", fetch);
    expect(await getSchoolMeals(codes, date)).toEqual({ status: "missing" });
    expect(await getSchoolMeals(codes, date)).toEqual({ status: "error" });
    expect(await getSchoolMeals(codes, date)).toEqual({
      status: "available", value: [{ code: "2", name: "중식", dishes: ["밥", "된장국 (5.6)", "과일"] }],
    });
    const url = fetch.mock.calls[0][0] as URL;
    expect(url.searchParams.get("ATPT_OFCDC_SC_CODE")).toBe("B10");
    expect(url.searchParams.get("SD_SCHUL_CODE")).toBe("7010083");
    expect(url.searchParams.get("MLSV_YMD")).toBe("20261127");
    expect(() => parseNeisMeals([mealRow], "2026-11-28")).toThrow();
  });

  it("uses the school grid and combines recent observations and same-day forecast fields", async () => {
    const now = new Date("2026-11-27T05:20:00Z");
    const timing = weatherReleaseTimes(now);
    const forecast = [
      { category: "PTY", fcstDate: "20261127", fcstTime: "1600", fcstValue: "0" },
      { category: "SKY", fcstDate: "20261127", fcstTime: "1600", fcstValue: "3" },
      { category: "POP", fcstDate: "20261127", fcstTime: "1600", fcstValue: "0" },
      { category: "TMX", fcstDate: "20261127", fcstTime: "1500", fcstValue: "11" },
      { category: "TMX", fcstDate: "20261128", fcstTime: "1500", fcstValue: "30" },
    ];
    const daily = [
      { category: "TMN", fcstDate: "20261127", fcstTime: "0600", fcstValue: "-1" },
      { category: "TMX", fcstDate: "20261127", fcstTime: "1500", fcstValue: "11" },
    ];
    const observation = [{ category: "T1H", obsrValue: "9.5" }];
    expect(summarizeSchoolWeather(forecast, [], daily, timing)).toMatchObject({
      temperature: null, condition: "구름 많음", forecastHour: "16:00", low: -1, high: 11, precipitation: 0,
    });
    vi.stubEnv("WEATHER_API_KEY", "");
    vi.stubEnv("HOLIDAY_API_KEY", "portal-key");
    const fetch = vi.fn((url: URL) => {
      const items = url.pathname.endsWith("getUltraSrtNcst")
        ? observation : url.searchParams.get("base_time") === "0200" ? daily : forecast;
      return Promise.resolve(Response.json({ response: { header: { resultCode: "00" }, body: { items: { item: items } } } }));
    });
    vi.stubGlobal("fetch", fetch);
    expect(await getSchoolWeather({}, now)).toEqual({ status: "unlinked" });
    expect(await getSchoolWeather(grid, now)).toMatchObject({ status: "available", value: { temperature: 9.5, observedAt: "14:00" } });
    for (const [url] of fetch.mock.calls) {
      expect(url.searchParams.get("nx")).toBe("61");
      expect(url.searchParams.get("ny")).toBe("125");
      expect(url.searchParams.get("serviceKey")).toBe("portal-key");
    }
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(weatherReleaseTimes(new Date("2026-11-26T15:05:00Z"))).toMatchObject({
      day: "20261127", forecastDay: "20261126", forecastTime: "2300", observationDay: "20261126", observationTime: "2300",
    });
  });

  it("matches the official location index by school name and road address", () => {
    const index: Record<string, number> = schoolIndex.schools;
    expect(index[schoolLocationKey("서울고등학교", "서울특별시 서초구 효령로 197")]).toBeGreaterThan(0);
    expect(index[schoolLocationKey("서울고등학교", "서울특별시 서초구 효령로 9999")]).toBeUndefined();
    expect(villageForecastGrid(37.5665, 126.978)).toEqual({ weather_nx: 60, weather_ny: 127 });
    expect(villageForecastGrid(0, 0)).toBeNull();
  });
});

it("provides six hourly forecasts across midnight without inventing missing values", () => {
  const timing = weatherReleaseTimes(new Date("2026-11-27T14:30:00Z"));
  const result = summarizeSchoolWeather([
    { category: "TMP", fcstDate: "20261128", fcstTime: "0000", fcstValue: "4" },
    { category: "SKY", fcstDate: "20261128", fcstTime: "0000", fcstValue: "1" },
    { category: "POP", fcstDate: "20261128", fcstTime: "0000", fcstValue: "0" },
  ], [], [], timing);
  expect(result.hourly).toHaveLength(6);
  expect(result.hourly[0]).toEqual({ date: "20261128", hour: "00", temperature: 4, condition: "맑음", precipitation: 0 });
  expect(result.hourly[1]).toMatchObject({ hour: "01", temperature: null, condition: null, precipitation: null });
});

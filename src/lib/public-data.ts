import "server-only";
import { parseHolidayXML } from "./public-data-parse";
export type HolidayResult = {
  ok: boolean;
  http: number;
  resultCode: string;
  resultMsg: string;
  returnReasonCode: string;
  url: string;
  raw: string;
  days: Record<string, string>;
};
function tag(xml: string, name: string) {
  return name === "returnReasonCode"
    ? parseHolidayXML(xml).returnReasonCode
    : "";
}
export async function getHolidays(year: number): Promise<HolidayResult> {
  const key = process.env.HOLIDAY_API_KEY;
  if (!key) throw new Error("공휴일 인증키 설정이 필요합니다.");
  const url = new URL(
    "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo",
  );
  url.search = new URLSearchParams({
    ServiceKey: key,
    pageNo: "1",
    numOfRows: "100",
    solYear: String(year),
  }).toString();
  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(15000),
    });
    const raw = (await response.text())
      .replaceAll(key, "[REDACTED]")
      .slice(0, 30000);
    const { resultCode, resultMsg, returnReasonCode, parsed, days } =
      parseHolidayXML(raw);
    return {
      ok:
        response.ok &&
        resultCode === "00" &&
        parsed &&
        Object.keys(days).length > 0,
      http: response.status,
      resultCode,
      resultMsg,
      returnReasonCode,
      url: url.toString().replaceAll(key, "[REDACTED]"),
      raw,
      days,
    };
  } catch {
    throw new Error(
      "공휴일 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
}
export async function getForecast(
  nx: number,
  ny: number,
  landCode: string,
  tempCode: string,
  includeMedium = true,
) {
  if (!weatherApiConfigured()) throw new Error("기상청 인증키 설정이 필요합니다.");
  const now = new Date(Date.now() + 9 * 3600000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
  const hour = now.getUTCHours();
  const bases = [2, 5, 8, 11, 14, 17, 20, 23].filter((h) => h < hour);
  let base = bases.at(-1);
  const date = new Date(now);
  if (base === undefined) {
    date.setUTCDate(date.getUTCDate() - 1);
    base = 23;
  }
  const midDate = new Date(now);
  if (hour < 6) midDate.setUTCDate(midDate.getUTCDate() - 1);
  const midHour = hour >= 18 ? "1800" : hour >= 6 ? "0600" : "1800";
  const requests = [
    [
      "단기예보",
      "VilageFcstInfoService_2.0/getVilageFcst",
      {
        base_date: ymd(date),
        base_time: String(base).padStart(2, "0") + "00",
        nx: String(nx),
        ny: String(ny),
        numOfRows: "1000",
      },
    ],
    [
      "중기 육상예보",
      "MidFcstInfoService/getMidLandFcst",
      { regId: landCode, tmFc: ymd(midDate) + midHour, numOfRows: "10" },
    ],
    [
      "중기 기온예보",
      "MidFcstInfoService/getMidTa",
      { regId: tempCode, tmFc: ymd(midDate) + midHour, numOfRows: "10" },
    ],
  ] as const;
  return Promise.all((includeMedium ? requests : requests.slice(0, 1))
    .map(([name, path, params]) => readKmaForecast(name, path, params)));
}

export function weatherApiConfigured() {
  return Boolean(process.env.WEATHER_API_KEY || process.env.HOLIDAY_API_KEY);
}

export type KmaItem = {
  category: string;
  fcstDate?: string;
  fcstTime?: string;
  fcstValue?: string;
  obsrValue?: string;
};

export async function readKmaForecast(name: string, path: string, params: Record<string, string>, cache = true) {
  const key = process.env.WEATHER_API_KEY || process.env.HOLIDAY_API_KEY;
  if (!key) throw Error("기상청 인증키 설정이 필요합니다.");
  const url = new URL("https://apis.data.go.kr/1360000/" + path);
  url.search = new URLSearchParams({
    serviceKey: key,
    pageNo: "1",
    dataType: "JSON",
    ...params,
  }).toString();
  try {
    const res = await fetch(url, {
      ...(cache ? { next: { revalidate: 1800 } } : { cache: "no-store" }),
      signal: AbortSignal.timeout(cache ? 15000 : 5500),
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      const code = tag(raw, "returnReasonCode");
      return {
        name, ok: false,
        message: `HTTP ${res.status} · ${/^\d{1,4}$/.test(code) ? code : "응답 형식 오류"}`,
        items: [],
      };
    }
    const status = data.response?.header?.resultCode ??
      data.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
    const ok = res.ok && status === "00";
    const items = data.response?.body?.items?.item;
    return {
      name, ok,
      message: ok ? "00 · 정상" : `${/^\d{1,4}$/.test(status) ? status : res.status} · 응답 오류`,
      items: Array.isArray(items) ? items : [],
    };
  } catch {
    return { name, ok: false, message: "서비스 연결 실패", items: [] };
  }
}

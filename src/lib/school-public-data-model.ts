export type PublicDataResult<T> =
  | { status: "available"; value: T }
  | { status: "unlinked" | "unconfigured" | "missing" | "error" };

export type NeisSchool = {
  neis_office_code: string;
  neis_school_code: string;
  name: string;
  type: string;
  region: string;
  road_address: string | null;
  homepage_url: string | null;
  foundation_day: string | null;
};

export type SchoolMeal = { code: string; name: string; dishes: string[] };
export type SchoolWeather = {
  temperature: number | null;
  condition: string | null;
  forecastHour: string | null;
  observedAt: string | null;
  low: number | null;
  high: number | null;
  precipitation: number | null;
};

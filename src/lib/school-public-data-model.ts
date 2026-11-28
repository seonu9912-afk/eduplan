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
export type HourlySchoolWeather = { date: string; hour: string; temperature: number | null; condition: string | null; precipitation: number | null };
export type SchoolWeather = {
  hourly: HourlySchoolWeather[];
  temperature: number | null;
  condition: string | null;
  forecastHour: string | null;
  observedAt: string | null;
  low: number | null;
  high: number | null;
  precipitation: number | null;
};

export type WeatherLocationCandidate = { name:string; address:string; selection: {source:"location";schoolId:string;address:string} | {source:"neis";neis_office_code:string;neis_school_code:string} };

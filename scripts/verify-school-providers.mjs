// One-off deployment check. Only provider readiness and field presence reach build logs.
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
      import { getSchoolMeals, readNeisSchool } from "./src/lib/neis";
      import { schoolLocationKey } from "./src/lib/school-location";
      import { getSchoolWeather, weatherReleaseTimes } from "./src/lib/school-weather";
      import { readKmaForecast, weatherApiConfigured } from "./src/lib/public-data";
      import { seoulToday } from "./src/lib/domain";
      import index from "./src/lib/data/school-weather-grid.json";
      export async function check() {
        const office = "B10", code = "7010083", today = seoulToday();
        const info = await readNeisSchool(office, code).catch(() => null);
        const packed = index.schools[schoolLocationKey("서울고등학교", "서울특별시 서초구 효령로 197")];
        const grid = { weather_nx: Math.floor(packed / 256), weather_ny: packed % 256 };
        const [meal, weather] = await Promise.all([
          getSchoolMeals({ neis_office_code: office, neis_school_code: code }, today),
          getSchoolWeather(grid),
        ]);
        const fields = weather.status === "available" ? weather.value : null;
        const metadata = {
          schoolInfo: !!info, meal: meal.status,
          mealTypes: meal.status === "available" ? meal.value.map((row) => row.code) : [],
          weather: weather.status,
          observed: fields?.temperature != null, lowest: fields?.low != null, highest: fields?.high != null,
          condition: fields?.condition != null, precipitation: fields?.precipitation != null,
        };
        if (weatherApiConfigured() && weather.status !== "available") {
          const timing = weatherReleaseTimes(new Date());
          const forecast = await readKmaForecast("기상청","VilageFcstInfoService_2.0/getVilageFcst",{
            base_date: timing.forecastDay, base_time: timing.forecastTime,
            nx: String(grid.weather_nx),ny: String(grid.weather_ny),numOfRows:"10",
          },false);
          return { ...metadata, kmaStatus: forecast.message };
        }
        return metadata;
      }
    `,
  },
  bundle: true, write: false, format: "esm", platform: "node", target: "node24", logLevel: "silent",
  plugins: [{
    name: "verify-outside-next",
    setup(plugin) {
      plugin.onResolve({ filter: /^(server-only|next\/cache)$/ }, (args) => ({ path: args.path, namespace: "next-runtime" }));
      plugin.onLoad({ filter: /.*/, namespace: "next-runtime" }, ({ path }) => ({
        contents: path === "next/cache" ? "export const unstable_cache = (fn) => fn;" : "",
      }));
    },
  }],
});

const moduleUrl = "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64");
try {
  const { check } = await import(moduleUrl);
  console.log("EduPlan provider verification", JSON.stringify(await check()));
} catch {
  console.log("EduPlan provider verification could not complete");
}

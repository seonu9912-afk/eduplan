// Pass the JSON exported by the public data portal or its individual download pages.
import { readFileSync, writeFileSync } from "node:fs";
import { schoolLocationKey, villageForecastGrid } from "../src/lib/school-location.ts";

const inputs = process.argv.slice(2);
if (!inputs.length) throw new Error("Provide 전국초중등학교위치표준데이터 JSON files.");
const records = inputs.flatMap((path) => {
  const data = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(data) ? data : data.records;
});
const grids = new Map();
for (const row of records) {
  const name = row.SCHOOL_NM ?? row["학교명"];
  const address = row.RDNMADR ?? row["소재지도로명주소"];
  const grid = villageForecastGrid(Number(row.LATITUDE ?? row["위도"]), Number(row.LONGITUDE ?? row["경도"]));
  if (typeof name !== "string" || !name.trim() || typeof address !== "string" || !address.trim() || !grid) continue;
  const key = schoolLocationKey(name, address);
  const value = grid.weather_nx * 256 + grid.weather_ny;
  if (!grids.has(key)) grids.set(key, value);
  else if (grids.get(key) !== value) grids.set(key, null);
}
const entries = [...grids].filter(([, value]) => value !== null).sort(([a], [b]) => a.localeCompare(b));
if (!entries.length) throw new Error("No valid school coordinate records.");
const source = "https://www.data.go.kr/data/15021148/standard.do";
const date = records.map((row) => row.REFERENCE_DATE ?? row["데이터기준일자"]).filter(Boolean).sort().at(-1);
writeFileSync(new URL("../src/lib/data/school-weather-grid.json", import.meta.url),
  JSON.stringify({ source, date, schools: Object.fromEntries(entries) }) + "\n");
console.log(`${entries.length} school grids generated from ${source}`);

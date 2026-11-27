import { createHash } from "node:crypto";

export function schoolLocationKey(name: string, address: string) {
  const road = address.normalize("NFC").trim()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/^강원(?:특별자치도|도)\s+/, "강원 ")
    .replace(/^전북특별자치도\s+|^전라북도\s+/, "전북 ")
    .replace(/^제주(?:특별자치도|도)\s+/, "제주 ");
  return createHash("sha256").update([
    name.normalize("NFC").replace(/\s+/g, ""),
    road.replace(/\s+/g, ""),
  ].join("\n")).digest("hex").slice(0, 16);
}

// 기상청 동네예보 격자 변환 (Lambert conformal conic).
export function villageForecastGrid(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < 32 || latitude > 39 || longitude < 123 || longitude > 133) return null;
  const rad = Math.PI / 180;
  const cone = (angle: number) => Math.tan(Math.PI / 4 + angle * rad / 2);
  const n = Math.log(Math.cos(30 * rad) / Math.cos(60 * rad)) / Math.log(cone(60) / cone(30));
  const scale = (6371.00877 / 5) * Math.pow(cone(30), n) * Math.cos(30 * rad) / n;
  const radius = scale / Math.pow(cone(latitude), n);
  const theta = (longitude - 126) * rad * n;
  const weather_nx = Math.round(radius * Math.sin(theta) + 43);
  const weather_ny = Math.round(scale / Math.pow(cone(38), n) - radius * Math.cos(theta) + 136);
  return weather_nx >= 1 && weather_nx <= 149 && weather_ny >= 1 && weather_ny <= 253
    ? { weather_nx, weather_ny } : null;
}

import {afterEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({unstable_cache:(work:unknown)=>work}));
import {airRegion,dustGrade,recentMeasurements,selectAirQuality,getSchoolAirQuality} from "../../src/lib/school-air-quality";
import {villageForecastGrid} from "../../src/lib/school-location";
import type {Row} from "../../src/lib/models";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const now=new Date("2026-11-28T06:30:00Z"),at="2026-11-28 15:00";
const row=(stationName:string,pm10Value:string,pm25Value:string,dataTime=at)=>({stationName,pm10Value,pm25Value,dataTime});
it("maps Korean addresses and official concentration bands",()=>{
 expect(airRegion("전북특별자치도 전주시")).toBe("전북");
 expect(airRegion("부산광역시 강서구")).toBe("부산");
 expect(airRegion("알 수 없는 위치")).toBeNull();
 expect([30,31,80,81,150,151].map(n=>dustGrade("pm10",n))).toEqual(["좋음","보통","보통","나쁨","나쁨","매우 나쁨"]);
 expect([15,16,35,36,75,76].map(n=>dustGrade("pm25",n))).toEqual(["좋음","보통","보통","나쁨","나쁨","매우 나쁨"]);
 expect(dustGrade("pm25",null)).toBe("정보 없음");
});
it("rejects stale or invalid data, selects a local station or labels a regional mean",()=>{
 const values=recentMeasurements([row("A","20","10"),row("B","40","20"),row("old","100","100","2026-11-28 09:00"),row("bad","-",""),{...row("flag","70","30"),pm10Flag:"점검"}],now);
 expect(values.find(v=>v.name==="flag")?.pm10).toBeNull();
 expect(values).toHaveLength(3);
 const grid=villageForecastGrid(35.1,129)!;
 expect(selectAirQuality(values,[{name:"A",grid,distance:1}],"부산")).toMatchObject({scope:"station",pm10:20,pm25:10});
 expect(selectAirQuality(values,[],"부산")).toMatchObject({scope:"region",label:"부산 측정소 평균",pm10:30,pm25:20});
});
it("uses regional API when station metadata is unavailable and never guesses a legacy location",async()=>{
 vi.stubEnv("AIRKOREA_API_KEY","test-key");
 const fetch=vi.fn((url:URL)=>Promise.resolve(url.pathname.includes("getMsrstnList")?Response.json({response:{header:{resultCode:"30"}}}):Response.json({response:{header:{resultCode:"00"},body:{totalCount:1,items:[row("A","20","10")]}}})));
 vi.stubGlobal("fetch",fetch);
 const school={weather_location_address:"부산광역시 강서구",weather_nx:98,weather_ny:76} as Row<"schools">;
 expect(await getSchoolAirQuality({...school,weather_location_address:null},now)).toEqual({status:"unlinked"});
 expect(await getSchoolAirQuality(school,now)).toMatchObject({status:"available",value:{scope:"region",pm10:20}});
 expect(fetch.mock.calls.find(([u])=>u.pathname.includes("getCtprvn"))?.[0].searchParams.get("sidoName")).toBe("부산");
});

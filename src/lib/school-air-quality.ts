import "server-only";
import {unstable_cache} from "next/cache";
import {villageForecastGrid} from "./school-location";
import type {PublicDataResult,SchoolAirQuality} from "./school-public-data-model";
import type {Row} from "./models";
type Grid=NonNullable<ReturnType<typeof villageForecastGrid>>;
type Measurement={name:string;at:string;pm10:number|null;pm25:number|null};
type Station={name:string;grid:Grid;distance:number};
const regionNames:Record<string,string>={"서울특별시":"서울","서울":"서울","부산광역시":"부산","부산":"부산","대구광역시":"대구","대구":"대구","인천광역시":"인천","인천":"인천","광주광역시":"광주","광주":"광주","대전광역시":"대전","대전":"대전","울산광역시":"울산","울산":"울산","세종특별자치시":"세종","세종":"세종","경기도":"경기","경기":"경기","강원특별자치도":"강원","강원도":"강원","강원":"강원","충청북도":"충북","충북":"충북","충청남도":"충남","충남":"충남","전북특별자치도":"전북","전라북도":"전북","전북":"전북","전라남도":"전남","전남":"전남","경상북도":"경북","경북":"경북","경상남도":"경남","경남":"경남","제주특별자치도":"제주","제주도":"제주","제주":"제주"};
export function airRegion(address:string){const first=address.trim().split(/\s+/)[0];return Object.hasOwn(regionNames,first)?regionNames[first]:null;}
export function dustGrade(kind:"pm10"|"pm25",value:number|null){
 if(value===null||!Number.isFinite(value)||value<0)return "정보 없음";
 const thresholds=kind==="pm10"?[30,80,150]:[15,35,75];
 return value<=thresholds[0]?"좋음":value<=thresholds[1]?"보통":value<=thresholds[2]?"나쁨":"매우 나쁨";
}
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
function number(v:unknown){if(typeof v!=="number"&&(typeof v!=="string"||!v.trim()))return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;}
function rowsOf(value:unknown){
 const root=(value as {response?:{header?:{resultCode?:unknown};body?:{items?:unknown;totalCount?:unknown}}})?.response;
 if(String(root?.header?.resultCode)==="03")return {rows:[],total:0};
 if(String(root?.header?.resultCode)!=="00"&&String(root?.header?.resultCode)!=="0")throw Error("대기질 API 응답 오류");
 const items=root?.body?.items;
 if(!Array.isArray(items))throw Error("대기질 응답 형식 오류");
 const total=Number(root?.body?.totalCount??items.length);
 if(!Number.isSafeInteger(total)||total<items.length)throw Error("대기질 응답 건수 오류");
 return {rows:items.filter((v):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)),total};
}
function timestamp(at:string){
 if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(at))return NaN;
 // AirKorea may report the final hour of a day as 24:00.
 return Date.parse(at.replace(" ","T")+":00+09:00");
}
export function recentMeasurements(rows:Record<string,unknown>[],now:Date):Measurement[]{
 const latest=new Map<string,Measurement>();
 for(const row of rows){
  const name=text(row.stationName),at=text(row.dataTime),time=timestamp(at);
  if(!name||!Number.isFinite(time)||now.getTime()-time>3*3600000||time-now.getTime()>5*60000)continue;
  const pm10=text(row.pm10Flag)?null:number(row.pm10Value),pm25=text(row.pm25Flag)?null:number(row.pm25Value);
  if(pm10===null&&pm25===null)continue;
  const old=latest.get(name);
  if(!old||timestamp(old.at)<time)latest.set(name,{name,at,pm10,pm25});
 }
 return [...latest.values()];
}
export function selectAirQuality(measurements:Measurement[],stations:Station[],region:string):SchoolAirQuality|null{
 // Only use a nearby urban station with current measurements. Grid distance is approximate (5km cells).
 const local=stations.filter(s=>s.distance<=3).sort((a,b)=>a.distance-b.distance||a.name.localeCompare(b.name,"ko")).map(s=>measurements.find(m=>m.name===s.name)).find(m=>m!==undefined&&m.pm10!==null&&m.pm25!==null);
 if(local)return {pm10:local.pm10,pm25:local.pm25,label:local.name+" 측정소",observedAt:local.at,scope:"station"};
 if(!measurements.length)return null;
 const latest=measurements.reduce((at,m)=>timestamp(m.at)>timestamp(at)?m.at:at,measurements[0].at);
 const same=measurements.filter(m=>m.at===latest);
 const average=(kind:"pm10"|"pm25")=>{const values=same.flatMap(m=>m[kind]===null?[]:[m[kind]!]);return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;};
 return {pm10:average("pm10"),pm25:average("pm25"),label:region+" 측정소 평균",observedAt:latest,scope:"region"};
}
const base="https://apis.data.go.kr/B552584/";
async function read(path:string,params:Record<string,string>,key:string){
 const url=new URL(base+path);url.search=new URLSearchParams({serviceKey:key,returnType:"json",pageNo:"1",numOfRows:"1000",...params}).toString();
 const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(4500)});
 if(!response.ok)throw Error("대기질 API 연결 오류");
 const {rows,total}=rowsOf(await response.json());
 if(total>rows.length)throw Error("대기질 자료가 불완전합니다.");
 return rows;
}
const readRegional=unstable_cache(async(region:string)=>{
 const key=process.env.AIRKOREA_API_KEY;if(!key)throw Error("대기질 인증키 없음");
 return read("ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty",{sidoName:region,ver:"1.0"},key);
},["school-air-regional-v1"],{revalidate:600});
const readStationLocations=unstable_cache(async(region:string)=>{
 const key=process.env.AIRKOREA_STATION_API_KEY||process.env.AIRKOREA_API_KEY;
 if(!key)return [];
 try{
  const rows=await read("MsrstnInfoInqireSvc/getMsrstnList",{addr:region},key);
  return rows.flatMap(row=>{
   const name=text(row.stationName),address=text(row.addr);
   // dmX is latitude, dmY is longitude in the station-list response.
   const lat=number(row.dmX),lon=number(row.dmY);
   const grid=lat===null||lon===null?null:villageForecastGrid(lat,lon);
   return name&&airRegion(address)===region&&text(row.mangName)==="도시대기"&&grid?[{name,grid}]:[];
  });
 }catch{return [];} // separate station metadata approval may be absent; cache this fallback for one hour.
},["school-air-stations-v1"],{revalidate:3600});
export async function getSchoolAirQuality(school?:Row<"schools">|null,now=new Date()):Promise<PublicDataResult<SchoolAirQuality>>{
 // Never infer a region from NEIS address when a manually selected weather location may differ.
 const address=school?.weather_location_address;
 const region=address?airRegion(address):null;
 if(!region||school?.weather_nx==null||school.weather_ny==null)return {status:"unlinked"};
 if(!process.env.AIRKOREA_API_KEY)return {status:"unconfigured"};
 try{
  const [rows,locations]=await Promise.all([readRegional(region),readStationLocations(region)]);
  const stations=locations.map(s=>({...s,distance:Math.hypot(s.grid.weather_nx-school.weather_nx!,s.grid.weather_ny-school.weather_ny!)}));
  const value=selectAirQuality(recentMeasurements(rows,now),stations,region);
  return value?{status:"available",value}:{status:"missing"};
 }catch{return {status:"error"};}
}

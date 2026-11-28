import "server-only";
import { unstable_cache } from "next/cache";
import { schoolLocationKey, villageForecastGrid } from "./school-location";
import { resolveSchoolWeatherLocation } from "./weather-location";
import type { NeisSchool } from "./school-public-data-model";

type Grid=NonNullable<ReturnType<typeof villageForecastGrid>>;
type SchoolLocation={id:string;name:string;address:string;grid:Grid};
const endpoint="https://api.data.go.kr/openapi/tn_pubr_public_elesch_mskul_lc_api";
const str=(value:unknown)=>typeof value==="string"?value.trim():"";
export function parseSchoolLocationResponse(value:unknown):{rows:SchoolLocation[];total:number}{
 const body=(value as {response?:{header?:{resultCode?:unknown};body?:{items?:unknown;totalCount?:unknown}}})?.response;
 const code=String(body?.header?.resultCode??"");
 if(code==="03")return {rows:[],total:0};
 if(code!=="00"&&code!=="0")throw Error("학교 위치 정보를 조회하지 못했습니다.");
 const result=body?.body;
 const items=result?.items;
 const list=Array.isArray(items)?items:items&&typeof items==="object"&&"item" in items?Array.isArray(items.item)?items.item:[items.item]:items===""||items==null?[]:null;
 if(!list)throw Error("학교 위치 응답 형식이 올바르지 않습니다.");
 const total=Number(result?.totalCount??list.length);
 if(!Number.isSafeInteger(total)||total<0||total<list.length||(!list.length&&total>0))throw Error("학교 위치 응답을 확인할 수 없습니다.");
 const rows:SchoolLocation[]=list.flatMap((entry:unknown)=>{
  if(!entry||typeof entry!=="object")return [];
  const row=entry as Record<string,unknown>;
  const id=str(row.schoolId),name=str(row.schoolNm),address=str(row.rdnmadr);
  const grid=villageForecastGrid(Number(row.latitude),Number(row.longitude));
  return /^[A-Za-z0-9_-]{1,40}$/.test(id)&&name&&address&&address.length<=240&&str(row.operSttus)==="운영"&&grid?[{id,name,address,grid}]:[];
 });
 return {rows,total};
}
const readRows=unstable_cache(async(field:"schoolNm"|"schoolId",value:string)=>{
 const key=process.env.SCHOOL_LOCATION_API_KEY;
 if(!key)throw Error("학교 위치 API가 설정되지 않았습니다.");
 const rows:SchoolLocation[]=[];
 for(let page=1;page<=5;page++){
  const url=new URL(endpoint);
  url.search=new URLSearchParams({serviceKey:key,type:"json",pageNo:String(page),numOfRows:"100",[field]:value}).toString();
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error("학교 위치 API에 연결하지 못했습니다.");
  const parsed=parseSchoolLocationResponse(await response.json());
  rows.push(...parsed.rows);
  if(page*100>=parsed.total)return rows;
 }
 throw Error("학교명 검색 범위가 너무 넓습니다. 학교명을 자세히 입력하세요.");
},["school-location-live-v1"],{revalidate:86400});
const normalized=(s:string)=>s.normalize("NFC").replace(/\s+/g,"");
export async function findLiveSchoolLocations(name:string,filter:string){
 const terms=filter.normalize("NFC").trim().split(/\s+/).filter(Boolean);
 const rows=await readRows("schoolNm",name.trim());
 return rows.filter(row=>normalized(row.name).includes(normalized(name))&&terms.every(term=>row.address.normalize("NFC").includes(term))).filter((row,i,all)=>all.findIndex(x=>x.id===row.id&&x.address===row.address)===i).slice(0,30);
}
function uniqueLocation(rows:SchoolLocation[]){
 if(!rows.length)return null;
 const first=rows[0];
 return rows.every(row=>row.grid.weather_nx===first.grid.weather_nx&&row.grid.weather_ny===first.grid.weather_ny)?first:null;
}
export async function readLiveSchoolLocation(id:string,address:string){
 const rows=await readRows("schoolId",id);
 return uniqueLocation(rows.filter(row=>row.id===id&&normalized(row.address)===normalized(address)));
}
export async function resolveLatestSchoolWeatherLocation(school:Pick<NeisSchool,"name"|"road_address">){
 if(!school.road_address)return null;
 try{
  const key=schoolLocationKey(school.name,school.road_address);
  const rows=(await readRows("schoolNm",school.name)).filter(row=>schoolLocationKey(row.name,row.address)===key);
  if(rows.length){
   const match=uniqueLocation(rows);
   return match?{...match.grid,weather_location_address:match.address}:null;
  }
 }catch{ /* Public API outage or missing key: preserve the verified offline school index. */ }
 return resolveSchoolWeatherLocation(school);
}

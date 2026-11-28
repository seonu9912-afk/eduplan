import "server-only";
import { unstable_cache } from "next/cache";
import { isoDate, schoolTypeSchema, type SchoolType } from "./domain";
import { externalUrl, neisSchoolCode } from "./external-links";
import type { NeisSchool, PublicDataResult, SchoolMeal } from "./school-public-data-model";

type NeisEndpoint = "schoolInfo" | "mealServiceDietInfo" | "classInfo";
const alternativeSchoolLevels: Record<string, SchoolType | undefined> = {
  "각종학교(초)": "초등학교",
  "각종학교(중)": "중학교",
  "각종학교(고)": "고등학교",
};

export function matchesNeisSchoolLevel(officialType: string, workspaceType: string) {
  if (officialType === "각종학교") return schoolTypeSchema.safeParse(workspaceType).success;
  return (alternativeSchoolLevels[officialType] ?? officialType) === workspaceType;
}

async function neisRows(endpoint: NeisEndpoint, query: Record<string, string>): Promise<Record<string, unknown>[]> {
  const key = process.env.NEIS_API_KEY;
  if (!key) throw Error("나이스 인증키 설정이 필요합니다.");
  const url = new URL(`https://open.neis.go.kr/hub/${endpoint}`);
  url.search = new URLSearchParams({ KEY: key, Type: "json", pIndex: "1", pSize: "30", ...query }).toString();
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error();
    const body = await response.json();
    const groups = body[endpoint];
    const code = body.RESULT?.CODE ?? groups?.find((group: { head?: unknown }) => group.head)?.head
      ?.find((entry: { RESULT?: unknown }) => entry.RESULT)?.RESULT?.CODE;
    if (code === "INFO-200") return [];
    const rows = groups?.find((group: { row?: unknown }) => group.row)?.row;
    if (code !== "INFO-000" || !Array.isArray(rows) ||
      rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw Error();
    if(endpoint==="classInfo"){
      const count=groups?.find((group:{head?:unknown})=>group.head)?.head?.find((entry:{list_total_count?:unknown})=>entry.list_total_count!=null)?.list_total_count;
      if(!Number.isSafeInteger(Number(count))||Number(count)!==rows.length)throw Error();
    }
    return rows;
  } catch {
    throw Error("나이스에서 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

function field(row: Record<string, unknown>, name: string) {
  return typeof row[name] === "string" ? row[name].trim() : "";
}

function schoolInfo(row: Record<string, unknown>): NeisSchool[] {
  const codes = neisSchoolCode.safeParse({
    neis_office_code: field(row, "ATPT_OFCDC_SC_CODE"),
    neis_school_code: field(row, "SD_SCHUL_CODE"),
  });
  const name = field(row, "SCHUL_NM"), type = field(row, "SCHUL_KND_SC_NM");
  if (!codes.success || !name || !type) return [];
  const homepage = field(row, "HMPG_ADRES");
  const url = externalUrl.safeParse(homepage && !homepage.includes("://") ? `https://${homepage}` : homepage);
  const founded = field(row, "FOND_YMD").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  const day = isoDate.safeParse(founded);
  return [{
    ...codes.data, name, type, region: field(row, "LCTN_SC_NM"),
    road_address: field(row, "ORG_RDNMA").slice(0, 240) || null,
    homepage_url: url.success ? url.data : null,
    foundation_day: day.success ? day.data : null,
  }];
}

export const findNeisSchools = unstable_cache(
  async (name: string, type: string) => (await neisRows("schoolInfo", { SCHUL_NM: name }))
    .flatMap(schoolInfo).filter((school) => matchesNeisSchoolLevel(school.type, type)),
  ["neis-school-search-v2"], { revalidate: 86400 },
);

export const findNeisLocationSchools = unstable_cache(
  async (name: string) => (await neisRows("schoolInfo", { SCHUL_NM: name, pSize: "100" })).flatMap(schoolInfo),
  ["neis-weather-school-search-v1"], { revalidate: 86400 },
);

export const readNeisSchool = unstable_cache(
  async (office: string, code: string) =>
    (await neisRows("schoolInfo", { ATPT_OFCDC_SC_CODE: office, SD_SCHUL_CODE: code }))
      .flatMap(schoolInfo).find((row) => row.neis_office_code === office && row.neis_school_code === code) ?? null,
  ["neis-school-details-v1"], { revalidate: 86400 },
);

export function parseNeisMeals(rows: Record<string, unknown>[], date: string): SchoolMeal[] {
  const day = date.replaceAll("-", "");
  if (rows.some((row) => field(row, "MLSV_YMD") !== day || !field(row, "MMEAL_SC_NM") ||
    !field(row, "MMEAL_SC_CODE") || !field(row, "DDISH_NM"))) throw Error("급식 응답을 확인할 수 없습니다.");
  return rows.map((row) => ({
    code: field(row, "MMEAL_SC_CODE"),
    name: field(row, "MMEAL_SC_NM"),
    dishes: field(row, "DDISH_NM").split(/<br\s*\/?\s*>|\r?\n/i).map((item) =>
      item.replaceAll("&amp;", "&").replaceAll("&nbsp;", " ").trim()).filter(Boolean),
  })).sort((a, b) => Number(a.code) - Number(b.code));
}

const readMeals = unstable_cache(
  async (office: string, code: string, date: string) =>
    parseNeisMeals(await neisRows("mealServiceDietInfo", {
      ATPT_OFCDC_SC_CODE: office, SD_SCHUL_CODE: code, MLSV_YMD: date.replaceAll("-", ""),
    }), date),
  ["neis-meals-v1"], { revalidate: 3600 },
);

export async function getSchoolMeals(school: unknown, date: string): Promise<PublicDataResult<SchoolMeal[]>> {
  const codes = neisSchoolCode.safeParse(school);
  if (!codes.success) return { status: "unlinked" };
  if (!process.env.NEIS_API_KEY) return { status: "unconfigured" };
  try {
    const items = await readMeals(codes.data.neis_office_code, codes.data.neis_school_code, date);
    return items.length ? { status: "available", value: items } : { status: "missing" };
  } catch {
    return { status: "error" };
  }
}

export type NeisClassPreview={schoolName:string;year:number;grades:{grade:number;count:number|null;names:string[]}[];excluded:number};
export function parseNeisClassPreview(rows:Record<string,unknown>[],office:string,code:string,year:number,grades:number[],schoolType:string):NeisClassPreview|null{
 if(!rows.length)return null;
 const names=new Map<number,Set<number>>(grades.map(g=>[g,new Set<number>()]));
 const identities=new Map<string,string>();
 let excluded=0;
 const schoolName=field(rows[0],"SCHUL_NM");
 if(!schoolName)throw Error("학교명을 확인할 수 없습니다.");
 for(const row of rows){
  if(field(row,"ATPT_OFCDC_SC_CODE")!==office||field(row,"SD_SCHUL_CODE")!==code||field(row,"AY")!==String(year)||field(row,"SCHUL_NM")!==schoolName)throw Error("나이스 자료의 학교 또는 학년도가 일치하지 않습니다.");
  const grade=Number(field(row,"GRADE")),className=field(row,"CLASS_NM"),course=field(row,"SCHUL_CRSE_SC_NM");
  const day=field(row,"DGHT_CRSE_SC_NM");
  if(!names.has(grade)||!/^[0-9]{1,2}$/.test(className)||Number(className)<1||Number(className)>30||course&&!matchesNeisSchoolLevel(course,schoolType)||day&&day!=="주간"){excluded++;continue;}
  const n=Number(className),key=grade+":"+n,identity=[course,day,field(row,"ORD_SC_NM"),field(row,"DDDEP_NM")].join("|");
  if(identities.has(key)&&identities.get(key)!==identity)throw Error("동일한 학급 번호가 여러 과정에 존재합니다. 학급 수를 직접 확인해 주세요.");
  identities.set(key,identity);names.get(grade)!.add(n);
 }
 const result=grades.map(grade=>{
  const sorted=[...names.get(grade)!].sort((a,b)=>a-b);
  return {grade,count:sorted.length&&sorted.every((n,i)=>n===i+1)?sorted.length:null,names:sorted.map(String)};
 });
 return {schoolName,year,grades:result,excluded};
}
export async function readNeisClassPreview(office:string,code:string,year:number,grades:number[],schoolType:string){
 const rows=await neisRows("classInfo",{ATPT_OFCDC_SC_CODE:office,SD_SCHUL_CODE:code,AY:String(year),pSize:"1000"});
 return parseNeisClassPreview(rows,office,code,year,grades,schoolType);
}

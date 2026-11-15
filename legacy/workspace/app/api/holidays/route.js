import {NextResponse} from 'next/server';
export const runtime='nodejs';
const YEAR_MIN=2025,YEAR_MAX=2032;
const fail=(message,status=502)=>NextResponse.json({ok:false,error:message},{status,headers:{'Cache-Control':'no-store'}});
const strip=(v)=>String(v||'').replace(/[\r\n<>]/g,'').slice(0,80);
const field=(xml,key)=>(xml.match(new RegExp(`<${key}>([\\s\\S]*?)<\\/${key}>`))||[])[1]||'';
const toItem=x=>{
  const raw=String(x.locdate||'');
  if(!/^\d{8}$/.test(raw))return null;
  return {date:`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`,name:String(x.dateName||'공휴일'),holiday:x.isHoliday!=='N'};
};
function parseHolidays(body){
  const text=body.trim();
  if(text.startsWith('{')){
    const data=JSON.parse(text);
    const response=data.response;
    const code=response?.header?.resultCode;
    if(code && !['00','0'].includes(String(code)))throw Error('공공데이터 API가 조회를 거절했습니다.');
    const row=response?.body?.items?.item||[];
    return (Array.isArray(row)?row:[row]).map(toItem).filter(Boolean);
  }
  if(!text.startsWith('<'))throw Error('공휴일 API 응답 형식을 확인할 수 없습니다.');
  const code=field(text,'resultCode');
  if(code&&!['00','0'].includes(code))throw Error('공공데이터 API 오류가 발생했습니다.');
  const items=[...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match=>({locdate:field(match[1],'locdate'),dateName:field(match[1],'dateName'),isHoliday:field(match[1],'isHoliday')}));
  return items.map(toItem).filter(Boolean);
}
export async function GET(request){
  const raw=new URL(request.url).searchParams.get('year');
  if(!/^\d{4}$/.test(raw||''))return fail('학년도를 확인해 주세요.',400);
  const year=Number(raw);
  if(year<YEAR_MIN||year>YEAR_MAX)return fail('지원하는 학년도 범위를 벗어났습니다.',400);
  const key=process.env.DATA_GO_KR_API_KEY;
  if(!key)return fail('공휴일 조회 서비스가 아직 설정되지 않았습니다.',503);
  try{
    const result=[];
    for(const y of [year,year+1]){
      const url=new URL('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo');
      url.searchParams.set('serviceKey',key);
      url.searchParams.set('solYear',String(y));
      url.searchParams.set('numOfRows','200');
      url.searchParams.set('pageNo','1');
      url.searchParams.set('_type','json');
      const response=await fetch(url,{next:{revalidate:43200},signal:AbortSignal.timeout(8500)});
      if(!response.ok)throw Error('공휴일 데이터 제공기관에 연결하지 못했습니다.');
      const body=await response.text();
      result.push(...parseHolidays(body));
    }
    const unique=[...new Map(result.filter(r=>r.holiday).map(x=>[x.date,x])).values()].sort((a,b)=>a.date.localeCompare(b.date));
    if(!unique.length)return fail('해당 연도 공휴일 정보가 아직 제공되지 않았습니다.');
    return NextResponse.json({ok:true,source:'한국천문연구원 특일 정보',year,holidays:unique,checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'public, s-maxage=900, stale-while-revalidate=3600'}});
  }catch(e){return fail(strip(e?.message)||'공휴일 조회 중 오류가 발생했습니다.');}
}

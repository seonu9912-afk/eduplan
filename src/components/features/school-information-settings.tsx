"use client";
import { useState, useTransition } from "react";
import { Search, ChevronDown, RefreshCw, ExternalLink, MapPin } from "lucide-react";
import { connectNeisSchool, setSchoolWeatherLocation, searchSchoolWeatherLocations, searchNeisSchools } from "@/app/actions";
import { InlineNotice, useMutation } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { externalUrl } from "@/lib/external-links";
import { dateLabel } from "@/lib/domain";
import type { Context } from "@/lib/models";
import type { NeisSchool } from "@/lib/school-public-data-model";
import "./school-extras.css";

export function SchoolInformationSettings({ context: c }: { context: Context }) {
  const [pending, startSearch] = useTransition();
  const [results, setResults] = useState<NeisSchool[] | null>(null);
  const [error, setError] = useState("");
  const connect = useMutation();

  const school = c.school;
  const connected = !!(school?.neis_school_code && school.neis_office_code);
  const [searchOpen, setSearchOpen] = useState(false);
  const homepage = externalUrl.safeParse(school?.homepage_url);
  const connectSchool = (codes: Pick<NeisSchool, "neis_office_code" | "neis_school_code">) => {
    connect.execute(() => connectNeisSchool({
      workspaceId: c.workspace.id,
      neis_office_code: codes.neis_office_code,
      neis_school_code: codes.neis_school_code,
    }), () => { setResults(null); setSearchOpen(false); }, "학교 기본정보를 갱신했습니다.");
  };
  return <section className="panel settings-form" id="school-information">
    <div className="school-connection-heading">
      <h2>나이스 학교 연결</h2>
      {connected && !c.schoolInfoError && <Button type="button" className="school-neis-refresh" variant="outline" onClick={() => connectSchool({
        neis_office_code: school!.neis_office_code!, neis_school_code: school!.neis_school_code!,
      })} disabled={connect.pending}><RefreshCw size={15} aria-hidden="true"/>정보 갱신</Button>}
    </div>
    {c.schoolInfoError ? <p role="alert">학교 기본정보를 불러오지 못했습니다.</p>
      : school?.neis_school_code && school.neis_office_code ? <>
        <dl className="school-info-summary">
          <dt>나이스 학교 코드</dt><dd>{school.neis_office_code} · {school.neis_school_code}</dd>
          {school.road_address && <><dt>도로명주소</dt><dd>{school.road_address}</dd></>}
          {homepage.success && <><dt>홈페이지</dt><dd><a href={homepage.data} target="_blank" rel="noopener noreferrer">홈페이지 열기 <ExternalLink size={13} aria-hidden="true"/><span className="sr-only"> (새 창)</span></a></dd></>}
          {school.foundation_day && <><dt>개교기념일</dt><dd>{dateLabel(school.foundation_day)}</dd></>}
        </dl>
      </> : <p className="muted">나이스 학교를 연결하면 급식과 홈페이지 정보를 사용할 수 있습니다.</p>}
    {connected && !c.schoolInfoError && <Button type="button" variant="ghost" className="school-neis-search-toggle" aria-expanded={searchOpen} aria-controls="school-neis-search" onClick={()=>setSearchOpen(open=>!open)}>
      <Search size={16} aria-hidden="true"/>연결 학교 변경<ChevronDown size={16} aria-hidden="true" className="school-neis-chevron"/>
    </Button>}
    <div id="school-neis-search" className="school-neis-search" data-collapsed={connected && !c.schoolInfoError && !searchOpen ? "true" : "false"}>
    <form className="form-stack school-neis-search-form" onSubmit={(event) => {
      event.preventDefault();
      const query = String(new FormData(event.currentTarget).get("name"));
      setError("");
      setResults(null);
      startSearch(async () => {
        try {
          const result = await searchNeisSchools(c.workspace.id, query);
          if (result.ok) setResults(result.data);
          else setError(result.error);
        } catch {
          setError("학교 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        }
      });
    }}>
      <label>나이스 학교명<input name="name" autoComplete="off" enterKeyHint="search" maxLength={80} minLength={2} required defaultValue={c.workspace.name.replace(/^\[[^\]]+\]\s*/, "")} /></label>
      <Button type="submit" variant="outline" disabled={pending || connect.pending}><Search aria-hidden="true" />
        {pending ? "검색 중…" : "학교 검색"}</Button>
    </form>
    {error && <p role="alert">{error}</p>}
    {results && (results.length > 0 ? <ul className="school-settings-link-list">
      {results.map((result) => <li key={result.neis_office_code + result.neis_school_code}>
        <div><strong>{result.name}</strong>
          <small>{[result.type, result.road_address || result.region, result.neis_school_code].filter(Boolean).join(" · ")}</small>
        </div>
        <Button type="button" variant="outline" disabled={connect.pending} onClick={() => connectSchool(result)}>연결</Button>
      </li>)}
    </ul> : <p role="status">이 교육과정 단계에 해당하는 검색 결과가 없습니다.</p>)}
    </div>
    <InlineNotice mutation={connect} />

    <SchoolWeatherLocation context={c}/>
  </section>;
}

type WeatherCandidate={name:string;address:string;neis_office_code:string;neis_school_code:string};
function SchoolWeatherLocation({context:c}:{context:Context}){
  const m=useMutation();
  const [searching,startSearch]=useTransition();
  const [open,setOpen]=useState(false);
  const [results,setResults]=useState<WeatherCandidate[]|null>(null);
  const [error,setError]=useState("");
  const school=c.school;
  const linked=!!(school?.neis_office_code&&school.neis_school_code);
  const configured=school?.weather_nx!=null&&school.weather_ny!=null;
  const status=!configured?"위치 설정 필요":school?.weather_location_mode==="auto"?"자동 설정":school?.weather_location_mode==="manual"?"직접 선택":"기존 위치 사용";
  const select=(candidate:WeatherCandidate|null)=>{
    m.execute(()=>setSchoolWeatherLocation({workspaceId:c.workspace.id,selection:candidate?{neis_office_code:candidate.neis_office_code,neis_school_code:candidate.neis_school_code}:null}),()=>{setOpen(false);setResults(null);setError("");},"날씨 위치를 저장했습니다.");
  };
  return <Disclosure compact className="school-weather-location-settings" label={<span className="weather-location-label">학교 날씨 위치 <small>{status}</small></span>}>
    <div className="weather-location-settings-body">
      <div className="weather-location-current"><MapPin size={18} aria-hidden="true"/><div>
        <strong>{school?.weather_location_address||(configured?"기존 설정 위치":school?.road_address||"위치 미설정")}</strong>
        <p className="field-hint">{school?.weather_location_mode==="auto"?"나이스 학교 주소 기준":school?.weather_location_mode==="manual"?"검색으로 선택한 학교 주소 기준":configured?"기존 날씨는 유지됩니다. 학교 주소 기준으로 다시 설정할 수 있습니다.":"학교 주소를 확인하거나 검색해 위치를 선택하세요."}</p>
      </div></div>
      <div className="weather-location-actions">
        <Button type="button" variant="outline" disabled={m.pending||searching} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><Search size={16} aria-hidden="true"/>위치 변경</Button>
        {linked&&<Button type="button" variant="ghost" disabled={m.pending||searching} onClick={()=>select(null)}><RefreshCw size={15} aria-hidden="true"/>학교 주소로 자동 설정</Button>}
      </div>
      {open&&<div className="weather-location-search">
        <form className="weather-location-search-form" onSubmit={event=>{
          event.preventDefault();
          const form=new FormData(event.currentTarget);
          setResults(null);setError("");
          startSearch(async()=>{
            try{
              const result=await searchSchoolWeatherLocations(c.workspace.id,String(form.get("name")),String(form.get("address")));
              if(result.ok)setResults(result.data);else setError(result.error);
            }catch{setError("위치 검색에 실패했습니다. 다시 시도해 주세요.");}
          });
        }}>
          <label>학교명<input name="name" required minLength={2} maxLength={80} autoComplete="off" enterKeyHint="search" defaultValue={c.workspace.name.replace(/^\[[^\]]+\]\s*/,"")}/></label>
          <label>지역·도로명 (선택)<input name="address" maxLength={120} autoComplete="off" placeholder="예: 부산 강서구"/></label>
          <Button type="submit" variant="outline" disabled={searching||m.pending}><Search size={16} aria-hidden="true"/>{searching?"검색 중…":"위치 검색"}</Button>
        </form>
        <p className="field-hint">학교 위치를 찾을 수 없으면 가까운 학교를 검색해 선택하세요. 나이스 연결 학교나 급식 정보는 변경되지 않습니다.</p>
        {error&&<p role="alert">{error}</p>}
        {results&&(results.length?<ul className="school-settings-link-list">{results.map(result=><li key={result.neis_office_code+result.neis_school_code}><div><strong>{result.name}</strong><small>{result.address}</small></div><Button type="button" variant="outline" disabled={m.pending||searching} onClick={()=>select(result)}>선택</Button></li>)}</ul>:<p role="status">위치 자료가 있는 학교를 찾지 못했습니다. 다른 학교명이나 지역으로 검색해 주세요.</p>)}
      </div>}
      <InlineNotice mutation={m}/>
    </div>
  </Disclosure>;
}

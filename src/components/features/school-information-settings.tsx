"use client";
import { useState, useTransition } from "react";
import { Search, ChevronDown, RefreshCw, ExternalLink } from "lucide-react";
import { connectNeisSchool, saveSchoolWeatherGrid, searchNeisSchools } from "@/app/actions";
import { InlineNotice, SubmitButton, useMutation } from "@/components/common";
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
  const saveGrid = useMutation();
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

    <Disclosure compact className="school-weather-location-settings" label="학교 날씨 위치">
      <p className="field-hint">
        나이스 도로명주소로 확인한 기상청 격자를 사용합니다. 위치를 확인할 수 없으면 학교의 격자 X·Y를 입력하세요.
      </p>
      <form className="form-stack" key={`${school?.weather_nx}:${school?.weather_ny}`} onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const x = String(form.get("nx")), y = String(form.get("ny"));
        saveGrid.execute(() => saveSchoolWeatherGrid({ workspaceId: c.workspace.id,
          grid: x === "" && y === "" ? null : { weather_nx: Number(x), weather_ny: Number(y) },
        }));
      }}>
        <div className="form-two">
          <label>격자 X<input name="nx" type="number" min={1} max={149} defaultValue={school?.weather_nx ?? ""} /></label>
          <label>격자 Y<input name="ny" type="number" min={1} max={253} defaultValue={school?.weather_ny ?? ""} /></label>
        </div>
        <SubmitButton pending={saveGrid.pending}>날씨 위치 저장</SubmitButton>
      </form>
      <InlineNotice mutation={saveGrid} />
    </Disclosure>
  </section>;
}

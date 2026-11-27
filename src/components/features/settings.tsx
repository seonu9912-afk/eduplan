"use client";
import { useSyncExternalStore, useEffect, type ReactNode } from "react";
import { Building2, ClipboardCheck, Link2, Users, Settings2, ChevronRight } from "lucide-react";
import { settingsSectionFromHash } from "@/lib/school-settings-sections";
import "./school-settings-layout.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  GraduationCap,
  Save,
  ShieldCheck,
} from "lucide-react";
import {
  Field,
  InlineNotice,
  SubmitButton,
  useMutation,
} from "@/components/common";
import { saveYear, setSchoolType } from "@/app/actions";
import {
  monthRange,
  schoolTypes,
} from "@/lib/domain";
import type { Context } from "@/lib/models";
import { buildInfo } from "@/lib/build-info";
import { SchoolLinkSettings } from "./school-links";
import { SchoolInformationSettings } from "./school-information-settings";
const subscribeHash=(callback:()=>void)=>{window.addEventListener("hashchange",callback);window.addEventListener("popstate",callback);return()=>{window.removeEventListener("hashchange",callback);window.removeEventListener("popstate",callback);}};
const readHash=()=>window.location.hash;
const serverHash=()=>"";
const settingsGroups=[
 {id:"school",name:"학교 기본 정보",description:"학교급 · 학교명 · 기본 정보",icon:Building2},
 {id:"year",name:"학년도 관리",description:"학년·학급 구성 · 학기 설정",icon:CalendarDays},
 {id:"operations",name:"학교 운영 설정",description:"부서 · 운영 업무 · 시정표",icon:Settings2},
 {id:"accounts",name:"구성원·권한 관리",description:"가입 계정 · 담당 업무 권한",icon:Users},
 {id:"overview",name:"계획 수립 현황",description:"저장본과 공개본 비교",icon:ClipboardCheck},
 {id:"connections",name:"외부 서비스 연동",description:"나이스 · 날씨 · 업무 바로가기",icon:Link2},
 {id:"system",name:"사용 환경 및 정보",description:"앱 설치 · 버전 정보",icon:ShieldCheck},
] as const;
export function SchoolSettings({ context: c, overview, installPanel }: { context: Context; overview?: ReactNode; installPanel?: ReactNode }) {
  const editable=c.role==="admin";
  const hash=useSyncExternalStore(subscribeHash,readHash,serverHash);
  const groups=settingsGroups.filter(g=>editable||g.id==="school"||g.id==="year");
  const requested=settingsSectionFromHash(hash);
  const active=groups.some(g=>g.id===requested)?requested:"school";
  const current=groups.find(g=>g.id===active)!;
  useEffect(()=>{
    // Support pre-existing links from Home as well as direct links to a category.
    if(hash==="#school-links"||hash==="#school-information"){
      const frame=requestAnimationFrame(()=>document.getElementById(hash.slice(1))?.scrollIntoView({block:"start"}));
      return()=>cancelAnimationFrame(frame);
    }
  },[hash]);
  if(!c.year)return null;
  const base=`/app/${c.workspace.id}`;
  const yearQuery=`?year=${c.year.year}`;
  const links=(items:{href:string;name:string;description:string}[])=><div className="settings-destination-list">{items.map(item=><Link key={item.href} className="settings-destination" href={item.href}><div><strong>{item.name}</strong><small>{item.description}</small></div><ChevronRight size={16}/></Link>)}</div>;
  return <div className="school-settings-hub">
    <div className="page-heading"><div><h1>학교 설정</h1><p>학교 공통 기준과 학년도별 운영 설정을 관리합니다.</p></div></div>
    <div className="panel settings-intro"><div className="tile-icon"><GraduationCap/></div><div><h2>{c.workspace.name}</h2><p>{c.schoolType} · {c.year.year}학년도</p></div><span className="scope-tag">{editable?"관리자":"조회 전용"}</span></div>
    <div className="settings-hub-layout">
      <nav className="settings-hub-nav panel" aria-label="학교 설정 분류">
        {groups.map(({id,name,description,icon:Icon})=><a key={id} href={"#settings-"+id} aria-current={active===id?"page":undefined}><Icon size={17} aria-hidden="true"/><span><strong>{name}</strong><small>{description}</small></span><ChevronRight size={14} className="settings-nav-arrow"/></a>)}
      </nav>
      <div className="settings-hub-content">
        <header className="settings-hub-heading"><h2>{current.name}</h2><p>{current.description}</p></header>
        <div className="settings-hub-group" id="settings-school" hidden={active!=="school"}>
          <SchoolTypeForm key={c.schoolType} context={c}/>
          <div className="panel settings-hub-note"><h3>학교 공통 정보</h3><p>학교급은 전체 학년도에 공통으로 적용됩니다. 학교명과 나이스 정보는 외부 서비스 연동에서 확인할 수 있습니다.</p></div>
        </div>
        <div className="settings-hub-group" id="settings-year" hidden={active!=="year"}>
          <YearForm key={`${c.year.id}-${c.schoolType}`} context={c} year={c.year.year} editable={editable}/>
          <div className="panel settings-hub-note"><h3>학년도별 기준</h3><p>학년도는 3월부터 다음 해 2월까지이며, 학급 구성과 학사일정은 해당 학년도 자료에 적용됩니다.</p></div>
        </div>
        {editable&&<>
          <section className="settings-hub-group" id="settings-operations" hidden={active!=="operations"}>
            {links([{href:base+"/plans"+yearQuery+"&view=manage",name:"부서·운영 업무",description:"업무계획 관리에서 부서와 학교 운영 항목을 설정합니다."},{href:base+"/timetable"+yearQuery+"&view=manage",name:"시정표·시간표 운영",description:"시간표 관리에서 시정표와 수업 운영 정보를 설정합니다."},{href:base+"/calendar"+yearQuery+"&view=manage",name:"학기·방학·수업일",description:"학사일정에서 해당 학년도의 운영 기준을 설정합니다."}])}
          </section>
          <section className="settings-hub-group" id="settings-accounts" hidden={active!=="accounts"}>
            <div className="panel settings-hub-note"><p>교원 명부, 로그인 계정, 업무별 편집 권한은 별개의 정보입니다. 교원 등록만으로 접근 권한이 생기지 않습니다.</p></div>
            {links([{href:base+"/teachers"+yearQuery,name:"교원 명부",description:"교원 정보와 가입 계정의 연결을 관리합니다."},{href:base+"/people"+yearQuery,name:"구성원 관리",description:"가입 계정, 초대 및 학교 접근 권한을 관리합니다."},{href:base+"/people"+yearQuery+"#permission-matrix-title",name:"업무별 편집 권한",description:"기능별 편집·공개 담당자를 지정합니다."}])}
          </section>
          <section className="settings-hub-group" id="settings-overview" hidden={active!=="overview"}>
            {overview??<div className="panel settings-hub-note"><p>계획 수립 현황을 불러오지 못했습니다.</p></div>}
          </section>
          <section className="settings-hub-group" id="settings-connections" hidden={active!=="connections"}>
            <SchoolInformationSettings context={c}/><SchoolLinkSettings context={c}/>
          </section>
          <section className="settings-hub-group" id="settings-system" hidden={active!=="system"}>
            {installPanel}
            <div className="panel settings-hub-note"><h3>버전 및 배포 정보</h3>
              <dl className="build-info"><dt>버전</dt><dd>{buildInfo.version}</dd><dt>환경</dt><dd>{buildInfo.deployment==="production"?"Production":buildInfo.deployment==="preview"?"Preview":"Development"}</dd><dt>배포 빌드 시각</dt><dd>{buildInfo.builtAt?new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium",timeStyle:"medium",timeZone:"Asia/Seoul"}).format(new Date(buildInfo.builtAt)):"개발 실행"}</dd><dt>Git 커밋</dt><dd>{buildInfo.commit?<code title={buildInfo.commit}>{buildInfo.commit.slice(0,12)}</code>:"제공되지 않음"}</dd>{buildInfo.id&&<><dt>Vercel 배포 ID</dt><dd><code>{buildInfo.id}</code></dd></>}</dl>
            </div>
            <div className="panel settings-hub-note"><p>학생 이름이나 성적 등 민감한 개인정보는 입력하지 않습니다.</p></div>
          </section>
        </>}
      </div>
    </div>
  </div>;
}
function YearForm({
  context: c,
  year,
  editable,
}: {
  context: Context;
  year: number;
  editable: boolean;
}) {
  const m = useMutation();
  const router = useRouter();
  const term = (n: number) => c.semesters.find((s) => s.number === n);
  const defaults = [
    { start_date: `${year}-03-01`, end_date: `${year}-07-20` },
    { start_date: `${year}-08-17`, end_date: monthRange(`${year + 1}-02`).end },
  ];
  return (
    <form
      className="panel settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        m.execute(
          () =>
            saveYear({
              target: c.workspace.id,
              school_year: year,
              expected_version: c.year!.version,
              terms: [1, 2].map((n) => ({
                start_date: term(n)?.start_date ?? defaults[n - 1].start_date,
                end_date: term(n)?.end_date ?? defaults[n - 1].end_date,
              })),
              class_counts: c.grades.map((n) => Number(f.get(`classes-${n}`))),
            }),
          () => router.push(`/app/${c.workspace.id}/settings?year=${year}`),
        );
      }}
    >
      <fieldset disabled={!editable || m.pending}>
        <div className="settings-section">
          <div className="section-label">
            <CalendarDays size={20} />
            <h2>{year}학년도</h2>
          </div>
          <p className="muted">
            학년도는 3월 1일부터 다음 해 2월 말까지입니다. 학기 기간과 방학은
            학사운영에서 조정하세요.
          </p>
          <Link
              className="text-link"
              href={`/app/${c.workspace.id}/calendar?year=${year}`}
            >
              학사운영에서 학기 설정하기 →
          </Link>
        </div>
        <div className="settings-section">
          <div className="section-label">
            <GraduationCap size={20} />
            <h2>학년·학급 구성</h2>
          </div>
          <p className="muted">
            학년별 학급 수를 입력하면 학급이 자동으로 구성됩니다.
          </p>
          <div className="class-counts">
            {c.grades.map((n) => (
              <Field key={n} label={`${n}학년 학급 수`} id={`class-count-${n}`}>
                <div className="unit-input">
                  <input
                    id={`class-count-${n}`}
                    name={`classes-${n}`}
                    type="number"
                    min={0}
                    max={30}
                    defaultValue={c.classes.filter((x) => x.grade === n).length}
                    required
                  />
                  <span>학급</span>
                </div>
              </Field>
            ))}
          </div>
        </div>
      </fieldset>
      <div className="settings-save">
        <InlineNotice mutation={m} />
        {editable ? (
          <SubmitButton pending={m.pending}>
            <Save />
            학년도 설정 저장
          </SubmitButton>
        ) : (
          <p className="muted">관리자에게 설정 변경을 요청해 주세요.</p>
        )}
      </div>
    </form>
  );
}

function SchoolTypeForm({ context: c }: { context: Context }) {
  const m = useMutation();
  return (
    <form
      className="panel school-type-settings"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        m.execute(() =>
          setSchoolType(c.workspace.id, String(f.get("school_type"))),
        );
      }}
    >
      <Field
        label="학교급"
        id="settings-school-type"
        hint="초등학교는 1~6학년, 중·고등학교는 1~3학년으로 구성됩니다."
      >
        <select
          id="settings-school-type"
          name="school_type"
          defaultValue={c.schoolType}
          disabled={c.role !== "admin" || m.pending}
        >
          {schoolTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </Field>
      <InlineNotice mutation={m} />
      {c.role === "admin" ? (
        <SubmitButton pending={m.pending}>학교급 저장</SubmitButton>
      ) : null}
    </form>
  );
}

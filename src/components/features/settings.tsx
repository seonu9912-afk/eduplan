"use client";
import { useSyncExternalStore, useEffect, useState, useTransition, type ReactNode, type MouseEvent } from "react";
import { Building2, Users, Settings2, ChevronRight, ChevronLeft, Plus, Download, ExternalLink } from "lucide-react";
import { settingsSectionFromHash, isSettingsDetailHash, settingsAnchorFromHash } from "@/lib/school-settings-sections";
import "./school-settings-layout.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
import { saveYear, setSchoolType, renameSchool, previewNeisClassCounts } from "@/app/actions";
import {
  monthRange,
  schoolTypes,
  academicYearOf,
  seoulToday,
  schoolYearSchema,
} from "@/lib/domain";
import type { Context } from "@/lib/models";
import { buildInfo } from "@/lib/build-info";
import { SchoolLinkSettings } from "./school-links";
import { SchoolInformationSettings } from "./school-information-settings";
import { YearTransfer } from "./year-transfer";
import { Button } from "@/components/ui/button";
import type { NeisClassPreview } from "@/lib/neis";
const subscribeHash=(callback:()=>void)=>{window.addEventListener("hashchange",callback);window.addEventListener("popstate",callback);return()=>{window.removeEventListener("hashchange",callback);window.removeEventListener("popstate",callback);}};
const readHash=()=>window.location.hash;
const serverHash=()=>"";
const settingsGroups=[
 {id:"school",name:"학교 정보",description:"학교명 · 학교급 · 나이스 · 날씨 · 업무 바로가기",icon:Building2},
 {id:"operations",name:"학교 운영",description:"학년도 · 학급 구성 · 학기 · 부서 · 시정표",icon:Settings2},
 {id:"accounts",name:"구성원 및 권한",description:"교원 명부 · 가입 계정 · 업무별 권한",icon:Users},
 {id:"system",name:"시스템 관리",description:"계획 수립 현황 · 데이터 점검 · 앱 정보",icon:ShieldCheck},
] as const;
export function SchoolSettings({ context: c, overview, installPanel }: { context: Context; overview?: ReactNode; installPanel?: ReactNode }) {
  const editable=c.role==="admin";
  const hash=useSyncExternalStore(subscribeHash,readHash,serverHash);
  const groups=settingsGroups.filter(g=>editable||g.id==="school"||g.id==="operations");
  const requested=settingsSectionFromHash(hash);
  const active=groups.some(g=>g.id===requested)?requested:"school";
  const current=groups.find(g=>g.id===active)!;
  const detail=isSettingsDetailHash(hash)&&groups.some(g=>g.id===requested);
  function mobileNavigate(event:MouseEvent<HTMLAnchorElement>,nextHash:string){
    if(!window.matchMedia("(max-width:767px)").matches||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
    event.preventDefault();
    if(window.location.hash!==nextHash){
      window.history.pushState(null,"",window.location.pathname+window.location.search+nextHash);
      window.dispatchEvent(new Event("hashchange"));
    }
    requestAnimationFrame(()=>{
      window.scrollTo({top:0,behavior:"instant"});
      document.getElementById(nextHash?"settings-mobile-detail-title":"settings-mobile-list-title")?.focus({preventScroll:true});
    });
  }
  useEffect(()=>{
    // Support pre-existing links from Home as well as direct links to a category.
    const anchor=settingsAnchorFromHash(hash);
    if(anchor){
      const frame=requestAnimationFrame(()=>document.getElementById(anchor)?.scrollIntoView({block:"start"}));
      return()=>cancelAnimationFrame(frame);
    }
  },[hash]);
  if(!c.year)return null;
  const base=`/app/${c.workspace.id}`;
  const yearQuery=`?year=${c.year.year}`;
  const links=(items:{href:string;name:string;description:string}[])=><div className="settings-destination-list">{items.map(item=><Link key={item.href} className="settings-destination" href={item.href}><div><strong>{item.name}</strong><small>{item.description}</small></div><ChevronRight size={16}/></Link>)}</div>;
  return <div className="school-settings-hub" data-mobile-detail={detail?"true":"false"}>
    <div className="page-heading settings-main-heading"><div><h1 id="settings-mobile-list-title" tabIndex={-1}>학교 설정</h1><p>학교 공통 기준과 학년도별 운영 설정을 관리합니다.</p></div></div>
    <div className="panel settings-intro"><div className="tile-icon"><GraduationCap/></div><div><h2>{c.workspace.name}</h2><p>{c.schoolType} · {c.year.year}학년도</p></div><span className="scope-tag">{editable?"관리자":"조회 전용"}</span></div>
    <div className="settings-hub-layout">
      <nav className="settings-hub-nav panel" aria-label="학교 설정 분류">
        {groups.map(({id,name,description,icon:Icon})=><a key={id} href={"#settings-"+id} onClick={event=>mobileNavigate(event,"#settings-"+id)} aria-current={active===id?"page":undefined}><Icon size={17} aria-hidden="true"/><span><strong>{name}</strong><small>{description}</small></span><ChevronRight size={14} className="settings-nav-arrow"/></a>)}
      </nav>
      <div className="settings-hub-content">
        <header className="settings-hub-heading">
          <a className="settings-mobile-back" href={yearQuery} onClick={event=>mobileNavigate(event,"")}><ChevronLeft size={18} aria-hidden="true"/>학교 설정</a>
          <h2 id="settings-mobile-detail-title" tabIndex={-1}>{current.name}</h2><p>{current.description}</p>
        </header>
        <div className="settings-hub-group" id="settings-school" hidden={active!=="school"}>
          <section className="settings-subgroup" aria-labelledby="settings-school-type-title">
            <h3 id="settings-school-type-title" className="settings-subgroup-title">학교 기본 정보</h3>
            <div className="school-basic-fields"><SchoolNameForm context={c}/><SchoolTypeForm key={c.schoolType} context={c}/></div>
          </section>
          {editable&&<section className="settings-subgroup" id="settings-connections" aria-label="외부 서비스 연동">
            <SchoolInformationSettings context={c}/><SchoolLinkSettings context={c}/>
          </section>}
        </div>
        <div className="settings-hub-group" id="settings-operations" hidden={active!=="operations"}>
          <section className="settings-subgroup" id="settings-year" aria-labelledby="settings-year-title">
            <h3 id="settings-year-title" className="settings-subgroup-title sr-only">학년도 관리</h3>
            <AcademicYearSettings key={`${c.year.id}-${c.schoolType}-${c.year.version}`} context={c} editable={editable}/>
          </section>
          {editable&&<section className="settings-subgroup" aria-labelledby="settings-operations-title">
            <h3 id="settings-operations-title" className="settings-subgroup-title">학교 운영 기준</h3>
            {links([{href:base+"/plans"+yearQuery+"&view=manage",name:"부서·운영 업무",description:"업무계획 관리에서 부서와 학교 운영 항목을 설정합니다."},{href:base+"/timetable"+yearQuery+"&view=manage",name:"시정표·시간표 운영",description:"시간표 관리에서 시정표와 수업 운영 정보를 설정합니다."},{href:base+"/calendar"+yearQuery+"&view=manage",name:"학기·방학·수업일",description:"선택한 학년도의 학기 기간, 방학 및 수업일을 설정합니다."}])}
          </section>}
        </div>
        {editable&&<>
          <section className="settings-hub-group" id="settings-accounts" hidden={active!=="accounts"}>
            {links([{href:base+"/teachers"+yearQuery,name:"교원 명부",description:"교원 정보와 가입 계정의 연결을 관리합니다."},{href:base+"/people"+yearQuery,name:"구성원 관리",description:"가입 계정, 초대 및 학교 접근 권한을 관리합니다."},{href:base+"/people"+yearQuery+"#permission-matrix-title",name:"업무별 편집 권한",description:"기능별 편집·공개 담당자를 지정합니다."}])}
            <div className="panel settings-hub-note"><p>교원 명부, 로그인 계정, 업무별 편집 권한은 별개의 정보입니다. 교원 등록만으로 접근 권한이 생기지 않습니다.</p></div>
          </section>
          <section className="settings-hub-group" id="settings-system" hidden={active!=="system"}>
            <section className="settings-subgroup" id="settings-overview" aria-labelledby="settings-overview-title">
              <h3 id="settings-overview-title" className="settings-subgroup-title">계획 수립 현황 및 데이터 점검</h3>
              {overview??<div className="panel settings-hub-note"><p>계획 수립 현황을 불러오지 못했습니다.</p></div>}
            </section>
            <section className="settings-subgroup" aria-labelledby="settings-app-title">
              <h3 id="settings-app-title" className="settings-subgroup-title">사용 환경 및 정보</h3>
              {installPanel}
              <div className="panel settings-hub-note"><h3>버전 및 배포 정보</h3>
              <dl className="build-info"><dt>버전</dt><dd>{buildInfo.version}</dd><dt>환경</dt><dd>{buildInfo.deployment==="production"?"Production":buildInfo.deployment==="preview"?"Preview":"Development"}</dd><dt>배포 빌드 시각</dt><dd>{buildInfo.builtAt?new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium",timeStyle:"medium",timeZone:"Asia/Seoul"}).format(new Date(buildInfo.builtAt)):"개발 실행"}</dd><dt>Git 커밋</dt><dd>{buildInfo.commit?<code title={buildInfo.commit}>{buildInfo.commit.slice(0,12)}</code>:"제공되지 않음"}</dd>{buildInfo.id&&<><dt>Vercel 배포 ID</dt><dd><code>{buildInfo.id}</code></dd></>}</dl>
            </div>
              <div className="panel settings-hub-note"><p>학생 이름이나 성적 등 민감한 개인정보는 입력하지 않습니다.</p></div>
            </section>
          </section>
        </>}
      </div>
    </div>
  </div>;
}
function AcademicYearSettings({context:c,editable}:{context:Context;editable:boolean}) {
  const router=useRouter();
  const [dirty,setDirty]=useState(false);
  const [moving,setMoving]=useState(false);
  if(!c.year)return null;
  const year=c.year.year;
  const current=academicYearOf(seoulToday());
  const years=[...new Set([...c.years.map(item=>item.year),year])].sort((a,b)=>b-a);
  const next=current+1;
  const canPrepare=editable&&schoolYearSchema.safeParse(next).success&&!years.includes(next);
  function switchYear(target:number,prepare=false){
    if(target===year||moving||!schoolYearSchema.safeParse(target).success)return;
    if(!years.includes(target)&&!(prepare&&canPrepare&&target===next))return;
    if(dirty&&!window.confirm("저장하지 않은 학급 구성 변경 사항이 있습니다. 변경 내용을 버리고 학년도를 이동할까요?"))return;
    if(prepare&&!window.confirm(target+"학년도 자료를 준비할까요? 기존 학년도 자료는 그대로 유지됩니다."))return;
    setMoving(true);
    router.push(`/app/${c.workspace.id}/settings?year=${target}#settings-operations`);
  }
  return <div className="academic-year-settings" data-edit-year={year}>
    <div className="academic-year-selector">
      <div className="academic-year-control">
        <label htmlFor="settings-edit-year">관리할 학년도</label>
        <select id="settings-edit-year" value={year} disabled={moving} onChange={e=>switchYear(Number(e.target.value))}>
          {years.map(y=><option key={y} value={y}>{y}학년도{y===current?" (현재)":""}</option>)}
        </select>
      </div>
      {canPrepare&&<Button type="button" variant="outline" className="academic-year-prepare" disabled={moving} onClick={()=>switchYear(next,true)}><Plus size={16} aria-hidden="true"/>{next}학년도 준비</Button>}
      <p className="academic-year-range"><span>{year}. 3. 1. ~ {year+1}. 2. {Number(monthRange(`${year+1}-02`).end.slice(8))}.</span><span>선택한 학년도의 설정과 자료를 관리합니다.</span></p>
      {moving&&<p role="status" className="muted">학년도를 불러오는 중…</p>}
    </div>
    <YearForm context={c} year={year} editable={editable&&!moving} onDirty={setDirty}/>
    {editable && <YearTransfer key={c.year.id} context={c}/>}
  </div>;
}

function YearForm({
  context: c,
  year,
  editable,
  onDirty,
}: {
  context: Context;
  year: number;
  editable: boolean;
  onDirty: (dirty:boolean)=>void;
}) {
  const m = useMutation();
  const router = useRouter();
  const [counts,setCounts]=useState(()=>c.grades.map(g=>String(c.classes.filter(x=>x.grade===g).length)));
  const [preview,setPreview]=useState<NeisClassPreview|null>(null);
  const [importError,setImportError]=useState("");
  const [importing,startImport]=useTransition();
  const linked=!!(c.school?.neis_office_code&&c.school?.neis_school_code);
  function updateCounts(next:string[]){setCounts(next);onDirty(c.grades.some((g,i)=>next[i]!==String(c.classes.filter(x=>x.grade===g).length)));}
  const term = (n: number) => c.semesters.find((s) => s.number === n);
  const defaults = [
    { start_date: `${year}-03-01`, end_date: `${year}-07-20` },
    { start_date: `${year}-08-17`, end_date: monthRange(`${year + 1}-02`).end },
  ];
  return (
    <form
      className="panel settings-form academic-year-class-form"
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
          () => {onDirty(false);router.refresh();},
        );
      }}
    >
      <fieldset disabled={!editable || m.pending || importing}>
        <div className="settings-section">
          <div className="section-label">
            <GraduationCap size={20} />
            <h2>학급 구성</h2>
          </div>
          <p className="muted">
            선택한 학년도의 학년별 학급 수를 설정합니다.
          </p>
          {editable&&<div className="class-import-tools">
            <Button type="button" variant="outline" disabled={!linked||importing||m.pending} onClick={()=>{
              setPreview(null);setImportError("");
              startImport(async()=>{try{const result=await previewNeisClassCounts(c.workspace.id,year);if(result.ok)setPreview(result.data);else setImportError(result.error);}catch{setImportError("나이스 학급정보를 불러오지 못했습니다.");}});
            }}><Download size={15} aria-hidden="true"/>{importing?"조회 중…":"나이스 학급정보 가져오기"}</Button>
            <a href="https://www.schoolinfo.go.kr/" target="_blank" rel="noopener noreferrer">학교알리미 공시자료 확인 <ExternalLink size={12} aria-hidden="true"/></a>
            {!linked&&<p className="field-hint">학교 정보에서 나이스 학교를 먼저 연결하세요.</p>}
            {importError&&<p role="alert" className="field-hint">{importError}</p>}
            {preview&&<div className="class-import-preview">
              <strong>{preview.schoolName} · {preview.year}학년도 공개 학급정보</strong>
              <p className="field-hint">현재 입력값과 비교한 결과입니다. 확인되지 않은 학년은 기존 값을 유지합니다.</p>
              <div className="class-import-table" role="table" aria-label="학급 수 비교">
                <div role="row"><span role="columnheader">학년</span><span role="columnheader">현재 입력</span><span role="columnheader">나이스</span></div>
                {preview.grades.map((row,i)=><div role="row" key={row.grade}><span role="cell">{row.grade}학년</span><span role="cell">{counts[i]||"—"}</span><strong role="cell">{row.count===null?"확인 필요":row.count+"학급"}</strong></div>)}
              </div>
              {preview.excluded>0&&<p className="field-hint">일반 숫자 학급으로 확인할 수 없는 자료 {preview.excluded}건은 제외했습니다. 실제 학급 편성을 확인하세요.</p>}
              <div className="class-import-actions"><Button type="button" variant="ghost" onClick={()=>setPreview(null)}>취소</Button><Button type="button" disabled={preview.grades.every(row=>row.count===null)} onClick={()=>{
                updateCounts(counts.map((v,i)=>preview.grades[i]?.count!=null?String(preview.grades[i].count):v));setPreview(null);
              }}>입력칸에 반영</Button></div>
              <p className="field-hint">아래 학급 구성 저장을 눌러야 실제 학교 자료에 적용됩니다.</p>
            </div>}
          </div>}
          <div className="class-counts">
            {c.grades.map((n,i) => (
              <Field key={n} label={`${n}학년 학급 수`} id={`class-count-${n}`}>
                <div className="unit-input">
                  <input
                    id={`class-count-${n}`}
                    name={`classes-${n}`}
                    type="number"
                    min={0}
                    max={30}
                    value={counts[i]}
                    onChange={e=>updateCounts(counts.map((v,j)=>j===i?e.target.value:v))}
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
            학급 구성 저장
          </SubmitButton>
        ) : (
          <p className="muted">관리자에게 설정 변경을 요청해 주세요.</p>
        )}
      </div>
    </form>
  );
}

function SchoolNameForm({context:c}:{context:Context}) {
  const m=useMutation();
  const [saved,setSaved]=useState(c.workspace.name);
  const [name,setName]=useState(c.workspace.name);
  const editable=c.role==="admin";
  useEffect(()=>{
    setName(current=>current===saved?c.workspace.name:current);
    setSaved(c.workspace.name);
  // Synchronize external changes without discarding an unsaved input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[c.workspace.name]);
  const changed=name.trim()!==saved;
  return <form className="school-name-settings school-basic-field-form" onSubmit={e=>{
    e.preventDefault();
    const next=name.trim();
    if(!editable||!next||!changed||m.pending)return;
    m.execute(()=>renameSchool({workspaceId:c.workspace.id,name:next,previousName:saved}),value=>{
      setSaved(value);
      setName(value);
    },"학교명을 변경했습니다.");
  }}>
    <label htmlFor="settings-school-name">학교명</label>
    <div className="school-basic-field-row">
      <input id="settings-school-name" name="school_name" value={name} onChange={e=>setName(e.target.value)} maxLength={80} required disabled={!editable||m.pending} autoComplete="off"/>
      {editable&&<Button type="submit" variant="outline" disabled={m.pending||!changed||!name.trim()}>학교명 저장</Button>}
    </div>
    <p className="field-hint">학교명만 변경되며 기존 학년도 자료와 구성원, 나이스 연결은 유지됩니다.</p>
    <InlineNotice mutation={m}/>
  </form>;
}

function SchoolTypeForm({ context: c }: { context: Context }) {
  const m = useMutation();
  const [schoolType,setType]=useState<string>(c.schoolType);
  return (
    <form
      className="school-type-settings school-basic-field-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        m.execute(() =>
          setSchoolType(c.workspace.id, String(f.get("school_type"))),
        );
      }}
    >
      <label htmlFor="settings-school-type">학교급</label>
      <div className="school-basic-field-row">
        <select id="settings-school-type" name="school_type" value={schoolType} onChange={e=>setType(e.target.value)} disabled={c.role!=="admin"||m.pending}>
          {schoolTypes.map(type=><option key={type}>{type}</option>)}
        </select>
        {c.role==="admin"&&<Button type="submit" variant="outline" disabled={m.pending||schoolType===c.schoolType}>학교급 저장</Button>}
      </div>
      <p className="field-hint">초등학교는 1~6학년, 중·고등학교는 1~3학년으로 구성됩니다.</p>
      <InlineNotice mutation={m}/>
    </form>
  );
}

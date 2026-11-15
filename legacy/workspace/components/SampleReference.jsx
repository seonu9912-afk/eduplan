'use client';
import {useMemo,useState} from 'react';
import {BookOpenCheck,ClipboardList,Info,Search,FileSpreadsheet,CheckCircle2} from 'lucide-react';

const fmt=n=>Number(n||0).toLocaleString('ko-KR');
const FIELDS=[['creative_self','자율·자치'],['creative_club','동아리'],['creative_career','진로'],['volunteer','봉사(참고)']];

export default function SampleReference({meta,creativeRows=[],requiredEducation=[]}){
  const [term,setTerm]=useState('all');
  const [query,setQuery]=useState('');
  const [showRequired,setShowRequired]=useState(false);
  const normalizedQuery=query.trim().toLowerCase();
  const filtered=useMemo(()=>creativeRows.filter(x=>(term==='all'||String(x.term)===term)&&(!normalizedQuery||[x.name,x.department,x.date,x.sourceCategory,x.memo].some(s=>String(s||'').toLowerCase().includes(normalizedQuery)))),[creativeRows,term,normalizedQuery]);
  const reference=meta?.referenceTotals||{};
  const src=reference.creative||{};
  return <div className="sample-source-panel">
    <section className="sample-source-intro"><div><span>WORKBOOK VALIDATION</span><h2>2026학년도 원본 자료 확인</h2><p>실제 엑셀에서 가져온 편성 내용입니다. 원본 시수와 프로그램의 편성 결과를 대조하는 참고 화면이며 법정 시수나 교육 이수의 적합성 판정이 아닙니다.</p></div><FileSpreadsheet size={36}/></section>
    <div className="sample-source-kpis">
      <div><small>연간 수업일수 (원본)</small><strong>{fmt(reference.calendar?.total)}일</strong><span>1학기 {fmt(reference.calendar?.first)}일 · 2학기 {fmt(reference.calendar?.second)}일</span></div>
      <div><small>창체 계획 (원본 행)</small><strong>{fmt(creativeRows.length)}행</strong><span>교시별 자율·동아리·진로 및 봉사 참고</span></div>
      <div><small>필수 반영 교육 (원본)</small><strong>{fmt(requiredEducation.length)}건</strong><span>법령 및 행정지침 최신 여부 별도 확인</span></div>
    </div>
    <section className="sample-source-card"><header><div><h3><BookOpenCheck size={17}/> 창의적 체험활동 운영계획</h3><p>교시와 교육과정 영역을 보존했습니다. 봉사는 동아리 등 주된 시수에 중복 합산되지 않도록 참고값으로 표시합니다.</p></div></header>
      <div className="sample-source-totals">{[1,2].map(semester=><div key={semester}><strong>{semester}학기 원본 집계</strong>{FIELDS.map(([key,label])=><span key={key}>{label} <b>{fmt(src[semester]?.[key])}시간</b></span>)}</div>)}</div>
      <div className="sample-source-toolbar"><div role="group" aria-label="학기 필터">{[['all','전체'],['1','1학기'],['2','2학기']].map(([v,l])=><button type="button" key={v} aria-pressed={term===v} onClick={()=>setTerm(v)}>{l}</button>)}</div><label><Search size={15}/><input aria-label="창체 계획 검색" value={query} placeholder="활동·부서·날짜 검색" onChange={e=>setQuery(e.target.value)}/></label><span>검색 결과 {filtered.length}행</span></div>
      <div className="sample-table-scroll"><table className="sample-source-table"><thead><tr><th>일자</th><th>교시</th><th>교육활동</th><th>구분</th><th>부서</th>{FIELDS.map(([,label])=><th key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td>{row.date.slice(5)}</td><td>{row.periodText}</td><td><strong>{row.name}</strong>{row.memo&&<small>{row.memo}</small>}</td><td>{row.sourceCategory}</td><td>{row.department||'—'}</td>{FIELDS.map(([key])=><td key={key}>{row.hours?.[key]||'—'}</td>)}</tr>)}</tbody></table></div>
      {!filtered.length&&<p className="sample-source-empty">해당하는 운영계획이 없습니다.</p>}
    </section>
    <section className="sample-source-card"><header><div><h3><ClipboardList size={17}/> 필수 반영 교육 자료</h3><p>원본의 23개 교육 항목을 참고자료로 탑재했습니다. 실제 연도별 의무기준과 이수 여부는 별도로 검토해야 합니다.</p></div><button type="button" onClick={()=>setShowRequired(x=>!x)}>{showRequired?'접기':'23개 항목 펼치기'}</button></header>
      {showRequired&&<div className="sample-table-scroll"><table className="sample-source-table required"><thead><tr><th>No.</th><th>영역</th><th>대상·시간 기준 (2026 원본)</th><th>편성방법</th><th>담당부서</th><th>비고</th></tr></thead><tbody>{requiredEducation.map(row=><tr key={row.number}><td>{row.number}</td><td><strong>{row.area}</strong></td><td>{row.requirement}</td><td>{row.method||'—'}</td><td>{row.department||'—'}</td><td>{row.memo||'—'}</td></tr>)}</tbody></table></div>}
    </section>
    <div className="sample-source-disclaimer"><Info size={17}/><p>수업일수와 창체 시수는 제공된 엑셀의 기록을 바탕으로 재현했습니다. 실제 교사별 시간표 파일은 제공되지 않았으므로 교과별 실제 배정시수·교원 담당시수는 계산하지 않습니다. 예시는 브라우저에 복제되며 수정할 수 있고, 상단의 '예시 복원'으로 다시 불러올 수 있습니다.</p></div>
  </div>;
}

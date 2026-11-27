import Link from "next/link";
import {ClipboardList,ChevronRight} from "lucide-react";
import type {PlanOverviewRow,PlanState,PlanSection} from "@/lib/plan-overview";
import "./plan-overview.css";
const labels:Record<PlanSection,string>={curriculum:"교육과정",calendar:"학사일정",plans:"월중·주간계획",timetable:"시간표",teaching:"교수학습·평가계획"};
const states:Record<PlanState,string>={empty:"미작성",draft:"작성 중",published:"최신 공개",changed:"수정 후 미공개",partial:"일부 공개",unknown:"확인 필요"};
const date=(v:string)=>new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric"}).format(new Date(v));
export function PlanOverview({rows,workspaceId,year}:{rows:PlanOverviewRow[];workspaceId:string;year:number}){
  const done=rows.filter(r=>r.state==="published").length;
  return <section className="panel plan-overview no-print" aria-labelledby="plan-overview-title">
    <header><h2 id="plan-overview-title"><ClipboardList size={19}/>학교 계획 수립 현황</h2><span className="muted">{year}학년도</span></header>
    <div className="plan-overview-total"><strong>{done}</strong><span>/ {rows.length}개 영역 최신 공개</span></div>
    <progress value={done} max={rows.length} aria-label="최신 공개 영역 수"/>
    <p className="muted">저장본과 최근 공개본을 비교합니다. 미래 적용 공개본도 포함하며, 전체 교육활동의 법정 이행 여부를 뜻하지 않습니다.</p>
    <div className="plan-overview-rows">{rows.map(r=><Link className="plan-overview-row" key={r.section} href={`/app/${workspaceId}/${r.section}?year=${year}&view=manage`}>
      <div><strong>{labels[r.section]}</strong><small>{r.detail}</small><small>{r.owners.length?"담당 "+r.owners.join(", "):"담당 권한 확인"}{r.updatedAt?" · 저장 "+date(r.updatedAt):""}{r.publishedAt?" · 공개 "+date(r.publishedAt):""}{r.effectiveDate?" · 적용 "+r.effectiveDate:""}</small></div>
      <span className="plan-overview-state" data-state={r.state}>{states[r.state]}</span><ChevronRight size={16}/>
    </Link>)}</div>
  </section>;
}

"use client";
import {useState} from "react";
import Link from "next/link";
import {ShieldCheck,CheckCircle2,AlertCircle,XCircle,HelpCircle,ChevronRight} from "lucide-react";
import type {AuditCheck} from "@/lib/operation-audit";
import "./operation-audit.css";
const states={ok:"정상",warning:"확인 필요",error:"연결 오류",unknown:"점검 불가"} as const;
const icons={ok:CheckCircle2,warning:AlertCircle,error:XCircle,unknown:HelpCircle};
export function OperationAudit({rows,workspaceId,year}:{rows:AuditCheck[];workspaceId:string;year:number}){
 const [filter,setFilter]=useState<AuditCheck["scope"]|"all">("all");
 const filtered=rows.filter(r=>filter==="all"||r.scope===filter);
 return <section className="panel operation-audit no-print">
 <div className="panel-heading"><h2><ShieldCheck size={19}/>학교 운영 자료 점검</h2></div>
 <p className="muted">저장 자료를 읽어 연결 상태를 확인합니다. 정상은 점검한 규칙에 한하며, 실제 수업 실시 여부나 전체 법정 요건을 의미하지 않습니다.</p>
 <div className="operation-audit-counts">{(Object.keys(states) as AuditCheck["state"][]).map(s=><div key={s} data-state={s}><small>{states[s]}</small><strong>{filtered.filter(r=>r.state===s).length}</strong></div>)}</div>
 <div className="operation-audit-tabs" role="group" aria-label="점검 범위">{(["all","draft","published"] as const).map(s=><button key={s} type="button" aria-pressed={filter===s} onClick={()=>setFilter(s)}>{s==="all"?"전체":s==="draft"?"저장본":"공개본"}</button>)}</div>
 {filtered.map(r=>{const Icon=icons[r.state];return <details key={r.id} className="operation-audit-row"><summary><Icon size={18} data-state={r.state}/><span><strong>{r.label}</strong><small>{r.scope==="draft"?"저장본":"공개본"} · {states[r.state]}{r.count?" · "+r.count+"개 확인 사항":""}</small></span><ChevronRight size={15}/></summary><div className="operation-audit-details">{r.details.length?<ul>{r.details.map(d=><li key={d}>{d}</li>)}</ul>:<p>점검한 범위에서 이상이 발견되지 않았습니다.</p>}{r.count>r.details.length&&<p>나머지 {r.count-r.details.length}건은 관련 관리 화면에서 확인하세요.</p>}<Link href={`/app/${workspaceId}/${r.area}?year=${year}&view=manage`}>관련 관리 화면 열기</Link></div></details>;})}
 </section>;
}

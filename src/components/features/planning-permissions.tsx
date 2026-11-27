"use client";
import { useState } from "react";
import { Search, ShieldCheck, Users } from "lucide-react";
import { InlineNotice, useMutation } from "@/components/common";
import { savePlanningPermission } from "@/app/planning-completion-actions";
import { Button } from "@/components/ui/button";
import { roles } from "@/lib/domain";
import { permissionDomains,permissionLabels,permissionMatrix,filterPermissionRows,planningDomains } from "@/lib/planning-permission-matrix";
import type { PlanningDomain } from "@/lib/planning-completion";
import type { Context,Role } from "@/lib/models";
import "./planning-permissions.css";
type Filter="all"|"assigned"|"unassigned"|PlanningDomain;
export function PlanningPermissions({context:c}:{context:Context}){
  const m=useMutation();
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<Filter>("all");
  if(c.role!=="admin")return null;
  const matrix=permissionMatrix(c.members,c.completion?.permissions??[]);
  const rows=filterPermissionRows(matrix.rows,query,filter);
  const available=Array.isArray(c.completion?.permissions);
  return <section className="panel permission-matrix no-print" aria-labelledby="permission-matrix-title">
    <div className="panel-heading"><h2 id="permission-matrix-title"><ShieldCheck size={19}/>업무별 편집 권한</h2></div>
    <p className="muted">학교 관리 권한과 업무별 편집·공개 권한은 별개입니다. 관리자도 직접 편집하려면 담당 업무를 지정해야 합니다. 공개본 조회는 기존 구성원 권한을 따릅니다.</p>
    {!available?<p role="alert">업무 권한 자료를 불러오지 못했습니다. 새로 불러온 뒤 변경하세요.</p>:<>
      <div className="permission-counts" aria-label="업무별 담당 인원">
        {matrix.counts.map(({domain,count})=><button key={domain} type="button" className="permission-count" aria-pressed={filter===domain} onClick={()=>setFilter(filter===domain?"all":domain)}><span>{permissionLabels[domain]}</span><strong>{count}<small>명</small></strong></button>)}
      </div>
      <div className="permission-controls">
        <label className="permission-search"><Search size={16}/><input aria-label="구성원 검색" placeholder="이름 또는 이메일 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <select aria-label="업무 권한 필터" value={filter} onChange={e=>setFilter(e.target.value as Filter)}>
          <option value="all">전체 구성원</option><option value="assigned">담당 업무 있음</option><option value="unassigned">담당 업무 없음</option>
          {permissionDomains.map(domain=><option key={domain} value={domain}>{permissionLabels[domain]} 담당자</option>)}
        </select>
        <span className="permission-result"><Users size={15}/> {rows.length}/{c.members.length}명</span>
      </div>
      <div className="permission-table-scroll" tabIndex={0} role="region" aria-label="업무별 편집 권한 표">
        <table className="permission-table">
          <thead><tr><th scope="col">구성원</th>{permissionDomains.map(domain=><th scope="col" key={domain} title={planningDomains[domain]}>{permissionLabels[domain]}</th>)}</tr></thead>
          <tbody>{rows.map(({member,cells})=><tr key={member.user_id}>
            <th scope="row"><strong>{member.display_name}</strong><small>{roles[member.role as Role]??member.role}{member.user_id===c.userId?" · 나":""}</small></th>
            {cells.map(cell=><td key={cell.domain}><label className="permission-cell" data-allowed={cell.allowed?"":undefined}>
              <input type="checkbox" aria-label={member.display_name+" "+planningDomains[cell.domain]+" 편집 권한"} checked={cell.allowed} disabled={m.pending} onChange={e=>{
                const allowed=e.target.checked;
                m.execute(()=>savePlanningPermission({workspaceId:c.workspace.id,member:member.user_id,domain:cell.domain,allowed,version:cell.version}),undefined,`${member.display_name} · ${permissionLabels[cell.domain]} 권한을 ${allowed?"부여":"회수"}했습니다.`);
              }}/><span>{cell.allowed?"편집":"조회"}</span>
            </label></td>)}
          </tr>)}</tbody>
        </table>
        {!rows.length&&<p className="permission-empty">조건에 맞는 구성원이 없습니다.</p>}
      </div>
      <p className="muted">체크를 변경하면 즉시 저장됩니다. 관리자 검토 및 다른 업무의 관련 자료 조회 권한은 기존 정책을 따릅니다.</p>
    </>}
    <InlineNotice mutation={m}/>
    {m.notice.error&&<Button type="button" variant="outline" size="sm" disabled={m.pending} onClick={m.refresh}>최신 권한 다시 불러오기</Button>}
  </section>;
}

"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Context } from "@/lib/models";
import type { AnnualPlan } from "@/lib/academic";
import { previewPlanPublication } from "@/lib/plan-publication-preview";
import "./plan-publication-preview.css";

export function PlanPublicationPreview({context,savedPlan,domain,version,start,end,initialDate,disabled,children}:{
  context:Context;savedPlan:AnnualPlan;domain:"calendar"|"plans";version:number;start:string;end:string;initialDate:string;disabled:boolean;children?:ReactNode;
}){
  const [date,setDate]=useState(initialDate);
  const valid=!!date&&date>=start&&date<=end;
  const comparison=useMemo(()=>valid?previewPlanPublication(context,savedPlan,domain,version,date):null,[valid,context,savedPlan,domain,version,date]);
  const rows=comparison?.rows??[];
  const groups=[{name:"추가",tone:"add",rows:rows.filter(r=>r.before===undefined)},{name:"변경",tone:"change",rows:rows.filter(r=>r.before!==undefined&&r.after!==undefined)},{name:"삭제",tone:"remove",rows:rows.filter(r=>r.after===undefined)}];
  return <>
    <label className="field">적용 시작일<input type="date" name="startsOn" min={start} max={end} value={date} required onChange={e=>setDate(e.target.value)}/></label>
    <section className="plan-publication-preview" aria-label="공개 전 변경사항" aria-live="polite">
      <h3>공개 전 변경사항 확인</h3>
      {comparison?.duplicate?<p role="status">동일한 저장본과 적용 시작일로 이미 공개했습니다.</p>:comparison?.kind==="first"?<p>이 적용일에 이전 공개본이 없습니다. 최초 적용본을 공개합니다.</p>:comparison?.kind==="unavailable"?<p role="alert">이전 공개본을 비교할 수 없습니다. 공개 이력을 확인해 주세요.</p>:comparison?.kind==="comparison"?<>
        <p>기준: {comparison.previousDate} 적용 공개본과 현재 저장된 학년도 계획 비교</p>
        <div className="publication-preview-counts">{groups.map(g=><div key={g.tone} data-tone={g.tone}><strong>{g.rows.length}</strong><span>{g.name}</span></div>)}</div>
        {!rows.length?<p>비교 항목의 내용이 같습니다. 적용일 또는 별도 설정 변경 여부를 확인하세요.</p>:<div className="publication-preview-rows">{groups.filter(g=>g.rows.length).map(g=><details key={g.tone} open={g.rows.length<=5||g.tone==="remove"}><summary data-tone={g.tone}>{g.name} {g.rows.length}건</summary><ul>{g.rows.map((r,i)=><li key={i}><strong>{r.title}</strong>{r.before!==undefined&&<p><span>이전</span> {r.before}</p>}{r.after!==undefined&&<p><span>변경 후</span> {r.after}</p>}{r.before!==undefined&&r.before===r.after&&<p>세부 정보 변경</p>}</li>)}</ul></details>)}</div>}
      </>:<p>적용 시작일을 선택하세요.</p>}
      {comparison?.nextDate&&<p>다음 확정 공개본은 {comparison.nextDate}부터 우선 적용됩니다.</p>}
    </section>
    <label className="field">변경 내용 <textarea name="note" maxLength={500} rows={2}/></label>
    {children}
    <Button type="submit" disabled={disabled||!valid||!!comparison?.duplicate||comparison?.kind==="unavailable"}>확인 및 공개</Button>
  </>;
}

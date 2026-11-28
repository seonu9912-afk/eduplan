"use client";
import {useState} from "react";
import {ArrowRight,CopyPlus} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Modal,InlineNotice,useMutation} from "@/components/common";
import {canPlan,type PlanningDomain} from "@/lib/planning-completion";
import {transferKinds,transferLabels,type TransferKind,type TransferPreview} from "@/lib/year-transfer";
import {previewYearTransfer,applyYearTransfer} from "@/app/year-transfer-actions";
import type {Context} from "@/lib/models";
import "./year-transfer.css";
const domains:Record<TransferKind,PlanningDomain>={"work-settings":"plans","work-events":"plans",periods:"calendar",bell:"timetable",events:"calendar"};
export function YearTransfer({context:c}:{context:Context}){
  const m=useMutation(),[open,setOpen]=useState(false),[source,setSource]=useState(c.years.filter(y=>y.year<(c.year?.year??0)).sort((a,b)=>b.year-a.year)[0]?.year??0),[kind,setKind]=useState<TransferKind>("work-settings"),[preview,setPreview]=useState<TransferPreview|null>(null);
  if(c.role!=="admin"||!c.year)return null;
  const years=c.years.filter(y=>y.year<c.year!.year).sort((a,b)=>b.year-a.year),target=c.year.year;
  const input={workspaceId:c.workspace.id,source,target,kind};
  const count=preview?.items.filter(i=>i.state==="add").length??0;
  return <section className="panel year-transfer">
    <div className="panel-heading"><h2><CopyPlus size={19}/>이전 학년도 자료 가져오기</h2></div>
    <p className="muted">이전 학년도의 운영 기준과 일정을 {target}학년도 저장본에 추가합니다. 기존 공개본과 업무 권한은 변경되지 않습니다.</p>
    <Button type="button" variant="outline" disabled={!years.length} onClick={()=>{setPreview(null);setOpen(true);}}>자료 가져오기</Button>
    {!years.length&&<p className="muted">등록된 이전 학년도가 없습니다.</p>}
    <Modal open={open} onOpenChange={v=>{if(!m.pending)setOpen(v);}} title="이전 학년도 자료 가져오기" description="항목별 미리보기를 확인한 후 추가합니다. 기존 공개본은 변경되지 않습니다." wide>
      <div className="year-transfer-form">
        <div className="year-transfer-years"><label>원본 학년도<select disabled={m.pending} value={source} onChange={e=>{setSource(Number(e.target.value));setPreview(null);}}>{years.map(y=><option key={y.id} value={y.year}>{y.year}학년도</option>)}</select></label><ArrowRight size={18}/><strong>{target}학년도</strong></div>
        <label>가져올 자료<select disabled={m.pending} value={kind} onChange={e=>{setKind(e.target.value as TransferKind);setPreview(null);}}>{transferKinds.map(k=><option key={k} value={k} disabled={!canPlan(c,domains[k])}>{transferLabels[k]}{!canPlan(c,domains[k])?" (권한 필요)":""}</option>)}</select></label>
        <Button type="button" variant="outline" disabled={m.pending||!source||!canPlan(c,domains[kind])} onClick={()=>{setPreview(null);m.execute(()=>previewYearTransfer(input),setPreview,"이관 미리보기를 확인하세요.");}}>미리보기</Button>
        {preview&&<><p>{preview.note}</p><strong>추가 {count}건 · 제외 {preview.items.length-count}건</strong>
          <div className="year-transfer-preview" role="region" aria-label="이관 예정 자료" tabIndex={0}>{preview.items.length?preview.items.map((i,n)=><div key={n}><span><b>{i.label}</b><small>{i.detail}</small></span><span data-state={i.state}>{i.state==="add"?"추가":"제외"}</span></div>):<p>원본 자료가 없습니다.</p>}</div>
          <Button type="button" disabled={m.pending||!count} onClick={()=>{if(window.confirm(count+"건을 저장본에 추가할까요? 공개는 별도입니다."))m.execute(()=>applyYearTransfer({...input,stamp:preview.stamp}),()=>setPreview(null),"자료를 추가했습니다. 각 업무 관리 화면에서 확인한 뒤 공개하세요.");}}>저장본에 {count}건 추가</Button>
        </>}
        <InlineNotice mutation={m}/>
      </div>
    </Modal>
  </section>;
}

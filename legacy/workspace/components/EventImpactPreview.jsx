'use client';
import {useMemo} from 'react';
import {AlertTriangle,ArrowRight,Info} from 'lucide-react';
import {previewEventImpact} from '../lib/event-impact.js';
export default function EventImpactPreview({plan,events,draft}){
  const preview=useMemo(()=>previewEventImpact(plan,events,draft),[plan,events,draft]);
  return <section className="ei-preview" aria-live="polite"><strong><Info size={16}/> 변경 영향 미리보기</strong>
    {!preview.available?<p>{preview.reason}</p>:!preview.hasTimetable?<p>기본 시간표가 없어 교과별 영향을 계산할 수 없습니다. 수업일수는 학사력에서 확인하세요.</p>:<>
      <div className="ei-main"><span>영향받는 날짜 {preview.dates}일</span><span>학급 수업 칸 {preview.before} <ArrowRight size={13}/> {preview.after} <b>({preview.delta>0?'+':''}{preview.delta})</b></span></div>
      {preview.changes.length>0?<div className="ei-changes">{preview.changes.slice(0,6).map(x=><span key={x.subject}>{x.subject} <b>{x.delta>0?'+':''}{x.delta}</b></span>)}{preview.changes.length>6&&<small>외 {preview.changes.length-6}개 과목·영역</small>}</div>:<p>기존 시간표 전체의 수업 칸 수에는 변화가 없습니다. 과목·활동 배정의 상세 변경 여부를 확인하세요.</p>}
    </>}
    {!!preview.overlapCount&&<div className="ei-alert"><AlertTriangle size={16}/><span>이 변경 후 다른 행사와 겹치는 학급·교시 {preview.overlapCount}건이 있습니다. 저장 전 날짜와 대상을 확인하세요.</span></div>}
    <small>실제 기본 시간표가 배정된 수업 칸만 비교합니다. 저장 전 진단이며 모든 교육과정 기준 충족을 보증하지 않습니다.</small>
  </section>;
}

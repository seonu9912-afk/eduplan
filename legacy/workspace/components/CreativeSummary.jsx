'use client';
import {useMemo} from 'react';
import {summarizeEventHours,CREATIVE_LABELS} from '../lib/creative';
export default function CreativeSummary({plan,events}){
  const report=useMemo(()=>summarizeEventHours(plan,events),[plan,events]);
  return <div className="cal-creative-summary">
    <p className="cal-muted">원본의 학기별 창체 운영표를 참고한 <b>행사 편성 기준의 시수 집계</b>입니다. 기본 시간표에 반복 배정된 시수는 여기에 포함되지 않으므로 교육과정 전체 시수와 다를 수 있습니다.</p>
    <div className="cal-table-scroll"><table className="cal-table"><thead><tr><th>학년</th><th>학기</th><th>{CREATIVE_LABELS.creative_self}</th><th>{CREATIVE_LABELS.creative_club}</th><th>{CREATIVE_LABELS.creative_career}</th><th>{CREATIVE_LABELS.sports}</th><th>{CREATIVE_LABELS.volunteer}</th></tr></thead><tbody>{report.grades.flatMap(g=>['first','second','undetermined'].filter(term=>term!=='undetermined'||Object.values(report.counters[g].undetermined).some(Boolean)).map(term=>{
      const sum=report.counters[g][term];
      return <tr key={`${g}-${term}`}><th>{g}학년</th><td>{term==='first'?'1학기':term==='second'?'2학기':'학기 미정'}</td><td>{sum.creative_self}</td><td>{sum.creative_club}</td><td>{sum.creative_career}</td><td>{sum.sports}</td><td>{sum.volunteer}</td></tr>;
    }))}</tbody></table></div>
    <p className="cal-muted">봉사는 별도 확인용 지표로 표시하며 주된 자율·동아리·진로 시수에 다시 더하지 않습니다. 휴업일의 활동은 편성 점검 대상으로 따로 확인해야 합니다. 휴업일과 겹친 교시 배정: {report.excluded.length}건. 여름방학을 편성하기 전에는 학기 구분이 '학기 미정'으로 표시됩니다.</p>
  </div>;
}

"use client";
import {useEffect,useMemo,useState} from "react";
import {CheckCircle2,TriangleAlert} from "lucide-react";
import type {Context} from "@/lib/models";
import type {OperatingDocument} from "@/lib/curriculum-operating-v4";
import {loadOperatingV4} from "@/app/curriculum-operating-actions";
import {loadTimetableDocument} from "@/app/timetable-actions";
import type {TimetableDocument} from "@/lib/timetable-bridge";

function neededHours(doc:OperatingDocument,grade:number,subjectId:string){
  const rows=doc.cells.filter(c=>c.grade===grade&&c.subjectId===subjectId);
  return rows.length?Math.max(...rows.map(c=>c.weekly)):0;
}
export function CurriculumTimetableBridgeV4({context:c,year}:{
  context:Context;year:number;
}){
  const [operating,setOperating]=useState<OperatingDocument|null>(null);
  const [opStatus,setOpStatus]=useState("읽는 중…");
  const [timetable,setTimetable]=useState<TimetableDocument|null>(null);
  const [timeStatus,setTimeStatus]=useState("읽는 중…");
  useEffect(()=>{
    let active=true;
    void loadOperatingV4({workspaceId:c.workspace.id,year}).then(r=>{
      if(!active)return;
      if(r.ok){setOperating(r.data.document);
        setOpStatus(r.data.document?(r.data.status==="confirmed"?"확정":"미확정"):"미생성");}
      else setOpStatus(r.error);
    });
    if(c.year?.year===year&&c.year.id)void loadTimetableDocument({
      workspaceId:c.workspace.id,yearId:c.year.id
    }).then(r=>{if(!active)return;
      if(r.ok){setTimetable(r.data?.document as TimetableDocument??null);setTimeStatus(r.data?"불러옴":"미생성");}
      else setTimeStatus(r.error);
    });
    // When no matching academic year exists, render a derived disconnected status.
    return()=>{active=false;};
  },[c.workspace.id,c.year?.id,c.year?.year,year]);
  const stats=useMemo(()=>{
    if(!operating)return [];
    return c.classes.flatMap(cls=>c.subjects.flatMap(subject=>{
      const required=neededHours(operating,cls.grade,subject.id);
      if(!required)return [];
      const scheduled=(timetable?.weekly??[]).filter(row=>row.subjectId===subject.id&&(
        row.scope==="class"?row.scopeId===cls.id:
        timetable?.groups?.some(group=>group.id===row.scopeId&&group.classIds.includes(cls.id))
      )).length;
      return [{grade:cls.grade,classNumber:cls.class_number,subjectId:subject.id,
        subject:subject.name,required,scheduled,delta:scheduled-required}];
    }));
  },[operating,c.classes,c.subjects,timetable]);
  const differences=stats.filter(row=>row.delta!==0);
  return <section className="op4-root">
    <header className="op4-head"><div><h2>{year}학년도 시간표 연계 검증</h2>
      <p>확정된 운영편제의 주당시수와 실제 시간표 배정 수를 학급별로 비교합니다.</p></div>
      <div className="op4-save-state">운영편제 {opStatus} · 시간표 {c.year?.year===year?timeStatus:"선택 운영 학년도 시간표 미연결"}</div>
    </header>
    <p className="op4-hint">이 화면은 안전한 <b>읽기 전용 검증</b>입니다. 시간표 데이터를 자동 덮어쓰지 않습니다.
      과목개설 시 여러 교사와 이동수업을 설정했다면 수업 집단별 배정도 함께 검토해야 합니다.</p>
    {!operating?<div className="op4-init">
      <TriangleAlert size={17}/>학년도 운영편제를 먼저 생성하고 시수를 확정해 주세요.
    </div>:<>
      <div className="op4-overview">
        <div><small>검증 대상 학급·과목</small><strong>{stats.length}</strong></div>
        <div><small>편성 시수와 일치</small><strong>{stats.length-differences.length}</strong></div>
        <div><small>불일치·미배정</small><strong>{differences.length}</strong></div>
        <div><small>시간표 자료</small><strong>{timetable?"연결":"미연결"}</strong></div>
      </div>
      {differences.length>0?<div className="op4-alert">
        <TriangleAlert size={16}/>시간표가 아직 비어 있거나 과목별로 배정 수가 다릅니다.
        확정 편성값을 기준으로 시간표에서 직접 배정해 주세요.
      </div>:<p className="op4-hint"><CheckCircle2 size={13}/>조회된 학급별 주간 시수 배정이 모두 일치합니다.</p>}
      <div className="op4-table-scroll"><table className="op4-table">
        <thead><tr><th>학년</th><th>학급</th><th>과목</th><th>필요 주당시수</th>
          <th>시간표 배정</th><th>차이</th></tr></thead>
        <tbody>{stats.map(x=><tr key={x.grade+":"+x.classNumber+":"+x.subjectId}>
          <td>{x.grade}</td><td>{x.classNumber}</td><th>{x.subject}</th>
          <td>{x.required}</td><td>{x.scheduled}</td>
          <td style={{color:x.delta===0?"#26704c":"#a65e33"}}>
            {x.delta===0?"일치":(x.delta>0?"+":"")+x.delta}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="op4-footnote">참고: 수업이 학급 간 공유되는 이동수업, 특정 과목의 학기별 시수 차이, 특별실·교사별 배정,
        학사일정의 실제 수업일수는 별도 검증 대상입니다. 이 수치만으로 연간 이수시수 충족을 확정하지 않습니다.</p>
    </>}
  </section>;
}

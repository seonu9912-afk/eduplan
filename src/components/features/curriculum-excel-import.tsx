"use client";
import { canPlan } from "@/lib/planning-completion";

import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {Upload,FileSpreadsheet,CheckCircle2} from "lucide-react";
import type {Context} from "@/lib/models";
import type {ImportCourse,ImportPreview} from "@/lib/curriculum-excel";
import {applyCurriculumExcel} from "@/app/curriculum-excel-actions";
import "./curriculum-excel-import.css";

export function CurriculumExcelImport({context:c,onImported,disabled=false}:{
  context:Context;onImported:(cohort:number)=>void;disabled?:boolean;
}){
  const router=useRouter();
  const picker=useRef<HTMLInputElement>(null);
  const [preview,setPreview]=useState<ImportPreview|null>(null);
  const [selected,setSelected]=useState<number[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [ack,setAck]=useState(false);
  const [year,setYear]=useState(2026);
  const [kind,setKind]=useState<"cohort"|"operating">("cohort");
  const [open,setOpen]=useState(false);
  const editable=canPlan(c,"curriculum");
  async function uploaded(file:File|undefined){
    if(!file)return;
    setBusy(true);setMessage("");setPreview(null);setSelected([]);setAck(false);
    try{
      const {parseCurriculumExcel,CURRICULUM_XLSX_MAX_BYTES}=await import("@/lib/curriculum-excel");
      if(!file.name.toLowerCase().endsWith(".xlsx")||file.size>CURRICULUM_XLSX_MAX_BYTES){
        setMessage("2MB 이하 .xlsx 편성표만 업로드할 수 있습니다.");return;
      }
      const result=await parseCurriculumExcel(new Uint8Array(await file.arrayBuffer()),file.name);
      setPreview(result);setYear(result.year||c.year?.year||2026);setKind(result.kind);
      setSelected(result.courses.map((_,index)=>index));
      if(result.errors.length)setMessage("자동 인식 중 오류가 발견됐습니다. 원본 파일의 구조를 확인해 주세요.");
      else setMessage("과목·학기 시수와 원본 불일치 항목을 확인한 후 등록할 수 있습니다.");
    }catch{
      setMessage("엑셀을 처리하지 못했습니다. 기존 편성표 양식인지 확인해 주세요.");
    }finally{setBusy(false);if(picker.current)picker.current.value="";}
  }
  function patch(index:number,fields:Partial<ImportCourse>){
    setPreview((old)=>old?{...old,courses:old.courses.map((c,j)=>j===index?{...c,...fields}:c)}:old);
  }
  async function apply(){
    if(!editable||disabled||busy||!preview||preview.errors.length||!selected.length||preview.warnings.length&&!ack)return;
    setBusy(true);setMessage("");
    const courses=preview.courses.filter((_,i)=>selected.includes(i)).map((course)=>({
      name:course.name.trim(),group:course.group.trim(),
      terms:course.terms.map(({grade,semester,weekly,final:hours,adjustment})=>
        ({grade,semester,weekly,final:hours,adjustment})),
    }));
    if(courses.some((course)=>!course.name||!course.group)){
      setMessage("교과군과 과목명을 모두 입력해 주세요.");setBusy(false);return;
    }
    const result=await applyCurriculumExcel({
      workspaceId:c.workspace.id,year,kind,courses,
    });
    if(result.ok){
      setMessage("등록 완료 · 교과군 "+result.data.groups+"개, 과목 "+result.data.subjects+
        "개, 학기별 시수 "+result.data.hours+"건 등록");
      setPreview(null);setSelected([]);
      onImported(year);
      router.refresh();
      setOpen(false);
    }else setMessage("등록 실패 · "+result.error+
      " (원본 자료와 기존 등록 자료는 변경하지 않았습니다.)");
    setBusy(false);
  }
  return <section className="cx-import no-print">
    <div className="cx-import-head">
      <div><strong><FileSpreadsheet size={16}/> 실제 학교 교육과정 엑셀 가져오기</strong>
        <p>신입생 3개년·당해연도 편성표를 자동 인식해 확인한 과목만 신규 등록합니다. 기존 시수는 덮어쓰지 않습니다.</p>
      </div>
      <div className="cx-import-actions">
        <button type="button" onClick={()=>setOpen((value)=>!value)}>{open?"가져오기 닫기":"엑셀 등록 열기"}</button>
        {open&&<><input type="file" ref={picker} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only" onChange={(event)=>void uploaded(event.target.files?.[0])} disabled={!editable||busy||disabled}/>
          <button type="button" disabled={!editable||busy||disabled} onClick={()=>picker.current?.click()}>
            <Upload size={14}/> 파일 선택
          </button></>}
      </div>
    </div>
    {open&&<>
      {!editable&&<p className="cx-import-note">조회 권한에서는 업로드할 수 없습니다.</p>}
      {disabled&&<p className="cx-import-note">저장하지 않은 편성표 변경을 먼저 저장해 주세요.</p>}
      {message&&<p className="cx-import-note" role="status">{message}</p>}
      {preview&&<div className="cx-import-content">
        <div className="cx-import-fields">
          <strong>{preview.filename}</strong>
          <label>편성표 유형<select value={kind} onChange={(e)=>setKind(e.target.value as "cohort"|"operating")}>
            <option value="cohort">신입생 3개년 교육과정</option>
            <option value="operating">당해연도 교육과정</option>
          </select></label>
          <label>기준 학년도<input type="number" min={2000} max={2100}
            value={year} onChange={(e)=>setYear(Number(e.target.value))}/></label>
          <span>인식 {preview.courses.length}개 항목 · 선택 {selected.length}개</span>
        </div>
        {!!preview.errors.length&&<div className="cx-import-errors" role="alert">
          {preview.errors.map((item,i)=><p key={i}>{item}</p>)}
        </div>}
        {!!preview.warnings.length&&<div className="cx-import-warnings">
          <strong>원본 검토 사항 {preview.warnings.length}건</strong>
          {preview.warnings.slice(0,12).map((item,i)=><p key={i}>{item}</p>)}
          {preview.warnings.length>12&&<p>그 외 {preview.warnings.length-12}건</p>}
          <label><input type="checkbox" checked={ack} onChange={(e)=>setAck(e.target.checked)}/>
            원본과 표시 시수의 차이를 확인했으며, 선택 항목의 입력값을 그대로 등록합니다.</label>
        </div>}
        <div className="cx-import-selection">
          <button onClick={()=>setSelected(preview.courses.map((_,i)=>i))}>전체 선택</button>
          <button onClick={()=>setSelected([])}>전체 해제</button>
        </div>
        <div className="cx-import-table-scroll">
          <table><thead><tr><th>선택</th><th>원본 행</th><th>교과군</th><th>과목·활동</th>
            {c.grades.flatMap((g)=>[1,2].map((sem)=><th key={g+"-"+sem}>{g}-{sem} 시수</th>))}
          </tr></thead><tbody>{preview.courses.map((course,i)=><tr key={course.row}>
            <td><input type="checkbox" checked={selected.includes(i)}
              onChange={(event)=>setSelected((ids)=>event.target.checked?[...ids,i]:ids.filter((n)=>n!==i))}/></td>
            <td>{course.row}</td>
            <td><input aria-label={course.name+" 교과군"} value={course.group}
              onChange={(event)=>patch(i,{group:event.target.value})}/></td>
            <td><input aria-label={"과목명 "+course.row+"행"} value={course.name}
              onChange={(event)=>patch(i,{name:event.target.value})}/></td>
            {c.grades.flatMap((grade)=>[1,2].map((sem)=>{
              const term=course.terms.find((item)=>item.grade===grade&&item.semester===sem);
              return <td key={grade+"-"+sem} title={term?
                "기본 "+(term.sourceTotal??"—")+"시간 · 조정 "+term.adjustment+"시간":undefined}>
                {term?term.final:"—"}
              </td>;
            }))}
          </tr>)}</tbody></table>
        </div>
        <div className="cx-import-footer">
          <span>기존 등록 시수와 겹치는 항목은 자동으로 덮어쓰지 않고 등록을 중단합니다.</span>
          <button type="button" className="cx-import-apply" onClick={()=>void apply()}
            disabled={!editable||disabled||busy||preview.errors.length>0||!selected.length||preview.warnings.length>0&&!ack}>
            <CheckCircle2 size={15}/>{busy?"등록 중…":selected.length+"개 항목 검토 후 등록"}
          </button>
        </div>
      </div>}
    </>}
  </section>;
}

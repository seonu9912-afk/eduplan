"use client";
import {useState} from "react";
import {ArrowDown,ArrowUp,Check,Pencil,X} from "lucide-react";
import type {Context} from "@/lib/models";
import {orderedCurriculumSubjects} from "@/lib/curriculum-group-order";
import {
  renameCurriculumSubjectV4,reorderCurriculumSubjectsV4,
} from "@/app/curriculum-subject-v4-actions";

export function CurriculumRowSubjectV4({context:c,subjectId,disabled,onSaved}:{
  context:Context;subjectId:string;disabled:boolean;onSaved:()=>void;
}){
  const subject=c.subjects.find(s=>s.id===subjectId);
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(subject?.name??"");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  if(!subject)return <span>등록되지 않은 과목</span>;
  const groupId=subject.group_id;
  const group=orderedCurriculumSubjects(c.subjects,c.groups)
    .filter(row=>row.group_id===subject.group_id);
  const index=group.findIndex(row=>row.id===subject.id);
  async function rename(){
    if(busy||!name.trim())return;
    setBusy(true);setError("");
    const result=await renameCurriculumSubjectV4({workspaceId:c.workspace.id,
      subjectId,name:name.trim()});
    setBusy(false);
    if(result.ok){setEditing(false);onSaved();}
    else setError(result.error);
  }
  async function move(step:-1|1){
    if(busy||disabled||index+step<0||index+step>=group.length)return;
    const ids=group.map(row=>row.id);
    [ids[index],ids[index+step]]=[ids[index+step],ids[index]];
    setBusy(true);setError("");
    const result=await reorderCurriculumSubjectsV4({workspaceId:c.workspace.id,
      groupId,ordered:ids});
    setBusy(false);
    if(result.ok)onSaved();else setError(result.error);
  }
  return <span className="cv4-subject-inline">
    {editing?<span className="cv4-subject-edit">
      <input autoFocus value={name} maxLength={60} aria-label="교과목 이름 변경"
        onChange={e=>setName(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void rename();}
          if(e.key==="Escape"){setEditing(false);setName(subject.name);}}}/>
      <button type="button" disabled={busy||!name.trim()} title="이름 저장" onClick={()=>void rename()}>
        <Check size={12}/></button>
      <button type="button" title="취소" onClick={()=>{setEditing(false);setName(subject.name);}}>
        <X size={12}/></button>
    </span>:<>
      <span className="cv4-subject-label">{subject.name}</span>
      {!disabled&&<span className="cv4-subject-actions no-print">
        <button type="button" disabled={busy} title="과목 이름 수정"
          onClick={()=>{setName(subject.name);setEditing(true);}}><Pencil size={12}/></button>
        <button type="button" disabled={busy||index===0} title="위로 이동"
          onClick={()=>void move(-1)}><ArrowUp size={12}/></button>
        <button type="button" disabled={busy||index===group.length-1} title="아래로 이동"
          onClick={()=>void move(1)}><ArrowDown size={12}/></button>
      </span>}
    </>}
    {error&&<small className="cv4-subject-error" role="alert">{error}</small>}
  </span>;
}

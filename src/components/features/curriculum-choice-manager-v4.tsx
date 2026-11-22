"use client";
import {useState} from "react";
import {Plus,Trash2,TriangleAlert} from "lucide-react";
import type {Context} from "@/lib/models";
import type {CurriculumDocument,CohortChoiceSet} from "@/lib/curriculum-design";
import {evaluateCell} from "@/lib/curriculum-design";

export function CohortChoiceManager({context:c,doc,editable,onEdit}:{
  context:Context;doc:CurriculumDocument;editable:boolean;
  onEdit:(next:CurriculumDocument)=>void;
}){
  const [open,setOpen]=useState(false);
  const [name,setName]=useState("");
  const [grade,setGrade]=useState(1);
  const [semester,setSemester]=useState(1);
  const [selected,setSelected]=useState<string[]>([]);
  const [requiredCount,setRequiredCount]=useState(1);
  const [error,setError]=useState("");
  const groups=doc.choiceSets??[];
  const byId=new Map(c.subjects.map(subject=>[subject.id,subject]));
  function add(){
    setError("");
    if(name.trim().length<1||selected.length<2||!Number.isInteger(requiredCount)||requiredCount<1||requiredCount>=selected.length){
      setError("과목군 이름과 선택 과목 수를 확인해 주세요.");return;
    }
    if(selected.some(id=>(doc.excludedSubjectIds??[]).includes(id)||groups.some(g=>
      g.grade===grade&&g.semester===semester&&g.subjectIds.includes(id)))){
      setError("운영 제외 과목이나 같은 학기의 다른 선택과목군에 속한 과목은 중복 배정할 수 없습니다.");return;
    }
    const choice:CohortChoiceSet={id:crypto.randomUUID(),name:name.trim(),grade,semester,
      subjectIds:[...selected],requiredCount};
    onEdit({...doc,choiceSets:[...groups,choice]});setOpen(false);setName("");setSelected([]);
  }
  function check(choice:CohortChoiceSet):string|null{
    const rows=choice.subjectIds.map(id=>doc.cells.find(c=>
      c.subjectId===id&&c.grade===choice.grade&&c.semester===choice.semester));
    if(rows.some(x=>!x))return "해당 과목의 시수가 입력되지 않았습니다.";
    const hours=rows.map(c=>evaluateCell(doc,c!).total);
    if(hours.some(n=>Math.abs(n-hours[0])>0.000001))return "선택과목별 이수시수가 서로 달라 검증이 필요합니다.";
    return null;
  }
  return <section className="cv4-choices" id="curriculum-choices">
    <div className="cv4-choices-head"><div><h3>선택과목군 · 학생 선택 경로</h3>
      <p>동시에 개설되는 과목 중 실제 선택 수를 지정합니다. 학생 이수시수는 과목을 단순 합산하지 않습니다.</p></div>
      {editable&&<button type="button" onClick={()=>setOpen(!open)}><Plus size={13}/>선택과목군 추가</button>}
    </div>
    <div className="cv4-choice-list">
      {groups.length?groups.map(choice=>{
        const warning=check(choice);
        return <article key={choice.id}>
          <strong>{choice.name}</strong>
          <span>{choice.grade}학년 {choice.semester}학기 · {choice.subjectIds.length}개 중 {choice.requiredCount}개 선택</span>
          <small>{choice.subjectIds.map(id=>byId.get(id)?.name??"등록되지 않은 과목").join(" · ")}</small>
          {warning&&<p className="cv4-choice-warn"><TriangleAlert size={12}/>{warning}</p>}
          {editable&&<button type="button" onClick={()=>{
            if(window.confirm(choice.name+" 선택과목군을 삭제할까요?"))onEdit({...doc,choiceSets:groups.filter(x=>x.id!==choice.id)});
          }}><Trash2 size={13}/>삭제</button>}
        </article>;
      }):<p className="cv4-choice-empty">선택과목군이 아직 없습니다. 여러 과목 중 학생이 일부만 선택해 수강하는 경우 등록해 주세요.</p>}
    </div>
    {open&&editable&&<div className="cv4-choice-editor no-print">
      {error&&<p role="alert">{error}</p>}
      <input type="text" maxLength={100} placeholder="선택과목군 이름" value={name} onChange={e=>setName(e.target.value)}/>
      <select value={grade} onChange={e=>setGrade(Number(e.target.value))}>
        {c.grades.map(g=><option key={g} value={g}>{g}학년</option>)}</select>
      <select value={semester} onChange={e=>setSemester(Number(e.target.value))}>
        {[1,2].map(s=><option key={s} value={s}>{s}학기</option>)}</select>
      <label>선택 수 <input type="number" min={1} max={10} value={requiredCount}
        onChange={e=>setRequiredCount(Number(e.target.value))}/></label>
      <div className="cv4-choice-options">{c.subjects.filter(s=>!(doc.excludedSubjectIds??[]).includes(s.id)).map(s=><label key={s.id}>
        <input type="checkbox" checked={selected.includes(s.id)}
          onChange={e=>setSelected(list=>e.target.checked?[...list,s.id]:list.filter(id=>id!==s.id))}/>
        {s.name}</label>)}</div>
      <button type="button" disabled={!name.trim()||selected.length<2||requiredCount>=selected.length}
        onClick={add}>과목군 생성</button>
      <button type="button" onClick={()=>setOpen(false)}>취소</button>
    </div>}
  </section>;
}

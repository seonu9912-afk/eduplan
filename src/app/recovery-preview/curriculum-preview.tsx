"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CurriculumSimpleV5 } from "@/components/features/curriculum-simple-v5";
import type { SchoolType } from "@/lib/domain";
import { createCurriculumPreviewStore } from "./curriculum-store";
import "@/components/features/curriculum-enhanced.css";
import "@/components/features/curriculum-workbench.css";
import "@/components/features/curriculum-simple-v5.css";

/** Synthetic browser-only rehearsal. Never calls authenticated server actions. */
function SchoolPreview({school,onDirtyChange}:{school:SchoolType;onDirtyChange:(dirty:boolean)=>void}){
  const store=useMemo(()=>createCurriculumPreviewStore(school,{
    getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),
  }),[school]);
  const context=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getServerSnapshot);
  if(!context)return <p>저장한 실습 과목 목록을 불러오는 중입니다.</p>;
  return <CurriculumSimpleV5 context={context} initialCohort="2027" actions={store.actions}
    catalogActions={store.catalogActions} catalogEditable={false} onRefresh={store.refresh} onDirtyChange={onDirtyChange}/>;
}
export function CurriculumPreview() {
  const [school, setSchool] = useState<"초등학교" | "중학교" | "고등학교">("중학교");
  const [dirty, setDirty] = useState(false);
  return <>
    <div className="page-heading">
      <div><h1>교육과정 편성 실습</h1>
        <p>가상 학교 자료입니다. 입력값은 이 브라우저에만 저장되며 실제 학교 자료에 반영되지 않습니다.</p>
        <p>과목 선택·추가 → 시수 입력 → 교육과정표 확인을 실습할 수 있습니다. 처음에는 빈 편성으로 시작하며, 이전에 저장한 실습 입력은 유지됩니다.</p></div>
      <label>학교급 <select aria-label="실습 학교급" value={school} onChange={e => {
        if (!dirty || window.confirm("저장되지 않은 실습 내용을 버리고 학교급을 바꿀까요?"))
          setSchool(e.target.value as typeof school);
      }}>
        {["초등학교", "중학교", "고등학교"].map(level => <option key={level}>{level}</option>)}
      </select></label>
    </div>
    <SchoolPreview key={school} school={school} onDirtyChange={setDirty}/>
  </>;
}

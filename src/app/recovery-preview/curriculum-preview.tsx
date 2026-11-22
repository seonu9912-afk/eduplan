"use client";

import { useMemo, useState } from "react";
import { CurriculumEnhanced, type CurriculumDesignActions } from "@/components/features/curriculum-enhanced";
import { validateDocument, type CurriculumDocument } from "@/lib/curriculum-design";
import { curriculumPreviewContext, readCurriculumPreview } from "./curriculum-fixture";
import "@/components/features/curriculum-enhanced.css";
import "@/components/features/curriculum-workbench.css";
import "@/components/features/curriculum-simple-v5.css";

/** Synthetic browser-only rehearsal. Never calls authenticated server actions. */
export function CurriculumPreview() {
  const [school, setSchool] = useState<"초등학교" | "중학교" | "고등학교">("중학교");
  const [dirty, setDirty] = useState(false);
  const context = useMemo(() => curriculumPreviewContext(school), [school]);
  const actions = useMemo<CurriculumDesignActions>(() => {
    const key = "eduplan-curriculum-rehearsal-v1:" + school;
    const read = () => readCurriculumPreview(context, localStorage.getItem(key));
    return {
      load: async () => ({ ok: true, data: { ...read(), lock: null, snapshots: [] } }),
      claim: async () => ({ ok: true, data: { acquired: true } }),
      save: async input => {
        const v = input as { document: CurriculumDocument; expectedPlanVersion: number; expectedDocVersion: number };
        // Keep edits responsive while the same save lifecycle is exercised.
        await new Promise(resolve => setTimeout(resolve, 250));
        const old = read();
        if (v.expectedPlanVersion !== old.planVersion || v.expectedDocVersion !== old.documentVersion)
          return { ok: false, error: "다른 창에서 실습 편성표가 변경되었습니다. 최신 저장본을 확인해 주세요." };
        const errors = validateDocument(context, v.document);
        if (errors.length) return { ok: false, error: errors[0] };
        const saved = { document: v.document, planVersion: old.planVersion + 1, documentVersion: old.documentVersion + 1 };
        localStorage.setItem(key, JSON.stringify(saved));
        return { ok: true, data: { ok: true, planVersion: saved.planVersion, documentVersion: saved.documentVersion } };
      },
      confirm: async () => ({ ok: false, error: "실습 화면에서는 학교 확정본을 만들지 않습니다. 실제 확정은 학교 작업공간에서 진행하세요." }),
    };
  }, [context, school]);
  return <>
    <div className="page-heading">
      <div><h1>교육과정 편성 실습</h1>
        <p>가상 학교 자료입니다. 입력값은 이 브라우저에만 저장되며 실제 학교 자료에 반영되지 않습니다.</p>
        <p>{school === "중학교"
          ? "학교 편성표의 교과·선택과목·창체와 일반학기 시수를 바탕으로 한 실습 예시입니다. 자유학기 조정과 원본의 별도 총계는 적용하지 않았습니다."
          : "학교급별 교과군·과목과 학기별 배당을 살펴보는 실습 예시입니다. 학교별 개설 과목과 배당은 달라질 수 있습니다."}
          {" "}예시 배당은 법정 기준 충족이나 학교의 확정 편성안을 뜻하지 않습니다.</p></div>
      <label>학교급 <select aria-label="실습 학교급" value={school} onChange={e => {
        if (!dirty || window.confirm("저장되지 않은 실습 내용을 버리고 학교급을 바꿀까요?"))
          setSchool(e.target.value as typeof school);
      }}>
        {["초등학교", "중학교", "고등학교"].map(level => <option key={level}>{level}</option>)}
      </select></label>
    </div>
    <CurriculumEnhanced key={school} context={context} view="cohort" cohort={2027}
      actions={actions} catalogEditable={false} onDirtyChange={setDirty} />
  </>;
}

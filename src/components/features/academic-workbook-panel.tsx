"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineNotice, useMutation } from "@/components/common";
import { downloadBlob } from "@/lib/academic-files";
import { buildAcademicWorkbook, serializeAcademicWorkbook, type ExportData } from "@/lib/academic-workbook";
import type { AnnualPlan } from "@/lib/academic";
import type { AcademicConfirmation } from "@/lib/academic-confirmation";

export function AcademicWorkbookPanel({ year, plan, context, currentStatus, confirmed }: {
  year: number;
  plan: AnnualPlan;
  context: ExportData;
  currentStatus: string;
  confirmed: AcademicConfirmation | null;
}) {
  const [paper, setPaper] = useState<"A3" | "A4">("A3");
  const [semester, setSemester] = useState(0);
  const [grade, setGrade] = useState(0);
  const [useConfirmed, setUseConfirmed] = useState(false);
  const mutation = useMutation();
  return (
    <section className="panel annual-section">
      <h2>통합 Excel</h2>
      <p>연간 학사력, 행사 목록, 시수 확보 현황을 한 파일로 받습니다.</p>
      <div className="annual-form-grid">
        <label className="annual-field">출력할 편성안
          <select value={useConfirmed && confirmed ? "confirmed" : "current"} onChange={(e) => setUseConfirmed(e.target.value === "confirmed")}>
            <option value="current">현재 편성안</option>
            {confirmed && <option value="confirmed">마지막 확정본</option>}
          </select>
        </label>
        <label className="annual-field">인쇄 용지
          <select value={paper} onChange={(e) => setPaper(e.target.value === "A4" ? "A4" : "A3")}>
            <option value="A3">A3 가로 1페이지</option><option value="A4">A4 가로 2페이지</option>
          </select>
        </label>
        <label className="annual-field">행사 및 시수 학기
          <select value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
            <option value={0}>전체 학기</option><option value={1}>1학기</option><option value={2}>2학기</option>
          </select>
        </label>
        <label className="annual-field">행사 및 시수 학년
          <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
            <option value={0}>전체 학년</option>
            {(useConfirmed && confirmed ? confirmed.source.grades : context.grades).map((g) =>
              <option key={g} value={g}>{g}학년</option>)}
          </select>
        </label>
      </div>
      <Button disabled={mutation.pending} onClick={() => mutation.execute(async () => {
        try {
          const snapshot = useConfirmed ? confirmed : null;
          const source = snapshot?.source ?? context;
          const workbook = await buildAcademicWorkbook(year, snapshot?.document ?? plan, source,
            { paper, grade: source.grades.includes(grade) ? grade : 0, semester },
            snapshot ? "확정 " + snapshot.at.slice(0, 10) : currentStatus);
          const buffer = await serializeAcademicWorkbook(workbook,paper);
          downloadBlob(new Uint8Array(buffer), `${year}_통합학사일정.xlsx`,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          return { ok: true, data: undefined };
        } catch {
          return { ok: false, error: "Excel 파일을 만들지 못했습니다. 다시 시도해 주세요." };
        }
      })}>통합 Excel 저장</Button>
      <InlineNotice mutation={mutation} />
    </section>
  );
}

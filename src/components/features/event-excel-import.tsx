"use client";

import { useRef, useState } from "react";
import type { Context } from "@/lib/models";
import type { AnnualPlan } from "@/lib/academic";
import type { CalendarChange } from "@/lib/academic-calendar";
import type { ExcelEventPreview } from "@/lib/event-excel";

export function EventExcelImport({ context, plan, disabled, onSave }: {
  context: Context; plan: AnnualPlan; disabled: boolean;
  onSave: (changes: CalendarChange[]) => Promise<boolean>;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ExcelEventPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const locked = busy || disabled;
  async function download() {
    if (!context.year || busy) return;
    setBusy(true); setStatus("");
    try {
      const { createEventExcelTemplate, XLSX_MIME } = await import("@/lib/event-excel");
      const { downloadBlob } = await import("@/lib/academic-files");
      const buffer = await createEventExcelTemplate(context.year.year, context.grades);
      downloadBlob(buffer, String(context.year.year) + "학년도_행사등록양식.xlsx", XLSX_MIME);
    } catch {
      setStatus("양식을 만들지 못했습니다. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }
  async function uploaded(file: File | undefined) {
    if (!file || disabled) return;
    setBusy(true); setStatus(""); setPreview(null); setAcknowledged(false);
    try {
      const { parseEventExcel, EVENT_EXCEL_MAX_BYTES } = await import("@/lib/event-excel");
      if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > EVENT_EXCEL_MAX_BYTES) {
        setStatus("2MB 이하의 .xlsx 엑셀 양식을 선택해 주세요."); return;
      }
      const result = await parseEventExcel(new Uint8Array(await file.arrayBuffer()), context, file.name);
      setPreview(result);
      if (result.errors.length) setStatus("아래 오류를 수정한 뒤 다시 업로드해 주세요.");
      else setStatus("등록할 내용을 확인한 뒤 일괄 저장해 주세요.");
    } catch {
      setStatus("파일을 읽지 못했습니다. 다운로드한 양식인지 확인해 주세요.");
    } finally {
      if (picker.current) picker.current.value = "";
      setBusy(false);
    }
  }
  async function save() {
    if (locked || !preview || preview.errors.length || !preview.events.length ||
        (preview.warnings.length && !acknowledged)) return;
    setBusy(true); setStatus("");
    try {
      const { eventImportChanges } = await import("@/lib/event-excel");
      if (preview.events.some((event) => context.events.some((existing) =>
        existing.title.trim() === event.title && existing.start_date === event.start_date &&
        existing.end_date === event.end_date))) {
        setStatus("업로드 이후 동일한 행사가 등록됐습니다. 엑셀 파일을 다시 검토해 주세요.");
        return;
      }
      const changes = eventImportChanges(preview.events, context, plan);
      const succeeded = await onSave(changes);
      if (succeeded) {
        setPreview(null);
        setStatus("행사 " + changes.length + "건을 일괄 등록했습니다.");
      } else setStatus("저장하지 못했습니다. 위쪽 오류 또는 충돌 메시지를 확인해 주세요.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "행사를 저장하지 못했습니다.");
    } finally { setBusy(false); }
  }
  return <section className="ar-panel ar-excel-panel" aria-label="엑셀로 행사 일괄 등록">
    <div className="ar-excel-header">
      <div>
        <h3>엑셀 일괄 등록</h3>
        <p className="ar-muted">양식에 행사와 교시 편성을 작성한 뒤 업로드하세요. 기존 행사는 변경하지 않습니다.</p>
      </div>
      <div className="ar-excel-actions">
        <button type="button" disabled={busy} onClick={download}>엑셀 양식 다운로드</button>
        <button type="button" disabled={locked} onClick={() => picker.current?.click()}>엑셀 업로드</button>
        <input ref={picker} className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="행사 등록 엑셀 파일 선택" disabled={locked}
          onChange={(event) => void uploaded(event.target.files?.[0])}/>
      </div>
    </div>
    {disabled && <p className="ar-muted">다른 행사에 저장하지 않은 변경이 있거나 저장 중이면, 먼저 해당 내용을 저장해 주세요.</p>}
    {!!status && <p className="ar-excel-status" role="status">{status}</p>}
    {preview && <div className="ar-excel-preview">
      <div className="ar-line">
        <strong>{preview.filename} · 행사 {preview.events.length}건 · 교시 편성 {preview.periodRows}행</strong>
        <button type="button" disabled={busy} onClick={() => { setPreview(null); setStatus(""); }}>닫기</button>
      </div>
      {!!preview.errors.length && <div role="alert" className="ar-excel-errors">
        <strong>수정할 오류 {preview.errors.length}건</strong>
        {preview.errors.slice(0, 20).map((error, index) => <p key={index}>{error}</p>)}
        {preview.errors.length > 20 && <p>외 {preview.errors.length - 20}건. 파일 내용을 확인해 주세요.</p>}
      </div>}
      {!preview.errors.length && <>
        <div className="ar-excel-items" aria-label="등록 미리보기">
          {preview.events.slice(0, 20).map((event) => <div key={event.id} className="ar-excel-item">
            <span>{event.start_date === event.end_date ? event.start_date : event.start_date + " ~ " + event.end_date}</span>
            <strong>{event.title}</strong>
            <span>{event.department}</span>
            <span>{event.target_grades.map((grade) => grade + "학년").join(", ")}</span>
          </div>)}
          {preview.events.length > 20 && <p className="ar-muted">외 {preview.events.length - 20}건</p>}
        </div>
        {!!preview.warnings.length && <div className="ar-excel-warnings">
          <strong>중복 가능성 확인 {preview.warnings.length}건</strong>
          {preview.warnings.slice(0, 10).map((warning, index) => <p key={index}>{warning}</p>)}
          <label className="ar-check"><input type="checkbox" checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}/>중복 가능성을 확인했고, 신규 행사로 등록하겠습니다.</label>
        </div>}
        <div className="ar-excel-footer"><button type="button" className="ar-primary" disabled={locked ||
          (preview.warnings.length > 0 && !acknowledged)} onClick={() => void save()}>
          {busy ? "처리 중…" : "검토한 " + preview.events.length + "건 일괄 저장"}
        </button></div>
      </>}
    </div>}
  </section>;
}

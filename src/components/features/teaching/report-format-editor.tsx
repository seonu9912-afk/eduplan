"use client";
import { useRef, useState } from "react";
import { ArrowUp, ArrowDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  defaultReportFormat,
  reportFormatSchema,
  validFormat,
  type ReportFormat,
} from "@/lib/teaching-format";
import { buildTeachingReport, type ReportMode } from "@/lib/teaching-report";
import type { TeachingDocument } from "@/lib/teaching";
import type { Context, Row } from "@/lib/models";
export function saveDownload(data: Blob, name: string) {
  const url = URL.createObjectURL(data),
    a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ReportFormatEditor({
  context,
  course,
  document: doc,
  printDocument,
  dirty,
  editable,
  onChange,
}: {
  context: Context;
  course: Row<"teaching_courses">;
  document: TeachingDocument;
  printDocument?: TeachingDocument;
  dirty: boolean;
  editable: boolean;
  onChange: (v: NonNullable<TeachingDocument["report"]>) => void;
}) {
  const value = doc.report ?? {
      weekly_hours: null,
      format: defaultReportFormat(),
    },
    f = value.format;
  const [exporting, setExporting] = useState(false),
    [notice, setNotice] = useState(""),
    [mode, setMode] = useState<ReportMode>("both");
  const file = useRef<HTMLInputElement>(null);
  const change = (next: Partial<ReportFormat>) =>
    onChange({ ...value, format: { ...f, ...next } });
  const move = (
    key: "lesson_columns" | "sections",
    index: number,
    delta: number,
  ) => {
    if (key === "lesson_columns") {
      const rows = [...f[key]];
      [rows[index], rows[index + delta]] = [rows[index + delta], rows[index]];
      change({ lesson_columns: rows });
    } else {
      const rows = [...f[key]];
      [rows[index], rows[index + delta]] = [rows[index + delta], rows[index]];
      change({ sections: rows });
    }
  };
  const download = async () => {
    setExporting(true);
    setNotice("");
    try {
      if (!validFormat(f))
        throw new Error("출력할 열과 항목을 하나 이상 선택하세요.");
      const { exportTeachingHwpx } = await import("@/lib/teaching-hwpx");
      const report = buildTeachingReport(context, course, printDocument ?? doc, mode, dirty);
      const bytes = await exportTeachingHwpx(report);
      saveDownload(
        new Blob([new Uint8Array(bytes)], { type: "application/hwp+zip" }),
        `${report.title}${mode === "both" ? "" : mode === "lesson" ? "_수업" : "_평가"}.hwpx`,
      );
      setNotice(
        "HWPX를 내려받았습니다. 한글에서 표와 내용을 편집할 수 있습니다.",
      );
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "HWPX 생성에 실패했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className="report-format panel">
      <div className="section-title">
        <div>
          <h3>학교 제출용 HWPX</h3>
          <p>학교에 맞게 서식을 조정한 뒤 계획과 함께 저장하세요.</p>
        </div>
        <div className="teaching-actions">
          <label>
            출력 범위
            <select
              aria-label="HWPX 출력 범위"
              value={mode}
              onChange={(e) => setMode(e.target.value as ReportMode)}
            >
              <option value="both">수업·평가 통합</option>
              <option value="lesson">교수학습계획</option>
              <option value="assessment">평가계획</option>
            </select>
          </label>
          <Button onClick={download} disabled={exporting}>
            <Download />
            {exporting ? "HWPX 만드는 중…" : "HWPX 다운로드"}
          </Button>
        </div>
      </div>
      {dirty && (
        <p className="info-box">
          현재 입력 내용으로 출력하며 문서에 미저장 초안 표시가 들어갑니다.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <details>
        <summary>학교별 출력 서식 설정</summary>
        <div className="report-field-grid">
          <label>
            서식 이름
            <input
              aria-label="서식 이름"
              value={f.name}
              maxLength={160}
              disabled={!editable}
              onChange={(e) => change({ name: e.target.value })}
            />
          </label>

          {(["lesson", "assessment"] as const).map((key) => (
            <div key={key} className="report-field-grid">
              <label>
                {key === "lesson" ? "수업 문서 제목" : "평가 문서 제목"}
                <input
                  aria-label={`${key === "lesson" ? "수업" : "평가"} 문서 제목`}
                  value={f[`${key}_title`]}
                  maxLength={160}
                  disabled={!editable}
                  onChange={(e) => change({ [`${key}_title`]: e.target.value })}
                />
              </label>
              <label>
                용지 방향
                <select
                  aria-label={`${key === "lesson" ? "수업" : "평가"} 용지 방향`}
                  value={f[`${key}_orientation`]}
                  disabled={!editable}
                  onChange={(e) =>
                    change({ [`${key}_orientation`]: e.target.value })
                  }
                >
                  <option value="landscape">A4 가로</option>
                  <option value="portrait">A4 세로</option>
                </select>
              </label>
            </div>
          ))}
        </div>
        <h4>주차별 수업표 · 표시할 열과 순서</h4>
        <p className="muted">
          숨긴 열의 입력 내용은 유지됩니다. 너비는 다른 열과 비교한 비율입니다.
        </p>
        {f.lesson_columns.map((col, i) => (
          <div className="format-row" key={col.key}>
            <label className="format-toggle">
              <input
                type="checkbox"
                checked={col.enabled}
                disabled={
                  !editable ||
                  (col.enabled &&
                    f.lesson_columns.filter((c) => c.enabled).length === 1)
                }
                aria-label={`${col.label} 열 표시`}
                onChange={(e) =>
                  change({
                    lesson_columns: f.lesson_columns.map((c, n) =>
                      n === i ? { ...c, enabled: e.target.checked } : c,
                    ),
                  })
                }
              />
              표시
            </label>
            <input
              aria-label={`${col.key} 열 이름`}
              value={col.label}
              maxLength={160}
              disabled={!editable}
              onChange={(e) =>
                change({
                  lesson_columns: f.lesson_columns.map((c, n) =>
                    n === i ? { ...c, label: e.target.value } : c,
                  ),
                })
              }
            />
            <input
              aria-label={`${col.key} 열 너비`}
              type="number"
              min={1}
              max={100}
              value={col.width}
              disabled={!editable}
              onChange={(e) =>
                change({
                  lesson_columns: f.lesson_columns.map((c, n) =>
                    n === i
                      ? {
                          ...c,
                          width: Math.min(
                            100,
                            Math.max(1, Number(e.target.value)),
                          ),
                        }
                      : c,
                  ),
                })
              }
            />
            <div className="row-tools">
              <button
                disabled={!editable || i === 0}
                aria-label={`${col.label} 열 위로`}
                onClick={() => move("lesson_columns", i, -1)}
              >
                <ArrowUp />
              </button>
              <button
                disabled={!editable || i === f.lesson_columns.length - 1}
                aria-label={`${col.label} 열 아래로`}
                onClick={() => move("lesson_columns", i, 1)}
              >
                <ArrowDown />
              </button>
            </div>
          </div>
        ))}
        <h4>평가계획 · 항목 제목과 순서</h4>
        {f.sections.map((s, i) => (
          <div className="format-row format-section" key={s.key}>
            <label className="format-toggle">
              <input
                type="checkbox"
                checked={s.enabled}
                disabled={
                  !editable ||
                  (s.enabled &&
                    f.sections.filter((s) => s.enabled).length === 1)
                }
                aria-label={`${s.title} 항목 표시`}
                onChange={(e) =>
                  change({
                    sections: f.sections.map((v, n) =>
                      n === i ? { ...v, enabled: e.target.checked } : v,
                    ),
                  })
                }
              />
              표시
            </label>
            <input
              aria-label={`${s.key} 항목 제목`}
              value={s.title}
              maxLength={160}
              disabled={!editable}
              onChange={(e) =>
                change({
                  sections: f.sections.map((v, n) =>
                    n === i ? { ...v, title: e.target.value } : v,
                  ),
                })
              }
            />
            <div className="row-tools">
              <button
                disabled={!editable || i === 0}
                aria-label={`${s.title} 항목 위로`}
                onClick={() => move("sections", i, -1)}
              >
                <ArrowUp />
              </button>
              <button
                disabled={!editable || i === f.sections.length - 1}
                aria-label={`${s.title} 항목 아래로`}
                onClick={() => move("sections", i, 1)}
              >
                <ArrowDown />
              </button>
            </div>
          </div>
        ))}
        <label className="assessment-notes">
          문서 끝 안내문
          <textarea
            aria-label="문서 끝 안내문"
            maxLength={1000}
            rows={2}
            value={f.footer}
            disabled={!editable}
            onChange={(e) => change({ footer: e.target.value })}
          />
        </label>
        <div className="teaching-actions">
          <Button
            variant="outline"
            onClick={() =>
              saveDownload(
                new Blob([JSON.stringify(f, null, 2)], {
                  type: "application/json",
                }),
                `${f.name}.eduplan-format.json`,
              )
            }
          >
            서식 파일 저장
          </Button>
          <Button
            variant="outline"
            disabled={!editable}
            onClick={() => file.current?.click()}
          >
            서식 파일 가져오기
          </Button>
          <Button
            variant="ghost"
            disabled={!editable}
            onClick={() => {
              if (
                window.confirm(
                  "출력 서식을 기본 구성으로 되돌릴까요? 계획 내용은 유지됩니다.",
                )
              )
                change(defaultReportFormat());
            }}
          >
            기본 서식 복원
          </Button>
        </div>
        <p className="muted">
          서식 파일에는 제목·열·항목 설정만 담깁니다. 다른 계획에서 가져오거나
          수업 복사로 재사용할 수 있습니다.
        </p>
        <input
          ref={file}
          hidden
          type="file"
          accept=".json"
          onChange={async (e) => {
            const input = e.currentTarget,
              selected = input.files?.[0];
            if (!selected) return;
            try {
              if (selected.size > 100000)
                throw new Error("서식 파일이 너무 큽니다.");
              const parsed = reportFormatSchema.safeParse(
                JSON.parse(await selected.text()),
              );
              if (!parsed.success || !validFormat(parsed.data))
                throw new Error("EduPlan 서식 파일의 구성을 확인해 주세요.");
              if (
                window.confirm(
                  `‘${parsed.data.name}’ 서식을 이 계획에 적용할까요?`,
                )
              ) {
                change(parsed.data);
                setNotice("서식을 적용했습니다. 계획 저장으로 반영하세요.");
              }
            } catch (e) {
              setNotice(
                e instanceof Error ? e.message : "서식을 가져오지 못했습니다.",
              );
            } finally {
              input.value = "";
            }
          }}
        />
      </details>
    </section>
  );
}

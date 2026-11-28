import type { Context, Row } from "@/lib/models";
import type { TeachingDocument } from "@/lib/teaching";
import { buildTeachingReport, type ReportMode } from "@/lib/teaching-report";
export function TeachingPrint({
  context,
  course,
  document,
  mode,
  dirty,
  preview = false,
}: {
  context: Context;
  course: Pick<Row<"teaching_courses">, "id" | "grade" | "semester" | "subject_name" | "teacher_name">;
  document: TeachingDocument;
  mode: ReportMode;
  dirty: boolean;
  preview?: boolean;
}) {
  const report = buildTeachingReport(context, course, document, mode, dirty);
  return (
    <div className={preview ? "teaching-report-preview" : "print-only teaching-print"}>
      {report.sections.map((section, i) => (
        <section
          key={i}
          className={`report-page report-${section.orientation}`}
        >
          <header>
            <h1>{section.title}</h1>
          </header>
          {section.blocks.map((block, j) =>
            block.kind === "table" ? (
              <table key={j}>
                <colgroup>
                  {block.widths.map((w, n) => (
                    <col
                      key={n}
                      style={{
                        width: `${(w / block.widths.reduce((a, b) => a + b, 0)) * 100}%`,
                      }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {block.headers.map((h, n) => (
                      <th key={n}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, col) => (
                        <td key={col}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : block.kind === "heading" ? (
              <h2 key={j}>{block.text}</h2>
            ) : (
              <p key={j}>{block.text}</p>
            ),
          )}
        </section>
      ))}
    </div>
  );
}

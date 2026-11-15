import type { Context, Row } from "./models";
import type {
  AssessmentItem,
  TeachingDocument,
  TeachingUnit,
} from "./teaching";
import { defaultReportFormat, emptyEvaluationDetail } from "./teaching-format";
import { assessmentChoices, linkedLessons } from "./teaching-authoring";

export type ReportMode = "lesson" | "assessment" | "both";
export type ReportBlock =
  | { kind: "heading" | "text"; text: string }
  | { kind: "table"; headers: string[]; widths: number[]; rows: string[][] };
export type ReportSection = {
  title: string;
  orientation: "landscape" | "portrait";
  blocks: ReportBlock[];
};
export type TeachingReport = { title: string; sections: ReportSection[] };
export function minimumRubricPoints(item: AssessmentItem): number | null {
  if (
    !item.rubric.length ||
    item.rubric.some(
      (r) => !r.levels.length || r.levels.some((l) => l.points === null),
    )
  )
    return null;
  return Number(
    item.rubric
      .reduce((sum, r) => sum + Math.min(...r.levels.map((l) => l.points!)), 0)
      .toFixed(4),
  );
}
export function unitDay(u: TeachingUnit) {
  return (
    u.day || (u.start ? [u.start, u.end].filter(Boolean).join(" ~ ") : u.period)
  );
}
const shown = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "미입력" : String(v);
export function buildTeachingReport(
  c: Context,
  course: Row<"teaching_courses">,
  doc: TeachingDocument,
  mode: ReportMode = "both",
  dirty = false,
): TeachingReport {
  const format = doc.report?.format ?? defaultReportFormat();
  const term = course.semester ? `${course.semester}학기` : "연간";
  const prefix = `${c.year!.year}학년도 ${course.grade}학년 ${term} ${course.subject_name}과`;
  const standardById = new Map(c.teaching?.standards.map((s) => [s.id, s]));
  const standards = (ids: string[]) =>
    ids
      .map((id) => {
        const s = standardById.get(id);
        return s
          ? `${s.code} ${s.content} (${s.curriculum_version})`
          : "성취기준 연결 확인 필요";
      })
      .join("\n\n");
  const tasks = new Map(
    assessmentChoices(doc).map(({ item }) => [item.id, item]),
  );
  const stageTitle = (a: AssessmentItem, id?: string | null) =>
    a.stages?.find((s) => s.id === id)?.title || "";
  const classes = c.classes
    .filter((cl) =>
      c.teaching?.classes.some(
        (l) => l.course_id === course.id && l.class_id === cl.id,
      ),
    )
    .map((cl) => `${cl.grade}-${cl.class_number}`)
    .join(", ");
  const table = (
    headers: string[],
    rows: string[][],
    widths?: number[],
  ): ReportBlock => ({
    kind: "table",
    headers,
    rows: rows.length ? rows : [headers.map(() => "미입력")],
    widths: widths ?? headers.map(() => 1),
  });
  const heading = (text: string): ReportBlock => ({ kind: "heading", text });
  const text = (value: string): ReportBlock => ({
    kind: "text",
    text: shown(value),
  });
  const common = (): ReportBlock[] => [
    table(
      ["학교명", "과목", "학년·학기", "주당 시수", "지도교사"],
      [
        [
          c.workspace.name,
          course.subject_name,
          `${course.grade}학년 ${term}`,
          shown(doc.report?.weekly_hours),
          course.teacher_name,
        ],
      ],
    ),
    ...(classes ? [text(`학급: ${classes}`)] : []),
    ...(dirty ? [text("미저장 초안 · 현재 화면의 입력 내용")] : []),
  ];
  const finish = (blocks: ReportBlock[]) =>
    format.footer ? [...blocks, text(format.footer)] : blocks;
  const sections: ReportSection[] = [];
  if (mode !== "assessment") {
    const cols = format.lesson_columns.filter((col) => col.enabled);
    const cell = (u: TeachingUnit, key: (typeof cols)[number]["key"]) => {
      if (key === "standards") return shown(standards(u.standard_ids));
      if (key === "day") return shown(unitDay(u));
      if (key === "alignment")
        return shown(
          [
            u.alignment,
            ...(u.assessment_links ?? []).map((l) => {
              const a = tasks.get(l.assessment_id);
              return [
                a?.name || "평가 연결 확인 필요",
                l.phase,
                a && stageTitle(a, l.stage_id),
              ]
                .filter(Boolean)
                .join(" · ");
            }),
          ]
            .filter(Boolean)
            .join("\n"),
        );
      if (key === "month")
        return shown(
          u.month || (u.start ? String(Number(u.start.slice(5, 7))) : ""),
        );
      return shown(u[key]);
    };
    sections.push({
      title: `${prefix} ${format.lesson_title}`,
      orientation: format.lesson_orientation,
      blocks: finish([
        ...common(),
        heading("교수학습-평가 방법"),
        table(
          cols.map((col) => col.label),
          doc.units.map((u) => cols.map((col) => cell(u, col.key))),
          cols.map((col) => col.width),
        ),
      ]),
    });
  }
  if (mode !== "lesson")
    for (const ev of doc.evaluations) {
      const d = ev.detail ?? emptyEvaluationDetail();
      const weighted = ev.mode === "weighted";
      const blocks: ReportBlock[] = common();
      for (const section of format.sections.filter((s) => s.enabled)) {
        if (section.key === "additional" && !d.additional.length && !ev.notes)
          continue;
        blocks.push(heading(section.title));
        switch (section.key) {
          case "purpose":
            blocks.push(
              heading("평가의 목적"),
              text(d.purpose),
              heading("평가의 기본 방향"),
              text(d.direction),
            );
            break;
          case "policy":
            blocks.push(
              text(d.policy),
              heading("미응시자·학적변동자 처리"),
              text(d.absence_policy),
            );
            break;
          case "criteria":
            blocks.push(
              weighted
                ? table(
                    ["성취도", "기준 성취율"],
                    d.score_bands.map((r) => [r.label, r.description]),
                    [1, 4],
                  )
                : text("점수·비율 없는 평가로 운영합니다."),
            );
            break;
          case "semester_levels":
            blocks.push(
              table(
                ["수준", "학기 단위 성취수준"],
                d.semester_levels.map((r) => [r.label, r.description]),
                [1, 9],
              ),
            );
            break;
          case "overview": {
            // Split wide summaries into groups so every assessment remains readable.
            for (let i = 0; i < Math.max(1, ev.items.length); i += 4) {
              const items = ev.items.slice(i, i + 4);
              const row = (
                label: string,
                get: (a: AssessmentItem) => string,
              ) => [label, ...items.map(get)];
              blocks.push(
                table(
                  ["구분", ...items.map((a) => shown(a.name))],
                  [
                    row("평가 종류", (a) => a.type),
                    ...(weighted
                      ? [
                          row("반영비율", (a) => `${shown(a.ratio)}%`),
                          row("영역 만점", (a) => `${shown(a.points)}점`),
                        ]
                      : []),
                    row("평가 방법", (a) => a.method),
                    row(
                      "평가 시기·횟수",
                      (a) =>
                        `${a.period || [a.start, a.end].filter(Boolean).join(" ~ ")} / ${shown(a.count)}회`,
                    ),
                    row("성취기준", (a) => standards(a.standard_ids)),
                    row(
                      "평가 단원·내용",
                      (a) => a.detail?.unit_content || a.element,
                    ),
                  ],
                ),
              );
            }
            break;
          }
          case "details":
            for (const a of ev.items) {
              blocks.push(heading(`${a.name || "평가명 미입력"} · ${a.type}`));
              blocks.push(
                table(
                  ["항목", "내용"],
                  [
                    [
                      "평가 시기",
                      a.period || [a.start, a.end].filter(Boolean).join(" ~ "),
                    ],
                    ...(weighted
                      ? [
                          [
                            "반영비율 / 영역 배점",
                            `${shown(a.ratio)}% / ${shown(a.points)}점`,
                          ],
                        ]
                      : []),
                    [
                      "차시 / 횟수",
                      `${shown(a.detail?.lessons)}차시 / ${shown(a.count)}회`,
                    ],
                    ["평가 유형", a.detail?.methods || a.method],
                    ["성취기준", standards(a.standard_ids)],
                    ["교과 역량", a.detail?.competencies || "미입력"],
                    ["평가 단원·내용", a.detail?.unit_content || a.element],
                    ["평가 요소", a.element],
                    ["평가 방법", a.method],
                    ["학생이 수행할 과제", shown(a.task)],
                    ["확인할 결과물·활동 기록", shown(a.evidence)],
                  ],
                  [2, 8],
                ),
              );
              if (a.stages?.length)
                blocks.push(
                  heading("과제 진행 단계"),
                  table(
                    ["순서", "진행 단계", "활동 내용"],
                    a.stages.map((s, i) => [
                      String(i + 1),
                      s.title,
                      s.description,
                    ]),
                    [1, 2, 7],
                  ),
                );
              const connected = linkedLessons(doc.units, a.id);
              if (connected.length)
                blocks.push(
                  heading("수업과 평가의 연결"),
                  table(
                    ["수업 시기", "수업 내용", "역할", "진행 단계"],
                    connected.map(({ unit, link }) => [
                      unitDay(unit),
                      unit.title,
                      link.phase,
                      stageTitle(a, link.stage_id),
                    ]),
                    [2, 4, 1, 3],
                  ),
                );
              blocks.push(
                table(
                  ["기준·수준", "성취기준별 성취수준"],
                  (a.detail?.standard_levels ?? []).map((r) => [
                    [r.standard_id ? standards([r.standard_id]) : "", r.label]
                      .filter(Boolean)
                      .join("\n"),
                    r.description,
                  ]),
                  [2, 8],
                ),
              );
              blocks.push(
                table(
                  weighted
                    ? [
                        "진행 단계·채점 요소",
                        "배점",
                        "평정수준",
                        "판단 기준",
                        "점수",
                        "성취기준·증거·비고",
                      ]
                    : [
                        "진행 단계·채점 요소",
                        "평정수준",
                        "판단 기준",
                        "성취기준·증거·비고",
                      ],
                  a.rubric.flatMap((r) =>
                    (r.levels.length
                      ? r.levels
                      : [
                          {
                            label: "미입력",
                            description: "미입력",
                            points: null,
                          },
                        ]
                    ).map((l) =>
                      weighted
                        ? [
                            [stageTitle(a, r.stage_id), r.element]
                              .filter(Boolean)
                              .join("\n"),
                            shown(r.points),
                            l.label,
                            l.description,
                            shown(l.points),
                            [
                              standards(r.standard_ids ?? []),
                              r.evidence,
                              r.note,
                            ]
                              .filter(Boolean)
                              .join("\n"),
                          ]
                        : [
                            [stageTitle(a, r.stage_id), r.element]
                              .filter(Boolean)
                              .join("\n"),
                            l.label,
                            l.description,
                            [
                              standards(r.standard_ids ?? []),
                              r.evidence,
                              r.note,
                            ]
                              .filter(Boolean)
                              .join("\n"),
                          ],
                    ),
                  ),
                  weighted ? [17, 6, 9, 38, 6, 24] : [18, 12, 45, 25],
                ),
              );
              if (weighted)
                blocks.push(
                  text(
                    `평가과제별 평가요소 최하점 합계: ${shown(minimumRubricPoints(a))}${minimumRubricPoints(a) === null ? " (평정수준 점수 확인 필요)" : "점"}`,
                  ),
                );
              if (a.notes) blocks.push(heading("평가 유의사항"), text(a.notes));
            }
            break;
          case "additional":
            if (ev.notes) blocks.push(text(ev.notes));
            for (const row of d.additional)
              blocks.push(
                heading(row.label || "추가 항목"),
                text(row.description),
              );
            break;
        }
      }
      sections.push({
        title: `${c.year!.year}학년도 ${course.grade}학년 ${ev.semester}학기 ${course.subject_name}과 ${format.assessment_title}`,
        orientation: format.assessment_orientation,
        blocks: finish(blocks),
      });
    }
  return { title: `${prefix} 교수학습 및 평가 운영 계획`, sections };
}

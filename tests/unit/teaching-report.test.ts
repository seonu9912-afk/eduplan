import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  emptyTeachingDocument,
  emptyAssessment,
  emptyUnit,
  teachingDocumentSchema,
} from "../../src/lib/teaching";
import {
  defaultReportFormat,
  validFormat,
  emptyEvaluationDetail,
} from "../../src/lib/teaching-format";
import {
  buildTeachingReport,
  minimumRubricPoints,
} from "../../src/lib/teaching-report";
import { exportTeachingHwpx } from "../../src/lib/teaching-hwpx";
import type { Context, Row } from "../../src/lib/models";
const context = {
  year: { year: 2026 },
  workspace: { name: "검증중학교" },
  classes: [],
  teaching: {
    classes: [],
    standards: [
      {
        id: "ref",
        code: "[테스트]",
        content: "생각을 <비교> & 표현한다.",
        curriculum_version: "2022 개정",
      },
    ],
  },
} as unknown as Context;
const course = {
  id: "course",
  grade: 1,
  semester: 2,
  subject_name: "국어",
  teacher_name: "테스트 교사",
} as Row<"teaching_courses">;
function fixture() {
  const doc = emptyTeachingDocument(2);
  doc.report = { weekly_hours: 4, format: defaultReportFormat() };
  doc.units = [
    {
      ...emptyUnit(),
      month: "8",
      week: "2",
      day: "31~4",
      title: "긴 단원명 & 토론",
      content: "평가요소\n생각을 비교한다.",
      assessment_method: "자기평가",
      method: "토론",
      alignment: "발표 관찰",
      standard_ids: [],
      lessons: 4,
    },
  ];
  const detail = emptyEvaluationDetail();
  detail.purpose = "자료를 비교하고 표현한다.";
  detail.direction = "과정 중심";
  detail.policy = "학교 평가 방침";
  detail.absence_policy = "별도 기회 제공";
  detail.score_bands = [{ label: "A", description: "90% 이상" }];
  detail.semester_levels = [{ label: "상", description: "내용을 비교한다." }];
  detail.additional = [{ label: "학교별 항목", description: "공유 일정" }];
  doc.evaluations[0].detail = detail;
  doc.evaluations[0].items = [
    {
      ...emptyAssessment(),
      name: "토론 수행평가",
      ratio: 100,
      points: 100,
      detail: {
        lessons: 3,
        unit_content: "토론",
        methods: "토론·토의, 자기평가",
        competencies: "의사소통·협업",
        standard_levels: [
          { label: "[테스트] 상", description: "근거를 논리적으로 제시" },
        ],
      },
      rubric: [
        {
          id: crypto.randomUUID(),
          element: "논리",
          points: 100,
          note: "",
          levels: [
            {
              id: crypto.randomUUID(),
              label: "상",
              description: "충분한 근거\n두 가지 이상",
              points: 100,
            },
            {
              id: crypto.randomUUID(),
              label: "하",
              description: "근거 부족",
              points: 40,
            },
          ],
        },
      ],
    },
  ];
  return doc;
}
describe("school report compatibility and content", () => {
  it("keeps legacy documents valid, accepts all new fields, rejects malformed templates", () => {
    expect(
      teachingDocumentSchema.safeParse(emptyTeachingDocument(2)).success,
    ).toBe(true);
    const doc = fixture();
    expect(teachingDocumentSchema.safeParse(doc).success).toBe(true);
    const f = defaultReportFormat();
    f.lesson_columns[1] = f.lesson_columns[0];
    expect(validFormat(f)).toBe(false);
    doc.report!.format.lesson_columns[0].width = 0;
    expect(teachingDocumentSchema.safeParse(doc).success).toBe(false);
  });
  it("computes lowest criterion total only when every level is scored", () => {
    const a = fixture().evaluations[0].items[0];
    expect(minimumRubricPoints(a)).toBe(40);
    a.rubric[0].levels[0].points = null;
    expect(minimumRubricPoints(a)).toBeNull();
    a.rubric = [];
    expect(minimumRubricPoints(a)).toBeNull();
  });
  it("honors school order, headings, hidden columns and optional score-free output", () => {
    const doc = fixture();
    doc.report!.format.lesson_columns.reverse();
    doc.report!.format.lesson_columns.find((c) => c.key === "method")!.enabled =
      false;
    doc.report!.format.sections[0].title = "우리 학교 평가 목적";
    doc.evaluations[0].mode = "descriptive";
    const report = buildTeachingReport(context, course, doc, "both", true),
      json = JSON.stringify(report);
    expect(report.sections.map((s) => s.orientation)).toEqual([
      "landscape",
      "portrait",
    ]);
    expect(json).toContain("우리 학교 평가 목적");
    expect(json).toContain("미저장 초안");
    expect(json).not.toContain("최하점 합계");
    expect(json).not.toContain("100점");
    const table = report.sections[0].blocks.find(
      (b) => b.kind === "table" && b.headers.includes("비고"),
    )!;
    if (table.kind === "table") {
      expect(table.headers[0]).toBe("비고");
      expect(table.headers).not.toContain("수업방법(재구성)");
    }
  });
  it("exports a real multi-section HWPX with editable tables and valid XML/package relationships", async () => {
    const doc = fixture();
    doc.units[0].standard_ids = ["ref"];
    const item = doc.evaluations[0].items[0];
    item.task = "근거를 비교하여 자신의 해석을 제시한다.";
    item.evidence = "발표 및 수정 기록";
    item.stages = [
      {
        id: crypto.randomUUID(),
        title: "프로젝트",
        description: "발표 후 수정",
      },
    ];
    item.rubric[0].stage_id = item.stages[0].id;
    item.rubric[0].evidence = "두 근거의 비교 기록";
    doc.units[0].assessment_links = [
      { assessment_id: item.id, phase: "실시", stage_id: item.stages[0].id },
    ];
    const report = buildTeachingReport(context, course, doc);
    const bytes = await exportTeachingHwpx(report);
    const z = await JSZip.loadAsync(bytes);
    expect(await z.file("mimetype")!.async("string")).toBe(
      "application/hwp+zip",
    );
    expect(new DataView(bytes.buffer).getUint16(8, true)).toBe(0); // First entry is stored, not deflated.
    const parser = new XMLParser({ ignoreAttributes: false });
    for (const name of Object.keys(z.files).filter(
      (n) => n.endsWith(".xml") || n.endsWith(".hpf"),
    )) {
      const xml = await z.file(name)!.async("string");
      expect(XMLValidator.validate(xml), name).toBe(true);
      expect(() => parser.parse(xml)).not.toThrow();
    }
    const lesson = await z.file("Contents/section0.xml")!.async("string"),
      evaluation = await z.file("Contents/section1.xml")!.async("string");
    expect(lesson).toContain('landscape="NARROWLY"');
    expect(evaluation).toContain('landscape="WIDELY"');
    expect(lesson).toContain("&lt;비교&gt; &amp;");
    expect(lesson).toContain("자기평가");
    expect(lesson).toContain("31~4");
    expect(evaluation).toContain("의사소통·협업");
    expect(evaluation).toContain("발표 및 수정 기록");
    expect(evaluation).toContain("두 근거의 비교 기록");
    expect(evaluation).toContain("과제 진행 단계");
    expect(lesson).toContain("토론 수행평가 · 실시 · 프로젝트");
    expect(evaluation).toContain("40점");
    expect(evaluation).toContain("근거를 논리적으로 제시");
    expect(evaluation).not.toContain("undefined");
    const hpf = parser.parse(
      await z.file("Contents/content.hpf")!.async("string"),
    )["opf:package"];
    for (const item of hpf["opf:manifest"]["opf:item"])
      expect(z.file(item["@_href"])).not.toBeNull();
    expect(await z.file("Contents/header.xml")!.async("string")).toContain(
      'secCnt="2"',
    );
    const plain = await z.file("Preview/PrvText.txt")!.async("string");
    expect(plain).toContain("학교별 항목");
    expect(plain).toContain("생각을 <비교> & 표현한다.");
    mkdirSync(".artifacts", { recursive: true });
    writeFileSync(".artifacts/teaching-report-example.hwpx", bytes);
  });
  it("preserves long multi-page tables and every final row", async () => {
    const doc = fixture();
    doc.units = Array.from({ length: 72 }, (_, i) => ({
      ...doc.units[0],
      id: crypto.randomUUID(),
      week: String(i + 1),
      title: `단원 ${i + 1}`,
      content: "긴 학습 내용과 평가 연계 주안점. ".repeat(60),
    }));
    const bytes = await exportTeachingHwpx(
      buildTeachingReport(context, course, doc),
    );
    const zip = await JSZip.loadAsync(bytes);
    const section = await zip.file("Contents/section0.xml")!.async("string");
    expect(section).toContain('rowCnt="73"');
    expect(section).toContain('repeatHeader="1"');
    expect(section).toContain('treatAsChar="1"');
    expect(section).toContain("단원 72");
    expect(section.match(/긴 학습 내용과 평가 연계 주안점/g)).toHaveLength(
      72 * 60,
    );
    writeFileSync(".artifacts/teaching-report-long.hwpx", bytes);
  });
  it("exports each document separately without the other section", () => {
    const doc = fixture();
    expect(
      buildTeachingReport(context, course, doc, "lesson").sections,
    ).toHaveLength(1);
    expect(
      buildTeachingReport(context, course, doc, "assessment").sections[0]
        .orientation,
    ).toBe("portrait");
  });
});

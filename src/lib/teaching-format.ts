import { z } from "zod";

export const lessonColumnKeys = [
  "month",
  "week",
  "day",
  "title",
  "standards",
  "content",
  "method",
  "assessment_method",
  "alignment",
  "note",
  "lessons",
] as const;
export const reportSectionKeys = [
  "purpose",
  "policy",
  "criteria",
  "semester_levels",
  "overview",
  "details",
  "additional",
] as const;
const label = z.string().trim().min(1).max(160);
export const reportFormatSchema = z
  .object({
    version: z.literal(1),
    name: label,
    lesson_title: label,
    assessment_title: label,
    lesson_orientation: z.enum(["landscape", "portrait"]),
    assessment_orientation: z.enum(["landscape", "portrait"]),
    lesson_columns: z
      .array(
        z
          .object({
            key: z.enum(lessonColumnKeys),
            label,
            enabled: z.boolean(),
            width: z.number().int().min(1).max(100),
          })
          .strict(),
      )
      .length(lessonColumnKeys.length),
    sections: z
      .array(
        z
          .object({
            key: z.enum(reportSectionKeys),
            title: label,
            enabled: z.boolean(),
          })
          .strict(),
      )
      .length(reportSectionKeys.length),
    footer: z.string().max(1000),
  })
  .strict();
export type ReportFormat = z.infer<typeof reportFormatSchema>;
// Semantic checks are also enforced in the database, outside JSON Schema.
export function validFormat(format: ReportFormat) {
  return (
    new Set(format.lesson_columns.map((c) => c.key)).size ===
      lessonColumnKeys.length &&
    new Set(format.sections.map((s) => s.key)).size ===
      reportSectionKeys.length &&
    format.lesson_columns.some((c) => c.enabled) &&
    format.sections.some((s) => s.enabled)
  );
}
export function defaultReportFormat(): ReportFormat {
  const labels = [
    "월",
    "주",
    "일",
    "단원명",
    "성취기준",
    "평가요소",
    "수업방법(재구성)",
    "평가방법",
    "수업-평가 연계 주안점",
    "비고",
    "차시",
  ];
  const widths = [3, 3, 6, 10, 18, 15, 9, 9, 19, 8, 4];
  const titles = [
    "Ⅰ. 평가 목적 및 방향",
    "Ⅱ. 평가 방침 및 유의사항",
    "Ⅲ. 평가 기준",
    "Ⅳ. 학기 단위 성취수준",
    "Ⅴ. 평가의 종류와 반영비율",
    "Ⅵ. 수행평가 세부 계획",
    "Ⅶ. 추가 사항",
  ];
  return {
    version: 1,
    name: "학교 제출용 기본 서식",
    lesson_title: "교수학습 및 평가 운영 계획",
    assessment_title: "평가 운영 계획",
    lesson_orientation: "landscape",
    assessment_orientation: "portrait",
    lesson_columns: lessonColumnKeys.map((key, i) => ({
      key,
      label: labels[i],
      width: widths[i],
      enabled: key !== "lessons",
    })),
    sections: reportSectionKeys.map((key, i) => ({
      key,
      title: titles[i],
      enabled: true,
    })),
    footer: "",
  };
}
export const narrativeRowSchema = z
  .object({ label: z.string().max(160), description: z.string().max(10000) })
  .strict();
export const evaluationDetailSchema = z
  .object({
    purpose: z.string().max(15000),
    direction: z.string().max(15000),
    policy: z.string().max(15000),
    absence_policy: z.string().max(15000),
    score_bands: z.array(narrativeRowSchema).max(30),
    semester_levels: z.array(narrativeRowSchema).max(30),
    additional: z.array(narrativeRowSchema).max(30),
  })
  .strict();
export type EvaluationDetail = z.infer<typeof evaluationDetailSchema>;
export function emptyEvaluationDetail(): EvaluationDetail {
  return {
    purpose: "",
    direction: "",
    policy: "",
    absence_policy: "",
    score_bands: [],
    semester_levels: [],
    additional: [],
  };
}

import { z } from "zod";
export const submissionScopeSchema = z.enum(["lesson", "assessment_1", "assessment_2"]);
export const submissionStatusSchema = z.enum(["submitted", "reviewing", "changes_requested", "accepted", "withdrawn"]);
export type SubmissionScope = z.infer<typeof submissionScopeSchema>;
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;
export const teachingSubmissionsSchema = z.array(z.object({
  id: z.uuid(), course_id: z.uuid(), version: z.number().int().positive(),
  scope: submissionScopeSchema, status: submissionStatusSchema,
  submitted_at: z.string(), reviewed_at: z.string().nullable(), review_note: z.string(),
  grade: z.number(), semester: z.number(), subject_name: z.string(), teacher_name: z.string(),
  current_version: z.number().int().nullable(), can_submit: z.boolean(),
}));
export type TeachingSubmission = z.infer<typeof teachingSubmissionsSchema>[number];
export const submissionStatusLabels: Record<SubmissionStatus, string> = {
  submitted: "검토 대기", reviewing: "검토 중", changes_requested: "수정 요청", accepted: "검토 완료", withdrawn: "제출 철회",
};
export function submissionScopeLabel(scope: SubmissionScope) {
  return scope === "lesson" ? "교수학습계획" : scope === "assessment_1" ? "1학기 평가계획" : "2학기 평가계획";
}
export function activeSubmission(row?: TeachingSubmission) {
  return row?.status === "submitted" || row?.status === "reviewing";
}
// The server orders by submitted_at then id. Retain the same tie-breaker on the client.
export function latestSubmission(rows: TeachingSubmission[], scope: SubmissionScope) {
  return rows.find(row => row.scope === scope);
}

export const submissionDetailSchema = z.object({
  id: z.uuid(), version: z.number().int().positive(), scope: submissionScopeSchema, status: submissionStatusSchema,
  events: z.array(z.object({status: submissionStatusSchema, at: z.string(), actor: z.string().nullable(), note: z.string().optional()})),
  course: z.object({grade: z.number(), semester: z.number(), subject_name: z.string(), teacher_name: z.string(),
    classes: z.array(z.object({id:z.uuid(),grade:z.number(),class_number:z.number()})).nullable().optional()}),
  report: z.unknown().nullable().optional(), content: z.unknown(),
});
export type SubmissionDetail = z.infer<typeof submissionDetailSchema>;

export const teachingDeadlineDataSchema = z.object({
  deadlines:z.array(z.object({semester:z.number().int().min(1).max(2),lesson_due:z.iso.date().nullable(),assessment_due:z.iso.date().nullable(),version:z.number().int().positive()})),
  alerts:z.array(z.object({course_id:z.uuid(),grade:z.number(),subject_name:z.string(),scope:submissionScopeSchema,due_date:z.iso.date().nullable(),kind:z.enum(["changes_requested","overdue","today","upcoming"]),note:z.string()}))
});
export type TeachingDeadlineData = z.infer<typeof teachingDeadlineDataSchema>;
export type TeachingDeadline = TeachingDeadlineData["deadlines"][number];
export function dueForScope(deadlines:TeachingDeadline[],semester:number,scope:SubmissionScope):string|null {
  if(scope!=="lesson") return deadlines.find(d=>d.semester===Number(scope.slice(-1)))?.assessment_due??null;
  return deadlines.filter(d=>semester===0||d.semester===semester).flatMap(d=>d.lesson_due?[d.lesson_due]:[]).sort()[0]??null;
}
export const submissionAlertLabels = {changes_requested:"수정 요청",overdue:"제출 기한 지남",today:"오늘 제출 마감",upcoming:"제출 기한 임박"} as const;

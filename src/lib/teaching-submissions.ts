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

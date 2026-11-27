import { z } from "zod";
import { dateLabel, addDays, isoDate } from "./domain";
import { externalUrl, resourceList } from "./external-links";
import { publicationAt, type SchoolPlanPublication } from "./school-publications";
import type { ResourceLink } from "./external-links";

export type SchoolTask = {
  id: string;
  workspace_id: string;
  academic_year_id: string;
  owner_id: string | null;
  author_name: string | null;
  kind: "personal" | "distributed";
  title: string;
  description: string;
  department: string;
  due_date: string | null;
  due_time: string | null;
  resources: ResourceLink[];
  submission_url: string | null;
  source_business_id: string | null;
  deadline_from_source: boolean;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

export type TaskRecipient = {
  workspace_id: string;
  academic_year_id: string;
  task_id: string;
  teacher_id: string;
  user_id: string | null;
  recipient_name: string;
  assigned_at: string;
  completed_at: string | null;
  removed_at: string | null;
};

const recipientKey = z.object({ teacher_id: z.uuid(), user_id: z.uuid() });
export const taskDirectorySchema = z.array(recipientKey.extend({
  display_name: z.string(), department: z.string(), grade: z.number().int().min(1).max(6).nullable(),
}));
export type TaskTeacher = z.infer<typeof taskDirectorySchema>[number];
export type TaskData = { tasks: SchoolTask[]; recipients: TaskRecipient[]; directory: TaskTeacher[] };

const audienceSchema = z.array(recipientKey).min(1, "수신 교원을 선택해 주세요.").max(1000);
export const taskSaveSchema = z.object({
  workspace: z.uuid(), year: z.uuid(), id: z.uuid(), version: z.number().int().min(0),
  kind: z.enum(["personal", "distributed"]),
  title: z.string().trim().max(200),
  description: z.string().trim().max(4000),
  department: z.string().trim().max(60),
  due_date: isoDate.nullable(),
  due_time: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "마감 시각을 확인해 주세요.").nullable(),
  resources: resourceList,
  submission_url: externalUrl.nullable(),
  source_business_id: z.string().min(1).max(80).nullable(),
  deadline_from_source: z.boolean(),
  audience: audienceSchema.optional(),
}).superRefine((task, context) => {
  if (!task.title && !task.source_business_id)
    context.addIssue({ code: "custom", path: ["title"], message: "제목을 입력해 주세요." });
  if (task.due_time && !task.due_date && !task.deadline_from_source)
    context.addIssue({ code: "custom", path: ["due_time"], message: "마감 시각을 지정하려면 마감일이 필요합니다." });
  if (task.kind === "distributed" && !task.version && !task.audience)
    context.addIssue({ code: "custom", path: ["audience"], message: "수신 교원을 선택해 주세요." });
});

const taskCommand = z.object({ workspace: z.uuid(), id: z.uuid(), version: z.number().int().positive() });
export const taskCommandSchema = z.discriminatedUnion("command", [
  taskCommand.extend({ command: z.literal("complete"), completed: z.boolean() }),
  taskCommand.extend({ command: z.enum(["cancel", "delete"]) }),
  taskCommand.extend({ command: z.enum(["remove", "redo"]), teacher_id: z.uuid() }),
  taskCommand.extend({ command: z.literal("add"), audience: audienceSchema }),
]);

export type TaskTarget = {
  all: boolean; homerooms: boolean; departments: string[]; grades: number[]; teachers: string[];
};

export function taskAudience(teachers: TaskTeacher[], target: TaskTarget) {
  return teachers.filter((teacher) => target.all || target.teachers.includes(teacher.teacher_id)
    || Boolean(teacher.department && target.departments.includes(teacher.department))
    || (teacher.grade !== null && (target.homerooms || target.grades.includes(teacher.grade))));
}

const publishedWorkItem = z.object({
  id: z.string().min(1).max(80), text: z.string(), date: isoDate, department: z.string().optional(),
});
export type TaskSource = z.infer<typeof publishedWorkItem>;

function publicationWorkItems(release?: SchoolPlanPublication): TaskSource[] {
  const payload = release?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.business))
    return [];
  return payload.business.flatMap((row) => {
    const result = publishedWorkItem.safeParse(row);
    return result.success ? [result.data] : [];
  });
}

export function taskPlanSources(publications: SchoolPlanPublication[], schoolYear: number, today: string) {
  const first = `${schoolYear}-03-01`, last = addDays(`${schoolYear + 1}-03-01`, -1);
  const date = today < first ? first : today > last ? last : today;
  const visible = publicationAt(publications, "plans", date);
  const current = new Map(publicationWorkItems(visible).map((item) => [item.id, item]));
  const history = new Map(current);
  for (const release of publications.filter((item) => item.domain === "plans" && item.starts_on <= date)
    .sort((a, b) => b.starts_on.localeCompare(a.starts_on) || b.source_version - a.source_version ||
      b.published_at.localeCompare(a.published_at))) {
    if (release.id === visible?.id) continue;
    for (const item of publicationWorkItems(release)) if (!history.has(item.id)) history.set(item.id, item);
  }
  return { current, history };
}

export function resolveSchoolTask(task: SchoolTask, sources: ReturnType<typeof taskPlanSources>) {
  const sourceId = task.source_business_id;
  const source = sourceId ? sources.current.get(sourceId) : undefined;
  const previous = sourceId ? sources.history.get(sourceId) : undefined;
  return {
    title: source?.text ?? previous?.text ?? task.title,
    dueDate: task.deadline_from_source ? (source?.date ?? previous?.date ?? null) : task.due_date,
    dueTime: task.due_time?.slice(0, 5) ?? null,
    source, sourceMissing: Boolean(sourceId && !source),
  };
}

export function taskDeadlineLabel(date: string | null, time: string | null, today: string) {
  if (!date) return "";
  const dateText = date.slice(0, 4) === today.slice(0, 4) ? dateLabel(date) : `${date.slice(0, 4)}년 ${dateLabel(date)}`;
  return time ? `${dateText} ${time}` : dateText;
}

export function taskOverdue(date: string | null, time: string | null, today: string, clock: string) {
  return !!date && (date < today || (date === today && !!time && time <= clock));
}

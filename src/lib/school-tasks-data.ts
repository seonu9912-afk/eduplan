import "server-only";
import { createClient } from "./supabase/server";
import { readAllRows } from "./pagination";
import { taskDirectorySchema, type TaskData } from "./school-tasks";

export async function loadSchoolTasks(workspace: string, year: string): Promise<TaskData | null> {
  const db = await createClient();
  const [tasks, recipients, audience] = await Promise.all([
    readAllRows((from, to) => db.from("school_tasks").select("*").eq("workspace_id", workspace)
      .eq("academic_year_id", year).order("id").range(from, to)),
    readAllRows((from, to) => db.from("school_task_recipients").select("*").eq("workspace_id", workspace)
      .eq("academic_year_id", year).order("task_id").order("teacher_id").range(from, to)),
    db.rpc("school_task_audience", { target: workspace, year_id: year }),
  ]);
  const directory = taskDirectorySchema.safeParse(audience.data);
  if (tasks.error || recipients.error || audience.error || !directory.success) return null;
  return { tasks: tasks.data ?? [], recipients: recipients.data ?? [], directory: directory.data };
}

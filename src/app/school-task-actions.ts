"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { taskCommandSchema, taskSaveSchema } from "@/lib/school-tasks";
import type { Result } from "@/lib/models";

function refreshTasks(workspace: string) {
  for (const section of ["home", "plans", "notifications"]) revalidatePath(`/app/${workspace}/${section}`);
}

function taskError(error: { code?: string; message: string }) {
  if (error.code === "23505") return "이 공개 업무계획은 이미 배포되었거나 같은 할 일이 저장되었습니다.";
  if (error.code === "23514") return "제목, 마감일, 자료 링크 등 입력값을 확인해 주세요.";
  return /[가-힣]/.test(error.message) ? error.message : "할 일을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function saveSchoolTask(input: unknown): Promise<Result<string>> {
  const parsed = taskSaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  const { workspace, year, id, version, ...fields } = parsed.data;
  const db = await createClient();
  // The RPC checks the verified account and scoped teacher membership at the database.
  const { data, error } = await db.rpc("save_school_task", {
    target: workspace, year_id: year, task: id, expected_version: version, input: fields,
  });
  if (error) return { ok: false, error: taskError(error) };
  refreshTasks(workspace);
  return { ok: true, data };
}

export async function changeSchoolTask(input: unknown): Promise<Result> {
  const parsed = taskCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "변경 내용을 확인해 주세요." };
  const { workspace, id, version, command, ...fields } = parsed.data;
  const db = await createClient();
  const { error } = await db.rpc("change_school_task", {
    target: workspace, task: id, expected_version: version, command, input: fields,
  });
  if (error) return { ok: false, error: taskError(error) };
  refreshTasks(workspace);
  return { ok: true, data: undefined };
}

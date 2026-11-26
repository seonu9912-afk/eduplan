"use server";
import { authoringIntegrityErrors } from "@/lib/teaching-authoring";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/domain";
import {
  courseSchema,
  standardSchema,
  teachingDocumentSchema,
} from "@/lib/teaching";
import type { Result } from "@/lib/models";
async function dbClient() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw Error("다시 로그인해 주세요.");
  return db;
}
async function run<T>(task: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await task() };
  } catch (e) {
    if (e instanceof z.ZodError)
      return {
        ok: false,
        error: e.issues[0]?.message ?? "입력값을 확인해 주세요.",
      };
    const err = e as { code?: string; message?: string };
    return {
      ok: false,
      error:
        err.code === "23505"
          ? "이미 등록된 자료입니다. 기존 항목을 선택해 주세요."
          : err.code === "23503"
            ? "연결된 과목·학급·성취기준의 범위를 확인해 주세요."
            : err.code === "42501"
              ? "이 자료에 대한 권한이 없습니다."
              : err.message && /[가-힣]/.test(err.message)
                ? err.message
                : "저장하지 못했습니다. 입력 내용을 유지했으니 연결 상태를 확인하고 다시 시도해 주세요.",
    };
  }
}
function refresh() {
  revalidatePath("/app", "layout");
}
export async function saveTeachingCourse(
  input: unknown,
  courseId: string | null = null,
  version = 0,
  copyFrom: string | null = null,
) {
  return run(async () => {
    const settings = courseSchema.parse(input);
    if (courseId) uuid.parse(courseId);
    if (copyFrom) uuid.parse(copyFrom);
    z.number().int().min(0).parse(version);
    const db = await dbClient();
    const { data, error } = await db.rpc("save_teaching_course", {
      target: settings.workspace_id,
      target_course: courseId as unknown as string,
      expected_version: version,
      settings,
      copy_from: copyFrom as unknown as string,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function saveTeachingPlan(
  courseId: string,
  version: number,
  input: unknown,
  confirm = false,
  publication?: { startsOn: string; note: string },
) {
  return run(async () => {
    uuid.parse(courseId);
    z.number().int().positive().parse(version);
    const payload = teachingDocumentSchema.parse(input);
    const connectionErrors = authoringIntegrityErrors(payload);
    if (connectionErrors.length) throw new Error(connectionErrors[0]);
    const db = await dbClient();
    const scope = {
      target_course: courseId,
      expected_version: version,
      payload,
    };
    const schedule = publication && z.object({
      startsOn: z.iso.date(),
      note: z.string().trim().max(500),
    }).parse(publication);
    const { data, error } = schedule
      ? await db.rpc("publish_teaching_from", { ...scope, effective_date: schedule.startsOn, note: schedule.note })
      : await db.rpc("save_teaching_plan", { ...scope, confirm_plan: confirm });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function setTeachingPlanEditors(courseId: string, version: number, users: unknown) {
  return run(async () => {
    uuid.parse(courseId);
    z.number().int().positive().parse(version);
    const editors = z.array(uuid).max(50).parse(users);
    const db = await dbClient();
    const { data, error } = await db.rpc("set_teaching_plan_editors", {
      target_course: courseId, expected_version: version, editors,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function registerStandard(input: unknown) {
  return run(async () => {
    const v = standardSchema.parse(input);
    const db = await dbClient();
    const { data, error } = await db
      .from("achievement_standards")
      .insert(v)
      .select("*")
      .single();
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function teachingHistory(courseId: string) {
  return run(async () => {
    uuid.parse(courseId);
    const db = await dbClient();
    const { data, error } = await db
      .from("teaching_plan_versions")
      .select("course_id,version,action,actor_name,created_at")
      .eq("course_id", courseId)
      .order("version", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  });
}
export async function restoreTeachingPlan(
  courseId: string,
  version: number,
  revision: number,
) {
  return run(async () => {
    uuid.parse(courseId);
    z.number().int().positive().parse(version);
    z.number().int().positive().parse(revision);
    const db = await dbClient();
    const { data, error } = await db.rpc("restore_teaching_plan", {
      target_course: courseId,
      expected_version: version,
      revision,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function refreshTeachingReference(
  courseId: string,
  version: number,
) {
  return run(async () => {
    uuid.parse(courseId);
    z.number().int().positive().parse(version);
    const db = await dbClient();
    const { data, error } = await db.rpc("refresh_teaching_reference", {
      target_course: courseId,
      expected_version: version,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}
export async function archiveTeachingCourse(
  courseId: string,
  version: number,
  archived: boolean,
) {
  return run(async () => {
    uuid.parse(courseId);
    z.number().int().positive().parse(version);
    z.boolean().parse(archived);
    const db = await dbClient();
    const { data, error } = await db.rpc("archive_teaching_course", {
      target_course: courseId,
      expected_version: version,
      archived_value: archived,
    });
    if (error) throw error;
    refresh();
    return data;
  });
}

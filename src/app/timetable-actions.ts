"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/domain";
import { timetableDocumentSchema, timetableJson } from "@/lib/timetable-bridge";
import type { Result } from "@/lib/models";

type TimetableLoad = { version: number; updated_at: string | null; document: unknown } | null;
type TimetableSave = { ok: boolean; version: number };

async function withMember(workspaceId: string, roles: string[]) {
  uuid.parse(workspaceId);
  const db = await createClient();
  const { data: userResult, error: authError } = await db.auth.getUser();
  if (authError || !userResult.user) throw Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  const membership = await db.from("workspace_members").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", userResult.user.id).maybeSingle();
  if (membership.error || !membership.data || !roles.includes(membership.data.role))
    throw Error("해당 작업공간의 시간표 접근 권한이 없습니다.");
  return db;
}
function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "시간표 입력을 확인해 주세요.";
  if (error instanceof Error && /[가-힣]/.test(error.message)) return error.message;
  return "시간표 서버 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
export async function loadTimetableDocument(input: unknown): Promise<Result<TimetableLoad>> {
  try {
    const v = z.object({ workspaceId: uuid, yearId: uuid }).parse(input);
    const db = await withMember(v.workspaceId, ["admin", "editor", "viewer"]);
    const result = await db.from("timetable_documents").select("version,document,updated_at")
      .eq("workspace_id", v.workspaceId).eq("academic_year_id", v.yearId).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return { ok: true, data: null };
    const document = timetableDocumentSchema.safeParse(result.data.document);
    if (!document.success) throw Error("이전에 저장한 시간표 형식을 확인해야 합니다. 원본은 변경하지 않았습니다.");
    return { ok: true, data: { version: result.data.version,
      document: document.data, updated_at: result.data.updated_at } };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}
export async function saveTimetableDocument(input: unknown): Promise<Result<TimetableSave>> {
  try {
    const v = z.object({ workspaceId: uuid, yearId: uuid, expectedVersion: z.number().int().min(0),
      document: timetableDocumentSchema }).parse(input);
    const db = await withMember(v.workspaceId, ["admin", "editor"]);
    const result = await db.rpc("save_timetable_document", {
      target: v.workspaceId, year_id: v.yearId, expected_version: v.expectedVersion,
      next_document: timetableJson(v.document),
    });
    if (result.error) throw result.error;
    const output = z.object({ ok: z.boolean(), version: z.number().int().nonnegative() }).parse(result.data);
    if (output.ok) revalidatePath("/app", "layout");
    return { ok: true, data: output };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}

"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bellRowSchema } from "@/lib/planning-resources";
import type { Result } from "@/lib/models";
const scope = z.object({ workspaceId: z.uuid() });
async function perform<T>(
  workspaceId: string,
  operation: (db: Awaited<ReturnType<typeof createClient>>) => Promise<T>,
): Promise<Result<T>> {
  try {
    z.uuid().parse(workspaceId);
    const db = await createClient();
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) throw Error("로그인이 만료되었습니다.");
    const member = await db
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", data.user.id)
      .single();
    if (
      member.error ||
      !member.data ||
      !["admin", "editor"].includes(member.data.role)
    )
      throw Error("학교 운영 변경 권한이 없습니다.");
    const result = await operation(db);
    revalidatePath("/app", "layout");
    return { ok: true, data: result };
  } catch (e) {
    const message = (e as { message?: string }).message;
    return {
      ok: false,
      error:
        message && /[가-힣]/.test(message)
          ? message
          : "저장하지 못했습니다. 입력과 접근 권한을 확인하세요.",
    };
  }
}
export async function saveRoom(input: {
  workspaceId: string;
  id: string | null;
  name: string;
}) {
  return perform(input.workspaceId, async (db) => {
    const v = scope
      .extend({
        id: z.uuid().nullable(),
        name: z.string().trim().min(1).max(70),
      })
      .parse(input);
    const r = await db.rpc("save_school_room", {
      target: v.workspaceId,
      room_id: v.id,
      room_name: v.name,
    });
    if (r.error) throw r.error;
    return r.data;
  });
}
export async function saveBell(input: {
  workspaceId: string;
  name: string;
  kind: string;
  rows: unknown;
}) {
  return perform(input.workspaceId, async (db) => {
    const v = scope
      .extend({
        name: z.string().trim().min(1).max(100),
        kind: z.enum(["shortened", "exam", "event", "vacation", "temporary"]),
        rows: z.array(bellRowSchema).min(1).max(40),
      })
      .parse(input);
    const r = await db.rpc("save_bell_schedule", {
      target: v.workspaceId,
      label: v.name,
      schedule_kind: v.kind,
      rows: v.rows,
    });
    if (r.error) throw r.error;
    return r.data;
  });
}
export async function applyBell(input: {
  workspaceId: string;
  yearId: string;
  schedule: string;
  start: string;
  end: string;
  reason: string;
}) {
  return perform(input.workspaceId, async (db) => {
    const v = scope
      .extend({
        yearId: z.uuid(),
        schedule: z.uuid(),
        start: z.iso.date(),
        end: z.iso.date(),
        reason: z.string().trim().min(1).max(300),
      })
      .parse(input);
    const r = await db.rpc("apply_bell_schedule", {
      target: v.workspaceId,
      year_id: v.yearId,
      schedule: v.schedule,
      first_date: v.start,
      last_date: v.end,
      note: v.reason,
    });
    if (r.error) throw r.error;
    return r.data;
  });
}
export async function removeBell(input: { workspaceId: string; id: string }) {
  return perform(input.workspaceId, async (db) => {
    const v = scope.extend({ id: z.uuid() }).parse(input);
    const r = await db.rpc("remove_bell_application", {
      target: v.workspaceId,
      application: v.id,
    });
    if (r.error) throw r.error;
    return undefined;
  });
}

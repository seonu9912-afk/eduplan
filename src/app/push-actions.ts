"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Result } from "@/lib/models";
export type PushSettings = {
  publicKey: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastError: string | null;
};
export type PushSubscriptionStatus = {
  id: string;
  deviceId?: string;
  deviceLabel?: string;
  showDetails?: boolean;
  notifyChanges?: boolean;
  endpoint: string;
  enabled: boolean;
  lead: number;
  lastSentAt: string | null;
  lastError: string | null;
};
export async function loadPushSettings(workspaceId: string): Promise<
  Result<{
    settings: PushSettings | null;
    subscriptions: PushSubscriptionStatus[];
  }>
> {
  try {
    z.uuid().parse(workspaceId);
    const db = await createClient(),
      [settings, subscriptions] = await Promise.all([
        db.rpc("push_public_settings"),
        db.rpc("lesson_push_status", { target: workspaceId }),
      ]);
    if (settings.error || subscriptions.error) throw Error();
    return {
      ok: true,
      data: {
        settings: settings.data as unknown as PushSettings | null,
        subscriptions:
          subscriptions.data as unknown as PushSubscriptionStatus[],
      },
    };
  } catch {
    return { ok: false, error: "서버 알림 상태를 불러오지 못했습니다." };
  }
}
export async function savePushSubscription(
  input: unknown,
): Promise<Result<string>> {
  try {
    const v = z
        .object({
          workspaceId: z.uuid(),
          subscription: z.object({
            endpoint: z.url(),
            keys: z.object({ p256dh: z.string(), auth: z.string() }).optional(),
          }),
          active: z.boolean(),
          deviceId: z.uuid().nullable().optional(),
          deviceLabel: z.string().min(1).max(60).optional(),
          showDetails: z.boolean().optional(),
          notifyChanges: z.boolean().optional(),
          lead: z.union([
            z.literal(1),
            z.literal(3),
            z.literal(5),
            z.literal(10),
            z.literal(15),
          ]),
        })
        .parse(input),
      db = await createClient(),
      r = await db.rpc("save_lesson_push", {
        target: v.workspaceId,
        payload: {
          ...v.subscription,
          deviceId: v.deviceId,
          deviceLabel: v.deviceLabel,
          showDetails: v.showDetails,
          notifyChanges: v.notifyChanges,
        },
        active: v.active,
        lead_minutes: v.lead,
      });
    if (r.error) throw r.error;
    return { ok: true, data: r.data };
  } catch (e) {
    const message = (e as { message?: string }).message;
    return {
      ok: false,
      error:
        message && /[가-힣]/.test(message)
          ? message
          : "알림 설정을 저장하지 못했습니다.",
    };
  }
}

export async function detachPreviousPushAccount(
  subscription: unknown,
): Promise<Result<undefined>> {
  try {
    const payload = z
      .object({
        endpoint: z.url().max(2048),
        keys: z.object({
          p256dh: z.string().min(80).max(100),
          auth: z.string().min(20).max(30),
        }),
      })
      .parse(subscription);
    const db = await createClient();
    const r = await db.rpc("detach_previous_push_account", { payload });
    if (r.error) throw r.error;
    return { ok: true, data: undefined };
  } catch {
    return {
      ok: false,
      error: "이 기기의 이전 계정 알림 연결을 확인하지 못했습니다.",
    };
  }
}

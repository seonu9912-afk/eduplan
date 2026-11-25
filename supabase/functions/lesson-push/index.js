import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { pushNotice } from "./engine.mjs";
const db = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
async function rpc(name, args = {}) {
  const r = await db.rpc(name, args);
  if (r.error) throw Error(`rpc:${name}:${r.error.code}`);
  return r.data;
}
const allowedEndpoint = (value) =>
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)\//.test(
    value,
  );
Deno.serve(async (request) => {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  let stage = "config";
  try {
    const config = await rpc("push_runtime_config");
    if (
      !config?.enabled ||
      !config.dispatchKey ||
      request.headers.get("x-eduplan-dispatch") !== config.dispatchKey
    )
      return new Response("Unauthorized", { status: 401 });
    stage = "vapid";
    webpush.setVapidDetails(
      config.subject,
      config.publicKey,
      config.privateKey,
    );
    stage = "subscriptions";
    let cursor = "00000000-0000-0000-0000-000000000000",
      sent = 0,
      failed = 0;
    const started = Date.now();
    while (Date.now() - started < 90000) {
      const result = await db
        .from("lesson_push_subscriptions")
        .select("id,endpoint,p256dh,auth_key,lead")
        .eq("enabled", true)
        .gt("id", cursor)
        .order("id")
        .limit(100);
      if (result.error) throw Error("subscription_read");
      if (!result.data.length) break;
      for (const sub of result.data) {
        cursor = sub.id;
        let key = "source";
        try {
          if (!allowedEndpoint(sub.endpoint)) throw Error("invalid_endpoint");
          const source = await rpc("push_source", { subscription: sub.id });
          if (!source) continue;
          const notice = pushNotice(source, sub.lead);
          if (!notice) continue;
          key = notice.signature;
          if (!(await rpc("claim_lesson_push", { subscription: sub.id, key })))
            continue;
          // Re-read current sources just before dispatch; no future schedule queue can go stale.
          const latestSource = await rpc("push_source", {
              subscription: sub.id,
            }),
            latest = latestSource ? pushNotice(latestSource, sub.lead) : null;
          if (!latest || latest.signature !== key) {
            await rpc("finish_lesson_push", {
              subscription: sub.id,
              key,
              result_state: "invalidated",
              error_message: null,
            });
            continue;
          }
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth_key },
            },
            JSON.stringify(latest),
            {
              TTL: Math.min(
                60,
                Math.max(1, Math.floor((latest.expiresAt - Date.now()) / 1000)),
              ),
              urgency: "high",
              timeout: 8000,
            },
          );
          await rpc("finish_lesson_push", {
            subscription: sub.id,
            key,
            result_state: "sent",
            error_message: null,
          });
          sent++;
        } catch (error) {
          failed++;
          const expired = error.statusCode === 404 || error.statusCode === 410;
          await rpc("finish_lesson_push", {
            subscription: sub.id,
            key,
            result_state: "failed",
            error_message: expired
              ? "브라우저 구독이 만료되었습니다. 다시 알림을 켜 주세요."
              : "최신 자료 확인 또는 푸시 전달에 실패했습니다.",
            disable: expired,
          });
        }
      }
      if (result.data.length < 100) break;
    }
    await rpc("lesson_push_heartbeat", {
      error_message: failed
        ? `${failed}개 구독의 알림 처리를 완료하지 못했습니다.`
        : null,
    });
    return Response.json({ sent, failed });
  } catch (error) {
    console.error(
      "lesson-push",
      stage,
      error instanceof Error && error.message.startsWith("rpc:")
        ? error.message
        : (error?.name ?? "unknown"),
    );
    try {
      await rpc("lesson_push_heartbeat", {
        error_message: "알림 서버 실행에 실패했습니다.",
      });
    } catch {}
    return Response.json(
      {
        error: "Dispatch failed",
        stage,
        code:
          error instanceof Error && error.message.startsWith("rpc:")
            ? error.message
            : "runtime_error",
      },
      { status: 500 },
    );
  }
});

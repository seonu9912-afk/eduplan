import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { currentLessonNotice } from "@/app/operations-actions";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const subscriptionId = q.get("subscriptionId");
  if (!z.uuid().safeParse(subscriptionId).success)
    return Response.json(
      { valid: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  const db = await createClient();
  const sub = await db.rpc("lesson_push_status", {
    target: q.get("workspaceId") ?? "",
  });
  const subscriptions = z
    .array(
      z.object({
        id: z.uuid(),
        enabled: z.boolean(),
        showDetails: z.boolean().optional(),
      }),
    )
    .safeParse(sub.data);
  if (
    sub.error ||
    !subscriptions.success ||
    !subscriptions.data.some((s) => s.id === subscriptionId && s.enabled)
  )
    return Response.json(
      { valid: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  const result = await currentLessonNotice({
    workspaceId: q.get("workspaceId"),
    year: Number(q.get("year")),
    lead: Number(q.get("lead")),
  });
  return Response.json(
    {
      valid:
        result.ok &&
        !!result.data &&
        result.data.signature === q.get("signature"),
      title:
        result.ok &&
        result.data &&
        subscriptions.data.find((s) => s.id === subscriptionId)?.showDetails
          ? result.data.title
          : "곧 수업이 시작됩니다. 앱에서 다음 수업을 확인하세요.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

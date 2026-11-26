import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const q = Object.fromEntries(new URL(request.url).searchParams),
    input = z
      .object({ subscription: z.uuid(), notification: z.uuid() })
      .safeParse(q);
  const headers = { "Cache-Control": "no-store, private" };
  if (!input.success) return Response.json({ valid: false }, { headers });
  const db = await createClient(),
    r = await db.rpc("operation_push_notice", input.data);
  const notice = z
    .object({
      title: z.string(),
      body: z.string(),
      path: z.string().startsWith("/app/"),
    })
    .safeParse(r.data);
  return Response.json(
    r.error || !notice.success
      ? { valid: false }
      : { valid: true, ...notice.data },
    { headers },
  );
}

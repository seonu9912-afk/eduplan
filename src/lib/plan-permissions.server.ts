import "server-only";
import type { createClient } from "./supabase/server";
import type { PlanningDomain } from "./planning-completion";

export async function requirePlanPermission(
  db: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  domain: PlanningDomain,
) {
  const access = await db.rpc("planning_access", { target: workspaceId });
  if (access.error) throw access.error;
  if (!(access.data as Record<string, boolean>)?.[domain])
    throw Error("해당 업무의 편집 권한이 필요합니다.");
}

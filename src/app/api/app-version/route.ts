import { buildInfo } from "@/lib/build-info";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { commit: buildInfo.commit, id: buildInfo.id },
    { headers: { "Cache-Control": "no-store" } },
  );
}

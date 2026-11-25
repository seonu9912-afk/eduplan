import { currentLessonNotice } from "@/app/operations-actions";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { session } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const { db } = await session();
  const { data, error } = await db.rpc("personal_archive");
  const headers = { "Cache-Control": "private, no-store" };
  if (error) return Response.json({ error: "개인 자료를 읽지 못했습니다." }, { status: 500, headers });
  if (!data) return Response.json({ message: "보관된 개인 자료가 없습니다." }, { status: 404, headers });
  return Response.json(data, { headers: {
    ...headers,
    "Content-Disposition": 'attachment; filename="eduplan-personal-archive.json"',
  } });
}

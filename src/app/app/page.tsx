import { redirect } from "next/navigation";
import { session } from "@/lib/data";
export default async function AppIndex() {
  const { db, user } = await session();
  const [
    { data: profile, error: pError },
    { data: workspaces, error: wError },
  ] = await Promise.all([
    db
      .from("profiles")
      .select("default_workspace_id")
      .eq("id", user.id)
      .single(),
    db.from("workspaces").select("id").order("created_at"),
  ]);
  if (pError || wError || !workspaces?.length)
    throw new Error("작업공간을 불러오지 못했습니다. 다시 시도해 주세요.");
  const id =
    workspaces.find((w) => w.id === profile?.default_workspace_id)?.id ??
    workspaces[0].id;
  redirect(`/app/${id}/home`);
}

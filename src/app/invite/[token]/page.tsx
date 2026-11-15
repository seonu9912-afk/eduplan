import { redirect, notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { AcceptInvitation } from "@/components/features/workspace-forms";
import { createClient } from "@/lib/supabase/server";
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user)
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  return (
    <main id="main-content" className="invite-page">
      <Brand />
      <AcceptInvitation token={token} />
    </main>
  );
}

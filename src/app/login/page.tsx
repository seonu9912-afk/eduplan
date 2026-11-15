import { redirect } from "next/navigation";
import { safeNext } from "@/lib/domain";

// Preserve old bookmarks and authentication return paths while using one entry page.
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const q = await searchParams;
  const query = new URLSearchParams();
  if (q.next) query.set("next", safeNext(q.next));
  if (q.error) query.set("error", "confirmation");
  redirect(query.size ? `/?${query}` : "/");
}

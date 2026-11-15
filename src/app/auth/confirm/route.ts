import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (
    token_hash &&
    (type === "email" || type === "signup" || type === "recovery")
  ) {
    const db = await createClient();
    const { error } = await db.auth.verifyOtp({ token_hash, type });
    if (!error)
      return NextResponse.redirect(
        new URL(type === "recovery" ? "/reset-password" : "/app", request.url),
      );
  }
  return NextResponse.redirect(
    new URL("/login?error=confirmation", request.url),
  );
}

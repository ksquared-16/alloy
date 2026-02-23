import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** POST: send password reset email for the given address. Admin role only. No email enumeration. */
export async function POST(request: NextRequest) {
  const ctx = await getAdminContext();
  if (ctx instanceof NextResponse) return ctx;

  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (request.nextUrl ? `${request.nextUrl.origin}` : "");
  const redirectTo = baseUrl ? `${baseUrl.replace(/\/$/, "")}/reset-password` : "";

  if (!redirectTo) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is not set" },
      { status: 500 }
    );
  }

  try {
    const supabase = createAdminClient();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch (_) {
    // Do not leak success/failure (prevent enumeration)
  }

  return NextResponse.json({
    ok: true,
    message: "If an account exists for that email, a reset link has been sent.",
  });
}

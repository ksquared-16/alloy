import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

/** PATCH: update user role in org. Admin only. role must be a role_key from role_definitions for this org. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const ctx = await getAdminContextCached();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!role) {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: roleRow } = await supabase
    .from("role_definitions")
    .select("role_key")
    .eq("org_id", ctx.orgId)
    .eq("role_key", role)
    .eq("is_active", true)
    .maybeSingle();
  if (!roleRow) {
    return NextResponse.json({ error: "Invalid or inactive role for this org" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_roles")
    .update({ role })
    .eq("user_id", userId)
    .eq("org_id", ctx.orgId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

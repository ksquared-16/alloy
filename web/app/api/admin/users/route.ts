import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  role: string;
  created_at: string;
};

/** GET: list org members. Admin only. */
export async function GET() {
  const ctx = await getAdminContext();
  if (ctx instanceof NextResponse) return ctx;

  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: rows, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("org_id", ctx.orgId)
    .order("user_id", { ascending: true });

  if (rolesError) {
    return NextResponse.json({ error: rolesError.message }, { status: 500 });
  }

  const list = (rows ?? []) as { user_id: string; role: string }[];
  const result: AdminUserRow[] = [];

  for (const row of list) {
    let email: string | null = null;
    let created_at = "";

    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(row.user_id);
      if (authUser?.user) {
        email = authUser.user.email ?? null;
        created_at = (authUser.user as { created_at?: string }).created_at ?? "";
      }
    } catch (_) {
      // User may be deleted from auth; still show row with null email
    }

    result.push({
      user_id: row.user_id,
      email,
      role: row.role ?? "",
      created_at,
    });
  }

  return NextResponse.json({ users: result });
}

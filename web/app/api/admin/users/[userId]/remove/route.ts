import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";

/** POST: remove user from org (delete user_roles row). Requires org admin or `settings.users_roles`. Does not delete auth.users. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const auth = await requireUsersRolesManageAuth();
  if (!auth.ok) return auth.response;
  const { orgId } = auth.access;

  const { userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("org_id", orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

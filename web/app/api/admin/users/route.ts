import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  role: string;
  created_at: string;
};

/** GET: list org members. Admin + ops can read. */
export async function GET() {
  const ctx = await getAdminContextCached();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

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

/** POST: invite user to org. Admin only. Body: { email, role } (role = role_key from role_definitions). */
export async function POST(request: Request) {
  const ctx = await getAdminContextCached();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { email?: string; role?: string } = {};
  try {
    body = (await request.json()) as { email?: string; role?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (!role) return NextResponse.json({ error: "role is required" }, { status: 400 });

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

  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`.trim() || undefined,
  });
  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }
  const user = inviteData?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Invite did not return a user" }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("user_roles").insert({
    org_id: ctx.orgId,
    user_id: user.id,
    role,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "User is already in this org" }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    user_id: user.id,
    email: user.email ?? email,
    role,
  });
}

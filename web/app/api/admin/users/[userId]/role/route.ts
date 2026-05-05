import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";

/**
 * PATCH: replace **all** role rows for this user in this org with a single role_key.
 * Multi-role personas (e.g. ops + regional_lead) must be re-added via seed or a future additive API.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

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

    const { data: roleRow } = await supabase.from("role_definitions").select("role_key").eq("org_id", access.orgId).eq("role_key", role).eq("is_active", true).maybeSingle();
    if (!roleRow) {
        return NextResponse.json({ error: "Invalid or inactive role for this org" }, { status: 400 });
    }

    const { data: existing, error: exErr } = await supabase.from("user_roles").select("user_id").eq("user_id", userId).eq("org_id", access.orgId).limit(1);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if (!existing?.length) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("org_id", access.orgId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    const { data: inserted, error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, org_id: access.orgId, role }).select().single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    if (!inserted) return NextResponse.json({ error: "Failed to assign role" }, { status: 500 });

    const row = inserted as { user_id: string; org_id: string; role: string; created_at?: string };
    return NextResponse.json({
        ...row,
        role_keys: [role],
    });
}

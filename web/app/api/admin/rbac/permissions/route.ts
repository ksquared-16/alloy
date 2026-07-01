import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requirePortalOrUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";

/** GET: list active permissions. Portal (admin/ops) or Users & Roles managers. */
export async function GET() {
    const auth = await requirePortalOrUsersRolesManageAuth();
    if (!auth.ok) return auth.response;

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("permission_definitions")
        .select("key, group_key, label")
        .eq("is_active", true)
        .order("group_key", { ascending: true })
        .order("label", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const permissions = (rows ?? []).map((r) => ({
        key: (r as { key: string }).key,
        group_key: (r as { group_key: string }).group_key,
        label: (r as { label: string }).label,
    }));

    return NextResponse.json({ permissions });
}

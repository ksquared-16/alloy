import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list active customer_member_contact_roles for current org. Admin + ops can read. */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("customer_member_contact_roles")
        .select("id, role_key, role_label, sort_order")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("role_label", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const roles = (rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        role_key: r.role_key,
        role_label: r.role_label,
        sort_order: r.sort_order,
    }));

    return NextResponse.json({ roles });
}

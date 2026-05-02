import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

/** GET: list active customer_member_relationship_types for current org. Admin + ops can read. */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("customer_member_relationship_types")
        .select("key, label")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const options = (rows ?? []).map((r: Record<string, unknown>) => ({
        key: String(r.key ?? ""),
        label: String(r.label ?? ""),
    }));

    return NextResponse.json({ options });
}

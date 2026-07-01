import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

/** GET: list location types for current org. Admin + ops can read. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("include_inactive") === "true";

    const supabase = createAdminClient();
    let q = supabase
        .from("location_types")
        .select("id, key, label, position, is_active")
        .eq("org_id", ctx.orgId)
        .order("position", { ascending: true })
        .order("label", { ascending: true });

    if (!includeInactive) {
        q = q.eq("is_active", true);
    }

    const { data: rows, error } = await q;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const location_types = (rows ?? []).map((r) => ({
        id: (r as { id: string }).id,
        key: (r as { key: string }).key,
        label: (r as { label: string }).label,
        position: (r as { position: number }).position,
        is_active: (r as { is_active: boolean }).is_active,
    }));

    return NextResponse.json({ location_types });
}

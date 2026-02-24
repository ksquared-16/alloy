import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list locations for current org (dropdowns). Admin + ops. is_active only by default. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
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
        .from("locations")
        .select("id, label, address1, city, state, postal_code, customer_id, is_primary, is_active")
        .eq("org_id", ctx.orgId)
        .order("is_primary", { ascending: false })
        .order("label", { ascending: true });

    if (!includeInactive) {
        q = q.eq("is_active", true);
    }

    const { data: rows, error } = await q;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const locations = (rows ?? []).map((r) => ({
        id: (r as { id: string }).id,
        label: (r as { label?: string | null }).label ?? null,
        address1: (r as { address1?: string | null }).address1 ?? null,
        city: (r as { city?: string | null }).city ?? null,
        state: (r as { state?: string | null }).state ?? null,
        postal_code: (r as { postal_code?: string | null }).postal_code ?? null,
        customer_id: (r as { customer_id: string }).customer_id,
        is_primary: (r as { is_primary: boolean }).is_primary,
        is_active: (r as { is_active: boolean }).is_active,
    }));

    return NextResponse.json({ locations });
}

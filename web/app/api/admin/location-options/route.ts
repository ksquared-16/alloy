import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

/** GET: list locations for org (id, label). Used by admin dropdowns e.g. Job drawer. */
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
        .from("locations")
        .select("id, label, address1, city, state, postal_code")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true)
        .order("label", { ascending: true, nullsFirst: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const locations = (rows ?? []).map((r) => {
        const label =
            (r as { label?: string | null }).label?.trim() ||
            [(r as { address1?: string | null }).address1, (r as { city?: string | null }).city, (r as { postal_code?: string | null }).postal_code]
                .filter(Boolean)
                .join(", ") ||
            (r as { id: string }).id;
        return {
            id: (r as { id: string }).id,
            label,
        };
    });

    return NextResponse.json({ locations });
}

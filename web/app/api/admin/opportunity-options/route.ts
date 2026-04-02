import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list opportunities for org, optionally filtered by customer_id. Query param customer_id optional. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id")?.trim() || null;

    const supabase = createAdminClient();
    let q = supabase
        .from("opportunities")
        .select("id, name, opportunity_number")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false });

    if (customerId) {
        q = q.eq("customer_id", customerId);
    }

    const { data: rows, error } = await q;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const opportunities = (rows ?? []).map((r) => {
        const row = r as { id: string; name?: string | null; opportunity_number?: number | string | null };
        const label = row.name?.trim() || row.id;
        const rawNum = row.opportunity_number;
        const n = rawNum != null && rawNum !== "" ? Number(rawNum) : null;
        return {
            id: row.id,
            label,
            record_number: n != null && Number.isFinite(n) ? n : null,
        };
    });

    return NextResponse.json({ opportunities });
}

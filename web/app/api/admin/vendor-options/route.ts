import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: vendor options for dropdowns (id, name). Admin/ops. Non-archived only when column exists. */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();
    let q = supabase
        .from("vendors")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .order("name", { ascending: true });

    const { data: rows, error } = await q;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ vendors: rows ?? [] });
}

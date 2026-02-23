import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list vendors for current org. Admin/ops. Used for assign-vendor dropdown etc. */
export async function GET() {
    const ctx = await getAdminContext();
    if (ctx instanceof NextResponse) return ctx;

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("vendors")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .order("name");

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ vendors: rows ?? [] });
}

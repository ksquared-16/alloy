import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list customers for org (id, name). Used by admin dropdowns. */
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
        .from("customers")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .order("name", { ascending: true, nullsFirst: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const customers = (rows ?? []).map((r) => ({
        id: (r as { id: string }).id,
        name: (r as { name: string | null }).name ?? null,
    }));

    return NextResponse.json(customers);
}

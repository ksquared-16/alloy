import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list customers for org (id, name, status_key). Used by admin dropdowns e.g. Job create. */
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
        .select("id, name, status_key, customer_number")
        .eq("org_id", ctx.orgId)
        .order("name", { ascending: true, nullsFirst: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const customers = (rows ?? []).map((r) => {
        const row = r as { id: string; name: string | null; status_key?: string | null; customer_number?: unknown };
        const n = row.customer_number != null && row.customer_number !== "" ? Number(row.customer_number) : null;
        return {
            id: row.id,
            name: row.name ?? null,
            status_key: row.status_key ?? null,
            record_number: n != null && Number.isFinite(n) ? n : null,
        };
    });

    return NextResponse.json({ customers });
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

/** GET: list active permissions. Admin + ops can read. */
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
        .from("permission_definitions")
        .select("key, group_key, label")
        .eq("is_active", true)
        .order("group_key", { ascending: true })
        .order("label", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const permissions = (rows ?? []).map((r) => ({
        key: (r as { key: string }).key,
        group_key: (r as { group_key: string }).group_key,
        label: (r as { label: string }).label,
    }));

    return NextResponse.json({ permissions });
}

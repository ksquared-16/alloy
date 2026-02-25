import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list active industries (for config UI). Admin + ops can read. */
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
        .from("industries")
        .select("id, key, label")
        .eq("is_active", true)
        .order("label", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const industries = (rows ?? []).map((r) => ({
        id: (r as { id: string }).id,
        key: (r as { key: string }).key,
        label: (r as { label: string }).label,
    }));

    return NextResponse.json({ industries });
}

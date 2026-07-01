import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

/** GET: list service frequency options for admin dropdowns (e.g. job create/edit). From pricing_frequencies. */
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
        .from("pricing_frequencies")
        .select("frequency_key, frequency_label, is_recurring")
        .order("frequency_label", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const frequencies = (rows ?? []).map((r) => ({
        key: String((r as { frequency_key?: string }).frequency_key ?? ""),
        label: String((r as { frequency_label?: string | null }).frequency_label ?? (r as { frequency_key?: string }).frequency_key ?? ""),
        is_recurring: Boolean((r as { is_recurring?: boolean }).is_recurring),
    }));

    return NextResponse.json({ frequencies });
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";

/** GET: list vendor statuses for admin dropdown (id, key, label). */
export async function GET() {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("vendor_statuses")
            .select("id, key, label")
            .order("position", { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data ?? []);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export type PricingModeListItem = {
    id: string;
    mode_key: string | null;
    mode_name: string | null;
    is_active: boolean;
    updated_at: string | null;
    created_at: string;
};

/** GET: list pricing_modes */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("pricing_modes")
        .select("id, mode_key, mode_name, updated_at, created_at")
        .order("mode_key", { ascending: true, nullsFirst: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const list = (rows ?? []) as { id: string; mode_key?: string | null; mode_name?: string | null; updated_at?: string | null; created_at?: string }[];
    const items: PricingModeListItem[] = list.map((r) => ({
        id: r.id,
        mode_key: r.mode_key ?? null,
        mode_name: r.mode_name ?? null,
        is_active: true,
        updated_at: r.updated_at ?? null,
        created_at: r.created_at ?? "",
    }));
    return NextResponse.json({ pricing_modes: items });
}

/** POST: create pricing_mode. Body: mode_key, mode_name, is_active?. org_id set from admin context. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    if (!ctx.orgId) return NextResponse.json({ error: "Organization context required" }, { status: 403 });

    let body: { mode_key?: string; mode_name?: string; is_active?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const mode_key = typeof body.mode_key === "string" ? body.mode_key.trim() || null : null;
    const mode_name = typeof body.mode_name === "string" ? body.mode_name.trim() || null : null;
    if (!mode_key && !mode_name) return NextResponse.json({ error: "mode_key or mode_name required" }, { status: 400 });

    const supabase = createAdminClient();
    const insert: Record<string, unknown> = {
        org_id: ctx.orgId,
        mode_key: mode_key ?? mode_name,
        mode_name: mode_name ?? mode_key,
    };
    const { data, error } = await supabase.from("pricing_modes").insert(insert).select("id, mode_key, mode_name, is_active, created_at, updated_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? {});
}
